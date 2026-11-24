import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { rethrowDbError } from '../../common/db-errors.js';
import { likeOf, paginateQb, type Paginated } from '../../common/pagination.js';
import { slugify } from '../../common/slug.js';
import { RedisService } from '../../redis/redis.service.js';
import {
  PRODUCT_DELETED,
  PRODUCT_UPSERTED,
  type ProductDocument,
} from '../../search/product-document.js';
import { CategoriesService } from '../categories/categories.service.js';
import { Stock } from '../stock/entities/stock.entity.js';
import {
  StockMovement,
  StockMovementReason,
} from '../stock/entities/stock-movement.entity.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { ListProductsQuery } from './dto/list-products.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import { Product, ProductStatus } from './entities/product.entity.js';

const slugKey = (slug: string) => `products:slug:${slug}`;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly categories: CategoriesService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    if (dto.categoryId) await this.categories.findOne(dto.categoryId);
    const { initialStock, lowStockThreshold, ...fields } = dto;

    let productId: string;
    try {
      productId = await this.dataSource.transaction(async (manager) => {
        const product = await manager.save(
          manager.create(Product, {
            ...fields,
            slug: fields.slug ?? slugify(fields.name),
          }),
        );
        await manager.save(
          manager.create(Stock, {
            productId: product.id,
            onHand: initialStock,
            lowStockThreshold,
          }),
        );
        if (initialStock > 0) {
          await manager.save(
            manager.create(StockMovement, {
              productId: product.id,
              onHandDelta: initialStock,
              reason: StockMovementReason.RESTOCK,
              note: 'Initial stock',
            }),
          );
        }
        return product.id;
      });
    } catch (err) {
      rethrowDbError(err, 'Product sku or slug already exists');
    }

    const product = await this.findOne(productId);
    await this.publish(product);
    return product;
  }

  /** `admin` adds stock to each row and allows any status; the public only gets what is on sale. */
  async findAll(
    query: ListProductsQuery,
    admin: boolean,
  ): Promise<Paginated<Product>> {
    const status = admin ? query.status : ProductStatus.ACTIVE;
    const qb = this.repo.createQueryBuilder('p');
    if (status) qb.andWhere('p.status = :status', { status });
    // A slug is resolved to its id first (categories is tiny), so the list filters on the indexed column.
    const categoryId = query.category
      ? ((await this.categories.findBySlug(query.category).catch(() => null))?.id ?? null)
      : query.categoryId;
    if (query.category && !categoryId) return { items: [], total: 0, page: query.page, size: query.size };
    if (categoryId) qb.andWhere('p."categoryId" = :cid', { cid: categoryId });
    if (admin && query.priced !== undefined) qb.andWhere(query.priced ? 'p.price IS NOT NULL' : 'p.price IS NULL');
    if (query.q) qb.andWhere('(p.name ILIKE :like OR p.sku ILIKE :like)', { like: likeOf(query.q) });
    if (query.ids) {
      if (query.ids.length === 0) return { items: [], total: 0, page: query.page, size: query.size };
      qb.andWhere('p.id IN (:...ids)', { ids: query.ids });
    }
    if (query.newArrival !== undefined) qb.andWhere('p."isNewArrival" = :na', { na: query.newArrival });
    if (query.recommended !== undefined) qb.andWhere('p."isRecommended" = :rec', { rec: query.recommended });
    if (query.diamondType) qb.andWhere('p."diamondType" ILIKE :dt', { dt: likeOf(query.diamondType) });

    const data = qb
      .clone()
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.stock', 'stock')
      .orderBy('p."sortOrder"', 'ASC')
      .addOrderBy('p."createdAt"', 'DESC');
    const { items, total, capped } = await paginateQb(data, qb, query);
    // The public learns whether a piece can be bought, never how many are left.
    return {
      items: admin ? items : items.map(withoutStock),
      total,
      capped,
      page: query.page,
      size: query.size,
    };
  }

  /** The first `perCategory` products of every category, for the home page. One query, not one per category. */
  async featured(perCategory: number): Promise<Product[]> {
    const rows: { id: string }[] = await this.repo.query(
      `SELECT id FROM (
         SELECT id, row_number() OVER (PARTITION BY "categoryId" ORDER BY "sortOrder" ASC, "createdAt" DESC) AS rn
         FROM products WHERE status = $1 AND "categoryId" IS NOT NULL
       ) t WHERE rn <= $2`,
      [ProductStatus.ACTIVE, perCategory],
    );
    if (rows.length === 0) return [];
    const items = await this.repo.find({
      where: { id: In(rows.map((r) => r.id)) },
      relations: { category: true, stock: true },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    return items.map(withoutStock);
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.repo.findOne({
      where: { id },
      relations: { category: true, stock: true },
    });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  /** Product data is cached; stock is read fresh so availability is never stale. */
  async findBySlug(slug: string): Promise<Product> {
    const product = await this.redis.remember(slugKey(slug), async () => {
      const found = await this.repo.findOne({
        where: { slug },
        relations: { category: true },
      });
      if (!found) throw new NotFoundException(`Product ${slug} not found`);
      return found;
    });
    product.stock = await this.dataSource
      .getRepository(Stock)
      .findOneBy({ productId: product.id });
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const existing = await this.findOne(id);
    if (dto.categoryId) await this.categories.findOne(dto.categoryId);
    try {
      await this.repo.update(id, dto);
    } catch (err) {
      rethrowDbError(err, 'Product sku or slug already exists');
    }
    await this.redis.forget(slugKey(existing.slug));
    const product = await this.findOne(id);
    await this.publish(product);
    return product;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.repo.delete({ id });
    await this.redis.forget(slugKey(existing.slug));
    await this.events.emitAsync(PRODUCT_DELETED, { id });
  }

  /** All products as search documents, in batches. Used by the reindex job. */
  async *documents(batchSize = 500): AsyncGenerator<ProductDocument[]> {
    for (let skip = 0; ; skip += batchSize) {
      const batch = await this.repo.find({
        relations: { category: true, stock: true },
        order: { createdAt: 'ASC', id: 'ASC' },
        skip,
        take: batchSize,
      });
      if (batch.length === 0) return;
      yield batch.map((product) => this.toDocument(product));
    }
  }

  toDocument(product: Product): ProductDocument {
    const available = product.stock
      ? product.stock.onHand - product.stock.reserved
      : 0;
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      currency: product.currency,
      status: product.status,
      images: product.images,
      attributes: product.attributes,
      tags: product.tags,
      sizes: product.sizes,
      colors: product.colors,
      layoutImages: product.layoutImages,
      diamondType: product.diamondType,
      isNewArrival: product.isNewArrival,
      isNewCollection: product.isNewCollection,
      isRecommended: product.isRecommended,
      sortOrder: product.sortOrder,
      categoryId: product.categoryId,
      categorySlug: product.category?.slug ?? null,
      categoryName: product.category?.name ?? null,
      available,
      inStock: available > 0,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private publish(product: Product) {
    return this.events.emitAsync(PRODUCT_UPSERTED, this.toDocument(product));
  }
}

/** Public view of a product: an `inStock` flag in place of the stock counts. */
export function withoutStock(product: Product): Product {
  const inStock = product.stock ? product.stock.onHand - product.stock.reserved > 0 : false;
  return Object.assign(new Product(), product, { stock: undefined, inStock });
}
