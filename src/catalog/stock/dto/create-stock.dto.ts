import { z } from 'zod';
import { StockMovementReason } from '../entities/stock-movement.entity.js';

export const adjustStockSchema = z.object({
  /** Positive to add, negative to remove. */
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, 'delta must not be 0'),
  reason: z
    .enum([
      StockMovementReason.RESTOCK,
      StockMovementReason.ADJUSTMENT,
      StockMovementReason.RETURN,
    ])
    .default(StockMovementReason.ADJUSTMENT),
  reference: z.string().max(120).nullish(),
  note: z.string().max(1000).nullish(),
});
export type AdjustStockDto = z.infer<typeof adjustStockSchema>;

const items = z
  .array(
    z.object({
      productId: z.uuid(),
      quantity: z.number().int().positive(),
    }),
  )
  .min(1)
  .max(100)
  .refine(
    (list) => new Set(list.map((i) => i.productId)).size === list.length,
    'duplicate productId',
  );

/** Reserve / release / commit a set of lines atomically (e.g. one order). */
export const stockLinesSchema = z.object({
  items,
  /** Order id or cart id, recorded in the movement ledger. */
  reference: z.string().min(1).max(120),
});
export type StockLinesDto = z.infer<typeof stockLinesSchema>;

export const updateThresholdSchema = z.object({
  lowStockThreshold: z.number().int().min(0),
});
export type UpdateThresholdDto = z.infer<typeof updateThresholdSchema>;
