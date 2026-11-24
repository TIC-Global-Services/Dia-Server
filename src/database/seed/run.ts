import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import { AppModule } from '../../app.module.js';
import { Category } from '../../catalog/categories/entities/category.entity.js';
import {
  Product,
  ProductStatus,
} from '../../catalog/products/entities/product.entity.js';
import { Stock } from '../../catalog/stock/entities/stock.entity.js';
import { SearchService } from '../../search/search.service.js';

/**
 * Loads the storefront catalog (seed-data/products_new.json) into Postgres, then rebuilds the search index.
 *
 *   npm run seed                 add products that are not there yet; never touch existing ones
 *   npm run seed -- --force      also overwrite existing products with the file's values
 *   npm run seed -- path/to.json use another file
 *
 * Values are stored exactly as they are in the file. Products are matched by their original `id`.
 */

interface SeedProduct {
  id: number;
  category: string;
  productName: string;
  description: string;
  newArrival: boolean;
  newCollection: boolean;
  recommended: boolean;
  sizes: string[];
  tags: string[];
  colors: { color: string; image: string }[];
  layoutImages?: { position: string; image: string }[];
  slug: string;
  diamondType?: string;
  // Exported from MongoDB: either an ISO string or { $date: ISO string }.
  createdAt?: string | { $date: string };
  updatedAt?: string | { $date: string };
}

// Same order the storefront shows its categories in.
const CATEGORY_ORDER = [
  'rings',
  'earrings',
  'necklaces',
  'bracelets',
  'pendants',
];

function toDate(
  value: string | { $date: string } | undefined,
): Date | undefined {
  const date = new Date(
    typeof value === 'object' ? value.$date : (value ?? ''),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "…/ER14001-1-png-1773995546065.png" -> "ER14001". Falls back to DIA-<id>. */
function skuFor(p: SeedProduct): string {
  const fromImage = /\/([A-Z]{2,3}\d{3,6})-/.exec(
    p.colors[0]?.image ?? '',
  )?.[1];
  return fromImage ?? `DIA-${p.id}`;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const file =
    args.find((a) => !a.startsWith('--')) ??
    join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'seed-data',
      'products_new.json',
    );

  const products = JSON.parse(readFileSync(file, 'utf8')) as SeedProduct[];
  console.log(
    `Seeding ${products.length} products from ${file}${force ? ' (overwriting existing)' : ''}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const dataSource = app.get(DataSource);
    const result = await dataSource.transaction((m) =>
      seed(m, products, force),
    );
    console.log(
      `Categories: ${result.categories} created. Products: ${result.created} created, ` +
        `${result.updated} updated, ${result.skipped} left as they were.`,
    );

    try {
      const { indexed } = await app.get(SearchService).reindexAll();
      console.log(`Search index rebuilt: ${indexed} products.`);
    } catch (err) {
      console.warn(
        `Products are saved, but the search index was not rebuilt (${String(err)}). Run POST /search/reindex later.`,
      );
    }
  } finally {
    await app.close();
  }
}

async function seed(m: EntityManager, products: SeedProduct[], force: boolean) {
  // categories, in storefront order, then any extra ones in the file
  const slugs = [...new Set(products.map((p) => p.category))];
  slugs.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const categoryId = new Map<string, string>();
  let categories = 0;
  for (const [i, slug] of slugs.entries()) {
    let category = await m.findOneBy(Category, { slug });
    if (!category) {
      category = await m.save(
        m.create(Category, {
          name: titleCase(slug),
          slug,
          sortOrder: i,
          isActive: true,
        }),
      );
      categories++;
    }
    categoryId.set(slug, category.id);
  }

  const taken = new Set(
    (await m.find(Product, { select: { sku: true } })).map((p) => p.sku),
  );
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [index, p] of products.entries()) {
    const existing = await m.findOneBy(Product, { legacyId: p.id });
    if (existing && !force) {
      skipped++;
      continue;
    }

    const fields = {
      legacyId: p.id,
      sortOrder: index,
      name: p.productName,
      slug: p.slug,
      description: p.description,
      price: null,
      currency: 'INR',
      status: ProductStatus.ACTIVE,
      // The first image of each colour, in order: used wherever one picture is needed.
      images: p.colors.map((c) => c.image),
      attributes: {},
      tags: p.tags,
      sizes: p.sizes,
      colors: p.colors,
      layoutImages: p.layoutImages ?? [],
      diamondType: p.diamondType ?? null,
      isNewArrival: p.newArrival,
      isNewCollection: p.newCollection,
      isRecommended: p.recommended,
      categoryId: categoryId.get(p.category)!,
    };

    if (existing) {
      await m.update(Product, { id: existing.id }, fields);
      updated++;
      continue;
    }

    let sku = skuFor(p);
    if (taken.has(sku)) sku = `${sku}-${p.id}`; // two products sharing a code must still be distinct
    taken.add(sku);

    const row = await m.save(
      m.create(Product, {
        ...fields,
        sku,
        ...(toDate(p.createdAt) && { createdAt: toDate(p.createdAt) }),
        ...(toDate(p.updatedAt) && { updatedAt: toDate(p.updatedAt) }),
      }),
    );
    // Showroom pieces: no stock until the store enters some.
    await m.insert(Stock, {
      productId: row.id,
      onHand: 0,
      reserved: 0,
      lowStockThreshold: 0,
    });
    created++;
  }
  return { categories, created, updated, skipped };
}

await main();
