import { z } from 'zod';
import { createProductSchema } from './create-product.dto.js';

// Stock is managed through the stock module, defaults must not apply on PATCH.
export const updateProductSchema = z.object({
  sku: createProductSchema.shape.sku.optional(),
  name: createProductSchema.shape.name.optional(),
  slug: createProductSchema.shape.slug,
  description: createProductSchema.shape.description,
  price: createProductSchema.shape.price,
  compareAtPrice: createProductSchema.shape.compareAtPrice,
  weightGrams: createProductSchema.shape.weightGrams.unwrap().optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  status: createProductSchema.shape.status.unwrap().optional(),
  images: createProductSchema.shape.images.unwrap().optional(),
  attributes: createProductSchema.shape.attributes.unwrap().optional(),
  categoryId: createProductSchema.shape.categoryId,
  diamondType: createProductSchema.shape.diamondType,
  tags: createProductSchema.shape.tags.unwrap().optional(),
  sizes: createProductSchema.shape.sizes.unwrap().optional(),
  colors: createProductSchema.shape.colors.unwrap().optional(),
  layoutImages: createProductSchema.shape.layoutImages.unwrap().optional(),
  isNewArrival: createProductSchema.shape.isNewArrival.unwrap().optional(),
  isNewCollection: createProductSchema.shape.isNewCollection
    .unwrap()
    .optional(),
  isRecommended: createProductSchema.shape.isRecommended.unwrap().optional(),
  sortOrder: createProductSchema.shape.sortOrder.unwrap().optional(),
});

export type UpdateProductDto = z.infer<typeof updateProductSchema>;
