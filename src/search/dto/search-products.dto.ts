import { z } from 'zod';
import { paginationSchema } from '../../common/pagination.js';

export const searchProductsSchema = paginationSchema
  .extend({
    q: z.string().trim().max(200).optional(),
    /** Category slug. */
    category: z.string().max(140).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    inStock: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    sort: z
      .enum(['relevance', 'newest', 'price_asc', 'price_desc'])
      .default('relevance'),
    status: z.enum(['active']).default('active'),
  })
  .refine(
    (q) =>
      q.minPrice === undefined ||
      q.maxPrice === undefined ||
      q.minPrice <= q.maxPrice,
    { message: 'minPrice must be <= maxPrice', path: ['minPrice'] },
  );

export type SearchProductsQuery = z.infer<typeof searchProductsSchema>;
