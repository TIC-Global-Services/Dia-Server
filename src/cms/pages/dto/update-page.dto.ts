import { z } from 'zod';
import { paginationSchema } from '../../../common/pagination.js';
import { createPageSchema } from './create-page.dto.js';

const shape = createPageSchema.shape;

export const updatePageSchema = z.object({
  slug: shape.slug.optional(),
  title: shape.title.optional(),
  content: shape.content.unwrap().optional(),
  blocks: shape.blocks.unwrap().optional(),
  seoTitle: shape.seoTitle,
  seoDescription: shape.seoDescription,
  status: shape.status.unwrap().optional(),
});
export type UpdatePageDto = z.infer<typeof updatePageSchema>;

export const listPagesSchema = paginationSchema.extend({
  status: shape.status.unwrap().optional(),
});
export type ListPagesQuery = z.infer<typeof listPagesSchema>;
