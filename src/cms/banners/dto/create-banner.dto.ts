import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true });

export { isoDate };

export const createBannerSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().max(300).nullish(),
    imageUrl: z.url().max(500),
    mediaType: z.enum(['image', 'video']).default('image'),
    videoUrl: z.url().max(500).nullish(),
    buttonLabel: z.string().trim().max(60).nullish(),
    linkUrl: z.string().max(500).nullish(),
    placement: z.string().trim().min(1).max(60),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
    startsAt: isoDate.nullish(),
    endsAt: isoDate.nullish(),
  })
  .refine((b) => b.mediaType !== 'video' || Boolean(b.videoUrl), {
    message: 'Upload the video, or switch this banner to an image',
    path: ['videoUrl'],
  })
  .refine(
    (b) =>
      !b.startsAt || !b.endsAt || new Date(b.startsAt) < new Date(b.endsAt),
    {
      message: 'startsAt must be before endsAt',
      path: ['endsAt'],
    },
  );

export type CreateBannerDto = z.infer<typeof createBannerSchema>;
