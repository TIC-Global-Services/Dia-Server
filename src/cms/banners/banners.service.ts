import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { RedisService } from '../../redis/redis.service.js';
import type { CreateBannerDto } from './dto/create-banner.dto.js';
import type { UpdateBannerDto } from './dto/update-banner.dto.js';
import { Banner } from './entities/banner.entity.js';

const placementKey = (placement: string) => `cms:banners:${placement}`;
const ACTIVE_TTL_MS = 30_000;

type BannerInput = Partial<CreateBannerDto | UpdateBannerDto>;

/** DTO dates are ISO strings (JSON-schema friendly); columns want Date. */
function withDates<T extends BannerInput>(dto: T) {
  const toDate = (v?: string | null) => (v ? new Date(v) : v);
  return { ...dto, startsAt: toDate(dto.startsAt), endsAt: toDate(dto.endsAt) };
}

@Injectable()
export class BannersService {
  constructor(
    @InjectRepository(Banner) private readonly repo: Repository<Banner>,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateBannerDto): Promise<Banner> {
    const banner = await this.repo.save(this.repo.create(withDates(dto)));
    await this.redis.forget(placementKey(banner.placement));
    return banner;
  }

  findAll(): Promise<Banner[]> {
    return this.repo.find({
      order: { placement: 'ASC', sortOrder: 'ASC' },
    });
  }

  /** Public: active banners inside their schedule window, cached briefly. */
  findActive(placement: string): Promise<Banner[]> {
    return this.redis.remember(
      placementKey(placement),
      () => {
        const now = new Date();
        return this.repo.find({
          where: [
            { placement, isActive: true, startsAt: IsNull(), endsAt: IsNull() },
            {
              placement,
              isActive: true,
              startsAt: IsNull(),
              endsAt: MoreThan(now),
            },
            {
              placement,
              isActive: true,
              startsAt: LessThanOrEqual(now),
              endsAt: IsNull(),
            },
            {
              placement,
              isActive: true,
              startsAt: LessThanOrEqual(now),
              endsAt: MoreThan(now),
            },
          ],
          order: { sortOrder: 'ASC' },
        });
      },
      ACTIVE_TTL_MS,
    );
  }

  async findOne(id: string): Promise<Banner> {
    const banner = await this.repo.findOneBy({ id });
    if (!banner) throw new NotFoundException(`Banner ${id} not found`);
    return banner;
  }

  async update(id: string, dto: UpdateBannerDto): Promise<Banner> {
    const banner = await this.findOne(id);
    const oldPlacement = banner.placement;
    const saved = await this.repo.save(this.repo.merge(banner, withDates(dto)));
    await this.redis.forget(
      placementKey(oldPlacement),
      placementKey(saved.placement),
    );
    return saved;
  }

  async remove(id: string): Promise<void> {
    const banner = await this.findOne(id);
    await this.repo.delete({ id });
    await this.redis.forget(placementKey(banner.placement));
  }
}
