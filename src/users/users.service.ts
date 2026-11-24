import { PasswordHasher, PasswordResetService } from '@nestjs/authentication';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { rethrowDbError } from '../common/db-errors.js';
import { likeOf, paginateQb, type Paginated } from '../common/pagination.js';
import { canGrant } from '../roles/permissions.js';
import { RolesService } from '../roles/roles.service.js';
import type {
  AdminUpdateUserDto,
  CreateStaffDto,
  ListUsersQuery,
  UpdateProfileDto,
} from './dto/update-user.dto.js';
import { UserIdentity } from './entities/user-identity.entity.js';
import { User, UserRole, UserStatus } from './entities/user.entity.js';

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export interface NewUser {
  email?: string | null;
  emailVerified?: boolean;
  phone?: string | null;
  phoneVerified?: boolean;
  name?: string | null;
  passwordHash?: string | null;
  role?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserIdentity)
    private readonly identities: Repository<UserIdentity>,
    private readonly roles: RolesService,
    private readonly hasher: PasswordHasher,
    private readonly passwordReset: PasswordResetService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  /** Used on every authenticated request: suspended users stop working immediately. */
  async findActiveById(id: string): Promise<User | null> {
    const user = await this.users.findOneBy({ id, status: UserStatus.ACTIVE });
    return user;
  }

  /** `withPassword` also loads the hash, which is never selected otherwise. */
  findByEmail(email: string, withPassword = false): Promise<User | null> {
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.email = :email', { email: normalizeEmail(email) });
    if (withPassword) qb.addSelect('u.passwordHash');
    return qb.getOne();
  }

  async findByIdWithPassword(id: string): Promise<User> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.users.findOneBy({ phone });
  }

  findByIdentity(provider: string, subject: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .innerJoin(UserIdentity, 'i', 'i."userId" = u.id')
      .where('i.provider = :provider AND i.subject = :subject', {
        provider,
        subject,
      })
      .getOne();
  }

  async create(input: NewUser): Promise<User> {
    try {
      return await this.users.save(
        this.users.create({
          ...input,
          email: input.email ? normalizeEmail(input.email) : null,
        }),
      );
    } catch (err) {
      rethrowDbError(err, 'Email or phone is already registered');
    }
  }

  async linkIdentity(
    userId: string,
    provider: string,
    subject: string,
    email: string | null,
  ): Promise<void> {
    try {
      await this.identities.save({ userId, provider, subject, email });
    } catch (err) {
      rethrowDbError(err, `This ${provider} account is already linked`);
    }
  }

  listIdentities(userId: string) {
    return this.identities.find({ where: { userId } });
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    await this.users.update(id, dto);
    return this.findById(id);
  }

  async setPasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.users.update(id, { passwordHash });
  }

  async markEmailVerified(id: string, email: string): Promise<boolean> {
    const { affected } = await this.users.update(
      { id, email: normalizeEmail(email) },
      { emailVerified: true },
    );
    return (affected ?? 0) > 0;
  }

  async setVerifiedPhone(id: string, phone: string): Promise<User> {
    try {
      await this.users.update(id, { phone, phoneVerified: true });
    } catch (err) {
      rethrowDbError(err, 'Phone number is already registered');
    }
    return this.findById(id);
  }

  async touchLogin(id: string): Promise<void> {
    await this.users.update(id, { lastLoginAt: new Date() });
  }

  async list(query: ListUsersQuery): Promise<Paginated<User>> {
    const qb = this.users.createQueryBuilder('u');
    if (query.kind === 'staff') qb.andWhere('u.role <> :customer', { customer: UserRole.CUSTOMER });
    else if (query.kind === 'customers') qb.andWhere('u.role = :customer', { customer: UserRole.CUSTOMER });
    if (query.q) {
      qb.andWhere('(u.email ILIKE :like OR u.phone ILIKE :like OR u.name ILIKE :like)', { like: likeOf(query.q) });
    }
    return paginateQb(qb.clone().orderBy('u."createdAt"', 'DESC'), qb, query);
  }

  /** Shoppers with how much they have ordered. Orders that were never paid do not count toward spend. */
  async listCustomers(query: { q?: string; page: number; size: number }) {
    const page = await this.list({ ...query, kind: 'customers' });
    const ids = page.items.map((u) => u.id);
    const rows = ids.length
      ? ((await this.users.query(
          `SELECT "customerId" AS id, count(*)::int AS orders,
                  COALESCE(sum("totalMinor") FILTER (WHERE "paymentStatus" IN ('paid','partially_refunded','refunded')), 0)::bigint AS spent,
                  max("createdAt") AS last
             FROM orders WHERE "customerId" = ANY($1) GROUP BY "customerId"`,
          [ids],
        )) as { id: string; orders: number; spent: string; last: Date }[])
      : [];
    const by = new Map(rows.map((r) => [r.id, r]));
    return {
      ...page,
      items: page.items.map((u) =>
        Object.assign(u, {
          orderCount: by.get(u.id)?.orders ?? 0,
          spentMinor: Number(by.get(u.id)?.spent ?? 0),
          lastOrderAt: by.get(u.id)?.last ?? null,
        }),
      ),
    };
  }

  /** Everything support needs on one shopper: account, sign-in methods, addresses and order history. */
  async customerDetail(id: string) {
    const customer = await this.findById(id);
    if (customer.role !== UserRole.CUSTOMER) throw new NotFoundException('Customer not found');
    const [identities, addresses, orders] = await Promise.all([
      this.listIdentities(id),
      this.users.query(
        `SELECT id, label, "fullName", phone, line1, line2, landmark, city, state, "postalCode", country, "isDefault"
           FROM addresses WHERE "userId" = $1 ORDER BY "isDefault" DESC, "createdAt" DESC`,
        [id],
      ) as Promise<Record<string, unknown>[]>,
      this.users.query(
        `SELECT id, number, status, "paymentStatus", "totalMinor", currency, "createdAt"
           FROM orders WHERE "customerId" = $1 ORDER BY "createdAt" DESC LIMIT 20`,
        [id],
      ) as Promise<Record<string, unknown>[]>,
    ]);
    return {
      customer,
      identities: identities.map((i) => ({ provider: i.provider, email: i.email, createdAt: i.createdAt })),
      addresses,
      orders,
    };
  }

  /**
   * Permanently removes a shopper and their personal data: profile, sign-in methods, sessions,
   * addresses, cart and wishlist. Their orders stay for the shop's records, with the account
   * link cleared (each order keeps its own name, email and address).
   */
  async deleteCustomer(id: string): Promise<void> {
    const target = await this.findById(id);
    if (target.role !== UserRole.CUSTOMER) throw new ForbiddenException('Team accounts are managed under People');
    await this.users.manager.transaction(async (m) => {
      await m.query(`DELETE FROM auth_refresh_tokens WHERE "userId" = $1`, [id]);
      await m.query(`DELETE FROM auth_email_tokens WHERE "userId" = $1`, [id]);
      await m.query(`DELETE FROM auth_sessions WHERE "userId" = $1`, [id]);
      await m.query(`DELETE FROM addresses WHERE "userId" = $1`, [id]);
      await m.query(`DELETE FROM wishlist_items WHERE "customerId" = $1`, [id]);
      await m.query(`DELETE FROM cart_items WHERE "cartId" IN (SELECT id FROM carts WHERE "customerId" = $1)`, [id]);
      await m.query(`DELETE FROM carts WHERE "customerId" = $1`, [id]);
      await m.query(`UPDATE orders SET "customerId" = NULL WHERE "customerId" = $1`, [id]);
      await m.delete(User, { id });
    });
  }

  /** Support may block or restore a shopper; team accounts are managed under People. */
  async setCustomerStatus(id: string, status: UserStatus): Promise<User> {
    const target = await this.findById(id);
    if (target.role !== UserRole.CUSTOMER) throw new ForbiddenException('Team accounts are managed under People');
    await this.users.update(id, { status });
    return this.findById(id);
  }

  /** Adds a team member: with a password you choose, or by emailing them a link to set their own. */
  async createStaff(actor: User, dto: CreateStaffDto): Promise<User> {
    const role = await this.roles.assertStaffRole(dto.role);
    this.roles.assertGrantable(actor, role.permissions);
    if (await this.findByEmail(dto.email)) throw new ConflictException('Someone with this email already exists');
    const user = await this.create({
      email: dto.email,
      name: dto.name,
      role: role.key,
      // The person adding them vouches for the address; an emailed link also proves it.
      emailVerified: true,
      passwordHash: dto.password ? await this.hasher.hash(dto.password) : null,
    });
    if (!dto.password) this.passwordReset.request(dto.email);
    return user;
  }

  /** Sends (or re-sends) the link where a team member chooses a password. */
  async sendPasswordLink(actor: User, id: string): Promise<void> {
    const target = await this.findById(id);
    if (!target.email) throw new ConflictException('This person has no email address');
    await this.assertMayManage(actor, target);
    this.passwordReset.request(target.email);
  }

  async adminUpdate(actor: User, id: string, dto: AdminUpdateUserDto): Promise<User> {
    const target = await this.findById(id);
    await this.assertMayManage(actor, target);

    const losesAdmin = target.role === UserRole.ADMIN && ((dto.role !== undefined && dto.role !== UserRole.ADMIN) || dto.status === UserStatus.SUSPENDED);
    if (actor.id === id && ((dto.role !== undefined && dto.role !== target.role) || (dto.status && dto.status !== UserStatus.ACTIVE))) {
      throw new ForbiddenException('You cannot change your own role or suspend yourself');
    }
    if (losesAdmin && (await this.users.countBy({ role: UserRole.ADMIN, status: UserStatus.ACTIVE })) <= 1) {
      throw new ConflictException('There must always be one active Admin');
    }
    if (dto.role !== undefined && dto.role !== UserRole.CUSTOMER) {
      const role = await this.roles.assertStaffRole(dto.role);
      this.roles.assertGrantable(actor, role.permissions);
    }

    if (dto.role || dto.status || dto.name) await this.users.update(id, dto);
    return this.findById(id);
  }

  /** You may only manage people whose access is no greater than yours. */
  private async assertMayManage(actor: User, target: User): Promise<void> {
    if (!canGrant(actor, await this.roles.permissionsOf(target.role))) {
      throw new ForbiddenException('This person has more access than you, so only an Admin can change them');
    }
  }

  hasAdmin(): Promise<boolean> {
    return this.users.existsBy({ role: UserRole.ADMIN });
  }
}
