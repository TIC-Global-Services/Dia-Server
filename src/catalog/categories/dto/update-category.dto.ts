import { z } from 'zod';
import { createCategorySchema } from './create-category.dto.js';

// partial() keeps defaults, which would silently reset fields on PATCH.
export const updateCategorySchema = createCategorySchema
  .omit({ isActive: true, sortOrder: true })
  .extend({
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .partial();

export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
