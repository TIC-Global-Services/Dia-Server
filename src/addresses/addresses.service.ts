import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type {
  CreateAddressDto,
  UpdateAddressDto,
} from './dto/create-address.dto.js';
import { Address } from './entities/address.entity.js';

const MAX_ADDRESSES = 20;

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address) private readonly repo: Repository<Address>,
  ) {}

  list(userId: string): Promise<Address[]> {
    return this.repo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  /** Scoped by owner: someone else's address is a 404, never a 403. */
  async findOne(userId: string, id: string): Promise<Address> {
    const address = await this.repo.findOneBy({ id, userId });
    if (!address) throw new NotFoundException(`Address ${id} not found`);
    return address;
  }

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    return this.repo.manager.transaction(async (m) => {
      // Serialise one user's writes so the cap and the single default hold under concurrency.
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `addresses:${userId}`,
      ]);
      const count = await m.countBy(Address, { userId });
      if (count >= MAX_ADDRESSES)
        throw new ConflictException(`At most ${MAX_ADDRESSES} addresses`);
      const makeDefault = dto.isDefault || count === 0;
      if (makeDefault) await this.clearDefault(m, userId);
      return m.save(
        m.create(Address, { ...dto, userId, isDefault: makeDefault }),
      );
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    const address = await this.findOne(userId, id);
    return this.repo.save(this.repo.merge(address, dto));
  }

  async setDefault(userId: string, id: string): Promise<Address> {
    await this.findOne(userId, id);
    await this.repo.manager.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `addresses:${userId}`,
      ]);
      await this.clearDefault(m, userId);
      await m.update(Address, { id, userId }, { isDefault: true });
    });
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repo.manager.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `addresses:${userId}`,
      ]);
      const address = await m.findOneBy(Address, { id, userId });
      if (!address) throw new NotFoundException(`Address ${id} not found`);
      await m.delete(Address, { id });
      if (address.isDefault) {
        // Promote the newest remaining address so the user always has a default.
        const next = await m.findOne(Address, {
          where: { userId },
          order: { createdAt: 'DESC' },
        });
        if (next) await m.update(Address, { id: next.id }, { isDefault: true });
      }
    });
  }

  private clearDefault(m: EntityManager, userId: string) {
    return m.update(Address, { userId, isDefault: true }, { isDefault: false });
  }
}
