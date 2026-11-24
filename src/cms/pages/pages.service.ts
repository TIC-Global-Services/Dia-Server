import { defined } from '../../common/where.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { rethrowDbError } from '../../common/db-errors.js';
import type { Paginated } from '../../common/pagination.js';
import { RedisService } from '../../redis/redis.service.js';
import type { CreatePageDto } from './dto/create-page.dto.js';
import type { ListPagesQuery, UpdatePageDto } from './dto/update-page.dto.js';
import { Page, PageStatus } from './entities/page.entity.js';

const slugKey = (slug: string) => `cms:page:${slug}`;

@Injectable()
export class PagesService {
  constructor(
    @InjectRepository(Page) private readonly repo: Repository<Page>,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreatePageDto): Promise<Page> {
    try {
      return await this.repo.save(
        this.repo.create({
          ...dto,
          publishedAt: dto.status === PageStatus.PUBLISHED ? new Date() : null,
        }),
      );
    } catch (err) {
      rethrowDbError(err, 'Page slug already exists');
    }
  }

  async findAll(query: ListPagesQuery): Promise<Paginated<Page>> {
    const [items, total] = await this.repo.findAndCount({
      where: defined({ status: query.status }),
      order: { updatedAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    return { items, total, page: query.page, size: query.size };
  }

  async findOne(id: string): Promise<Page> {
    const page = await this.repo.findOneBy({ id });
    if (!page) throw new NotFoundException(`Page ${id} not found`);
    return page;
  }

  /** Public read: published pages only, cached. */
  findPublishedBySlug(slug: string): Promise<Page> {
    return this.redis.remember(slugKey(slug), async () => {
      const page = await this.repo.findOneBy({
        slug,
        status: PageStatus.PUBLISHED,
      });
      if (!page) throw new NotFoundException(`Page ${slug} not found`);
      return page;
    });
  }

  async update(id: string, dto: UpdatePageDto): Promise<Page> {
    const page = await this.findOne(id);
    const oldSlug = page.slug;
    this.repo.merge(page, dto);
    if (dto.status === PageStatus.PUBLISHED && !page.publishedAt) {
      page.publishedAt = new Date();
    }
    try {
      const saved = await this.repo.save(page);
      await this.redis.forget(slugKey(oldSlug), slugKey(saved.slug));
      return saved;
    } catch (err) {
      rethrowDbError(err, 'Page slug already exists');
    }
  }

  async remove(id: string): Promise<void> {
    const page = await this.findOne(id);
    await this.repo.delete({ id });
    await this.redis.forget(slugKey(page.slug));
  }
}
