import { Client, errors } from '@elastic/elasticsearch';
import type { estypes } from '@elastic/elasticsearch';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { Env } from '../config/env.schema.js';
import { ProductsService } from '../catalog/products/products.service.js';
import {
  PRODUCT_DELETED,
  PRODUCT_UPSERTED,
  STOCK_CHANGED,
  type ProductDocument,
  type StockChangedEvent,
} from './product-document.js';
import type { SearchProductsQuery } from './dto/search-products.dto.js';

const SORTS: Record<string, estypes.Sort> = {
  newest: [{ createdAt: 'desc' }],
  price_asc: [{ price: 'asc' }, { createdAt: 'desc' }],
  price_desc: [{ price: 'desc' }, { createdAt: 'desc' }],
};

@Injectable()
export class SearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: Client;
  readonly productsIndex: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly products: ProductsService,
  ) {
    const username = config.get('ELASTICSEARCH_USERNAME', { infer: true });
    const password = config.get('ELASTICSEARCH_PASSWORD', { infer: true });
    this.client = new Client({
      node: config.get('ELASTICSEARCH_NODE', { infer: true }),
      auth: username && password ? { username, password } : undefined,
    });
    this.productsIndex = `${config.get('ELASTICSEARCH_INDEX_PREFIX', { infer: true })}-products`;
  }

  async onModuleInit(): Promise<void> {
    // Search being down must not stop the API from booting; /health reports it.
    try {
      await this.ensureIndex();
    } catch (err) {
      this.logger.warn(`Elasticsearch unavailable at startup: ${String(err)}`);
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.client.close();
  }

  async ping(): Promise<boolean> {
    return this.client.ping();
  }

  async ensureIndex(): Promise<void> {
    if (await this.client.indices.exists({ index: this.productsIndex })) return;
    await this.client.indices.create({
      index: this.productsIndex,
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: {
        dynamic: 'strict',
        properties: {
          id: { type: 'keyword' },
          sku: { type: 'keyword' },
          name: {
            type: 'text',
            analyzer: 'english',
            fields: { keyword: { type: 'keyword', ignore_above: 256 } },
          },
          slug: { type: 'keyword' },
          description: { type: 'text', analyzer: 'english' },
          price: { type: 'double' },
          compareAtPrice: { type: 'double' },
          currency: { type: 'keyword' },
          status: { type: 'keyword' },
          images: { type: 'keyword', index: false },
          attributes: { type: 'flattened' },
          tags: {
            type: 'text',
            fields: { keyword: { type: 'keyword', ignore_above: 256 } },
          },
          sizes: { type: 'keyword' },
          // Stored with the document for the storefront, not searchable.
          colors: { type: 'object', enabled: false },
          layoutImages: { type: 'object', enabled: false },
          diamondType: { type: 'keyword' },
          isNewArrival: { type: 'boolean' },
          isNewCollection: { type: 'boolean' },
          isRecommended: { type: 'boolean' },
          sortOrder: { type: 'integer' },
          categoryId: { type: 'keyword' },
          categorySlug: { type: 'keyword' },
          categoryName: {
            type: 'text',
            fields: { keyword: { type: 'keyword' } },
          },
          available: { type: 'integer' },
          inStock: { type: 'boolean' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
    });
    this.logger.log(`Created index ${this.productsIndex}`);
  }

  async searchProducts(query: SearchProductsQuery) {
    const filter: estypes.QueryDslQueryContainer[] = [
      { term: { status: query.status } },
    ];
    if (query.category) filter.push({ term: { categorySlug: query.category } });
    if (query.inStock !== undefined)
      filter.push({ term: { inStock: query.inStock } });
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.push({
        range: { price: { gte: query.minPrice, lte: query.maxPrice } },
      });
    }

    const must: estypes.QueryDslQueryContainer[] = query.q
      ? [
          {
            multi_match: {
              query: query.q,
              fields: ['name^3', 'sku^2', 'categoryName', 'description'],
              fuzziness: 'AUTO',
            },
          },
        ]
      : [{ match_all: {} }];

    const result = await this.client.search<ProductDocument>({
      index: this.productsIndex,
      from: (query.page - 1) * query.size,
      size: query.size,
      track_total_hits: true,
      query: { bool: { must, filter } },
      sort:
        query.q && query.sort === 'relevance'
          ? undefined
          : (SORTS[query.sort] ?? SORTS.newest),
      aggs: {
        categories: { terms: { field: 'categorySlug', size: 50 } },
        price: { stats: { field: 'price' } },
      },
    });

    const total =
      typeof result.hits.total === 'number'
        ? result.hits.total
        : (result.hits.total?.value ?? 0);
    const categoryAgg = result.aggregations?.categories as
      estypes.AggregationsStringTermsAggregate | undefined;
    const categoryBuckets = (categoryAgg?.buckets ??
      []) as estypes.AggregationsStringTermsBucket[];
    return {
      items: result.hits.hits.map((hit) => ({
        ...hit._source!,
        score: hit._score,
      })),
      total,
      page: query.page,
      size: query.size,
      facets: {
        categories: categoryBuckets.map((b) => ({
          slug: b.key,
          count: b.doc_count,
        })),
        price: result.aggregations?.price,
      },
    };
  }

  /** Rebuilds the whole index from Postgres. Use after an outage or mapping change. */
  async reindexAll(): Promise<{ indexed: number }> {
    await this.ensureIndex();
    let indexed = 0;
    for await (const batch of this.products.documents()) {
      const response = await this.client.bulk({
        refresh: false,
        operations: batch.flatMap((doc) => [
          { index: { _index: this.productsIndex, _id: doc.id } },
          doc,
        ]),
      });
      if (response.errors) {
        const failed = response.items.filter((i) => i.index?.error).length;
        throw new Error(`Bulk reindex failed for ${failed} documents`);
      }
      indexed += batch.length;
    }
    await this.client.indices.refresh({ index: this.productsIndex });
    return { indexed };
  }

  // Index sync is best-effort: Postgres stays the source of truth.

  @OnEvent(PRODUCT_UPSERTED)
  async onProductUpserted(doc: ProductDocument): Promise<void> {
    try {
      await this.client.index({
        index: this.productsIndex,
        id: doc.id,
        document: doc,
      });
    } catch (err) {
      this.logger.error(`Failed to index product ${doc.id}: ${String(err)}`);
    }
  }

  @OnEvent(PRODUCT_DELETED)
  async onProductDeleted({ id }: { id: string }): Promise<void> {
    try {
      await this.client.delete({ index: this.productsIndex, id });
    } catch (err) {
      if (err instanceof errors.ResponseError && err.statusCode === 404) return;
      this.logger.error(
        `Failed to delete product ${id} from index: ${String(err)}`,
      );
    }
  }

  @OnEvent(STOCK_CHANGED)
  async onStockChanged({
    productId,
    available,
  }: StockChangedEvent): Promise<void> {
    try {
      await this.client.update({
        index: this.productsIndex,
        id: productId,
        doc: { available, inStock: available > 0 },
        retry_on_conflict: 3,
      });
    } catch (err) {
      if (err instanceof errors.ResponseError && err.statusCode === 404) return;
      this.logger.error(
        `Failed to update stock for ${productId}: ${String(err)}`,
      );
    }
  }
}
