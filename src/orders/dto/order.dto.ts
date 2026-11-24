import { z } from 'zod';
import { paginationSchema } from '../../common/pagination.js';
import { OrderStatus, PaymentState } from '../entities/order.entity.js';

export const listOrdersSchema = paginationSchema;
export type ListOrdersQuery = z.infer<typeof listOrdersSchema>;

export const adminListOrdersSchema = paginationSchema.extend({
  status: z.enum(OrderStatus).optional(),
  paymentStatus: z.enum(PaymentState).optional(),
  /** Order number or customer email, partial. */
  q: z.string().trim().max(100).refine((v) => v.length === 0 || v.length >= 3, 'Type at least 3 characters to search').optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type AdminListOrdersQuery = z.infer<typeof adminListOrdersSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(60).default('customer_request'),
});
export type CancelOrderDto = z.infer<typeof cancelOrderSchema>;

export const payOrderSchema = z.object({
  paymentProvider: z.string().min(1).max(30),
});
export type PayOrderDto = z.infer<typeof payOrderSchema>;

/** Shipped and delivered come from shipments; the only manual step is starting to process. */
export const updateOrderStatusSchema = z.object({
  status: z.literal(OrderStatus.PROCESSING),
});
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;

export const addNoteSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});
export type AddNoteDto = z.infer<typeof addNoteSchema>;
