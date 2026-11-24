import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { slugify } from '../common/slug.js';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto.js';
import { Role } from './entities/role.entity.js';
import { BUILT_IN_ROLES, EVERYTHING, canGrant } from './permissions.js';

const CACHE_MS = 15_000;

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly cache = new Map<string, { permissions: string[]; at: number }>();

  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** The built-in roles always exist. Admin is forced back to "everything"; the others keep any edits. */
  async onModuleInit(): Promise<void> {
    for (const def of BUILT_IN_ROLES) {
      const existing = await this.roles.findOneBy({ key: def.key });
      if (!existing) await this.roles.save(this.roles.create({ ...def, builtIn: true }));
      else if (def.key === 'admin' && existing.permissions.join() !== EVERYTHING) {
        await this.roles.update(def.key, { permissions: [EVERYTHING], builtIn: true });
      }
    }
  }

  /** What a role allows. Shoppers ("customer") and unknown roles allow nothing. Cached briefly: it runs on every request. */
  async permissionsOf(roleKey: string): Promise<string[]> {
    if (roleKey === 'customer') return [];
    const hit = this.cache.get(roleKey);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.permissions;
    const role = await this.roles.findOneBy({ key: roleKey });
    const permissions = role?.permissions ?? [];
    this.cache.set(roleKey, { permissions, at: Date.now() });
    return permissions;
  }

  private listed: { at: number; value: Awaited<ReturnType<RolesService['load']>> } | null = null;

  /** The roles page asks often and the member counts barely move: serve a 10 second old copy. */
  async list() {
    if (this.listed && Date.now() - this.listed.at < 10_000) return this.listed.value;
    const value = await this.load();
    this.listed = { at: Date.now(), value };
    return value;
  }

  private async load() {
    const roles = await this.roles.find({ order: { builtIn: 'DESC', name: 'ASC' } });
    const counts = (await this.db.query(`SELECT role, count(*)::int AS n FROM users GROUP BY role`)) as { role: string; n: number }[];
    const byRole = new Map(counts.map((c) => [c.role, c.n]));
    return roles.map((r) => Object.assign(r, { people: byRole.get(r.key) ?? 0 }));
  }

  async findOne(key: string): Promise<Role> {
    const role = await this.roles.findOneBy({ key });
    if (!role) throw new NotFoundException(`Role ${key} not found`);
    return role;
  }

  async create(dto: CreateRoleDto, actor: { permissions?: string[] }): Promise<Role> {
    this.listed = null;
    this.assertGrantable(actor, dto.permissions);
    const key = slugify(dto.name).slice(0, 40);
    if (!key || key === 'customer' || key === 'admin') throw new BadRequestException('Choose another role name');
    if (await this.roles.existsBy({ key })) throw new ConflictException('A role with this name already exists');
    return this.roles.save(this.roles.create({ key, name: dto.name, description: dto.description ?? null, permissions: dto.permissions, builtIn: false }));
  }

  async update(key: string, dto: UpdateRoleDto, actor: { permissions?: string[] }): Promise<Role> {
    this.listed = null;
    const role = await this.findOne(key);
    if (key === 'admin') throw new ForbiddenException('The Admin role cannot be changed');
    // Removing a permission someone lacks is fine; adding one you do not hold is not.
    if (dto.permissions) {
      this.assertGrantable(actor, dto.permissions.filter((p) => !role.permissions.includes(p)));
    }
    Object.assign(role, {
      ...(dto.name && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description ?? null }),
      ...(dto.permissions && { permissions: dto.permissions }),
    });
    const saved = await this.roles.save(role);
    this.cache.delete(key);
    return saved;
  }

  async remove(key: string): Promise<void> {
    this.listed = null;
    const role = await this.findOne(key);
    if (role.builtIn) throw new ForbiddenException('Built-in roles cannot be deleted');
    const [{ n }] = (await this.db.query(`SELECT count(*)::int AS n FROM users WHERE role = $1`, [key])) as { n: number }[];
    if (n > 0) throw new ConflictException(`${n} ${n === 1 ? 'person has' : 'people have'} this role. Move them to another role first.`);
    await this.roles.delete({ key });
    this.cache.delete(key);
  }

  /** Is `key` a role that exists and gives access? */
  async assertStaffRole(key: string): Promise<Role> {
    if (key === 'customer') throw new BadRequestException('Pick a team role');
    return this.findOne(key);
  }

  /** Nobody can hand out access they do not hold themselves. */
  assertGrantable(actor: { permissions?: string[] }, permissions: string[]): void {
    if (!canGrant(actor, permissions)) {
      throw new ForbiddenException('You cannot give access you do not have yourself');
    }
  }
}
