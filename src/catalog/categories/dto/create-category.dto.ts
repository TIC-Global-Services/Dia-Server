import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes');

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema.optional(),
  description: z.string().max(5000).nullish(),
  imageUrl: z.url().max(500).nullish(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  parentId: z.uuid().nullish(),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
