import { z } from 'zod';
import { RefundReason } from '../entities/refund.entity.js';

export const createRefundSchema = z.object({
  /** Omit to refund everything still refundable. */
  amountMinor: z.number().int().positive().optional(),
  reason: z.enum(RefundReason).default(RefundReason.CUSTOMER_REQUEST),
  note: z.string().trim().max(1000).nullish(),
  /** Returned goods to put back on the shelf. */
  restock: z
    .array(
      z.object({
        orderItemId: z.uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .max(100)
    .optional(),
});
export type CreateRefundDto = z.infer<typeof createRefundSchema>;
