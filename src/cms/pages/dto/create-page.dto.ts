import { z } from 'zod';
import { slugSchema } from '../../../catalog/categories/dto/create-category.dto.js';
import { PageStatus } from '../entities/page.entity.js';

export const createPageSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().max(200_000).default(''),
  blocks: z.array(z.record(z.string(), z.unknown())).max(200).default([]),
  seoTitle: z.string().max(200).nullish(),
  seoDescription: z.string().max(400).nullish(),
  status: z.enum(PageStatus).default(PageStatus.DRAFT),
});

export type CreatePageDto = z.infer<typeof createPageSchema>;
