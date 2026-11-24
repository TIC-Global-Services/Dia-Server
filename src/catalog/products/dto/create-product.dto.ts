import { z } from 'zod';
import { METALS } from '../../../common/jewellery-price.js';
import { slugSchema } from '../../categories/dto/create-category.dto.js';
import { ProductStatus } from '../entities/product.entity.js';

const money = z.number().nonnegative().max(9_999_999_999).multipleOf(0.01);

export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(20000).nullish(),
  /** Omit for price on request. */
  price: money.nullish(),
  compareAtPrice: money.nullish(),
  /** Net metal weight (g). When set, price is calculated from the metal rate and `price` is ignored. */
  netMetalWeight: z.number().positive().max(100_000).multipleOf(0.001).nullish(),
  metal: z.enum(METALS).default('gold'),
  diamondCarats: z.number().min(0).max(10_000).multipleOf(0.001).default(0),
  diamondRatePerCarat: money.default(0),
  makingChargePercent: z.number().min(0).max(100).multipleOf(0.01).default(0),
  stoneCharges: money.default(0),
  weightGrams: z.number().int().min(0).max(1_000_000).default(0),
  currency: z.string().length(3).toUpperCase().default('INR'),
  status: z.enum(ProductStatus).default(ProductStatus.DRAFT),
  images: z.array(z.url().max(500)).max(20).default([]),
  attributes: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  categoryId: z.uuid().nullish(),
  diamondType: z.string().trim().max(60).nullish(),
  tags: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  sizes: z.array(z.string().trim().min(1).max(30)).max(50).default([]),
  colors: z
    .array(z.object({ color: z.string().max(60), image: z.url().max(500) }))
    .max(30)
    .default([]),
  layoutImages: z
    .array(z.object({ position: z.string().max(20), image: z.url().max(500) }))
    .max(30)
    .default([]),
  isNewArrival: z.boolean().default(false),
  isNewCollection: z.boolean().default(false),
  isRecommended: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  /** Initial stock on hand. */
  initialStock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(0),
});

export type CreateProductDto = z.infer<typeof createProductSchema>;
