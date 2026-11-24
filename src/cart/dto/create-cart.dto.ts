import { z } from 'zod';

export const addItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});
export type AddItemDto = z.infer<typeof addItemSchema>;

export const setQuantitySchema = z.object({
  /** 0 removes the line. */
  quantity: z.number().int().min(0).max(99),
});
export type SetQuantityDto = z.infer<typeof setQuantitySchema>;

export const couponSchema = z.object({
  code: z.string().trim().min(1).max(40),
});
export type CouponDto = z.infer<typeof couponSchema>;
