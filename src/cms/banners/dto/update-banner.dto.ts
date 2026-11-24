import { z } from 'zod';
import { isoDate } from './create-banner.dto.js';

export const updateBannerSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  subtitle: z.string().max(300).nullish(),
  imageUrl: z.url().max(500).optional(),
  mediaType: z.enum(['image', 'video']).optional(),
  videoUrl: z.url().max(500).nullish(),
  buttonLabel: z.string().trim().max(60).nullish(),
  linkUrl: z.string().max(500).nullish(),
  placement: z.string().trim().min(1).max(60).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  startsAt: isoDate.nullish(),
  endsAt: isoDate.nullish(),
});
export type UpdateBannerDto = z.infer<typeof updateBannerSchema>;

export const activeBannersSchema = z.object({
  placement: z.string().trim().min(1).max(60),
});
export type ActiveBannersQuery = z.infer<typeof activeBannersSchema>;
