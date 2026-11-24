import { z } from 'zod';
import { paginationSchema } from '../../../common/pagination.js';
import { ProductStatus } from '../entities/product.entity.js';

const flag = z.enum(['true', 'false']).transform((v) => v === 'true');

export const listProductsSchema = paginationSchema.extend({
  size: z.coerce.number().int().min(1).max(100).default(20),
  /** Comma-separated product ids, e.g. a wishlist. At most 100. */
  ids: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.uuid()).max(100))
    .optional(),
  /** Storefront filters. */
  newArrival: flag.optional(),
  recommended: flag.optional(),
  /** Diamond cut, matched anywhere in the field (e.g. "cushion cut"). */
  diamondType: z.string().trim().max(60).optional(),
  /** Only honoured for admins; everyone else sees active products. */
  status: z.enum(ProductStatus).optional(),
  categoryId: z.uuid().optional(),
  /** Category slug, e.g. "rings". */
  category: z.string().trim().max(140).optional(),
  q: z.string().trim().max(100).refine((v) => v.length === 0 || v.length >= 3, 'Type at least 3 characters to search').optional(),
  /** Admin: false = only price-on-request products, true = only priced ones. */
  priced: flag.optional(),
});

export const featuredProductsSchema = z.object({
  perCategory: z.coerce.number().int().min(1).max(6).default(2),
});
export type FeaturedProductsQuery = z.infer<typeof featuredProductsSchema>;

export type ListProductsQuery = z.infer<typeof listProductsSchema>;
