import { z } from 'zod';

export const addWishlistSchema = z.object({ productId: z.uuid() });
export type AddWishlistDto = z.infer<typeof addWishlistSchema>;
