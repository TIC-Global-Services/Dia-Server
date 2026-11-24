import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { rethrowDbError } from '../../common/db-errors.js';
import { slugify } from '../../common/slug.js';
import { RedisService } from '../../redis/redis.service.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Category } from './entities/category.entity.js';

const CACHE_ALL = 'categories:all';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) await this.findOne(dto.parentId);
    try {
      const category = await this.repo.save(
        this.repo.create({ ...dto, slug: dto.slug ?? slugify(dto.name) }),
      );
      await this.redis.forget(CACHE_ALL);
      return category;
    } catch (err) {
      rethrowDbError(err, 'Category slug already exists');
    }
  }

  findAll(): Promise<Category[]> {
    return this.redis.remember(CACHE_ALL, () =>
      this.repo.find({ order: { sortOrder: 'ASC', name: 'ASC' } }),
    );
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.repo.findOneBy({ id });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.repo.findOneBy({ slug });
    if (!category) throw new NotFoundException(`Category ${slug} not found`);
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      await this.assertNoCycle(id, dto.parentId);
    }
    try {
      const saved = await this.repo.save(this.repo.merge(category, dto));
      await this.redis.forget(CACHE_ALL);
      return saved;
    } catch (err) {
      rethrowDbError(err, 'Category slug already exists');
    }
  }

  async remove(id: string): Promise<void> {
    const { affected } = await this.repo.delete({ id });
    if (!affected) throw new NotFoundException(`Category ${id} not found`);
    await this.redis.forget(CACHE_ALL);
  }

  /** Walk up from the new parent; hitting `id` would create a loop. */
  private async assertNoCycle(id: string, parentId: string): Promise<void> {
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (cursor === id) {
        throw new BadRequestException('Category parent would create a cycle');
      }
      seen.add(cursor);
      const parent: Category = await this.findOne(cursor);
      cursor = parent.parentId;
    }
  }
}
