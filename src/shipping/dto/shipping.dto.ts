import { z } from 'zod';
import { ShipmentStatus } from '../entities/shipping.entity.js';

const code = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{2,40}$/);

export const createZoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  countries: z
    .array(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^([A-Z]{2}|\*)$/),
    )
    .min(1)
    .max(250),
  states: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  postalPrefixes: z
    .array(z.string().trim().min(1).max(12))
    .max(500)
    .default([]),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type CreateZoneDto = z.infer<typeof createZoneSchema>;

export const updateZoneSchema = z.object({
  name: createZoneSchema.shape.name.optional(),
  countries: createZoneSchema.shape.countries.optional(),
  states: createZoneSchema.shape.states.unwrap().optional(),
  postalPrefixes: createZoneSchema.shape.postalPrefixes.unwrap().optional(),
  priority: createZoneSchema.shape.priority.unwrap().optional(),
  isActive: createZoneSchema.shape.isActive.unwrap().optional(),
});
export type UpdateZoneDto = z.infer<typeof updateZoneSchema>;

export const createRateSchema = z
  .object({
    code,
    name: z.string().trim().min(1).max(120),
    carrier: z.string().trim().max(60).nullish(),
    baseMinor: z.number().int().min(0),
    perKgMinor: z.number().int().min(0).default(0),
    freeOverMinor: z.number().int().min(0).nullish(),
    maxWeightGrams: z.number().int().positive().nullish(),
    minDays: z.number().int().min(0).max(90).default(3),
    maxDays: z.number().int().min(0).max(90).default(7),
    isActive: z.boolean().default(true),
  })
  .refine((r) => r.minDays <= r.maxDays, {
    message: 'minDays must be <= maxDays',
    path: ['maxDays'],
  });
export type CreateRateDto = z.infer<typeof createRateSchema>;

export const updateRateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  carrier: z.string().trim().max(60).nullish(),
  baseMinor: z.number().int().min(0).optional(),
  perKgMinor: z.number().int().min(0).optional(),
  freeOverMinor: z.number().int().min(0).nullish(),
  maxWeightGrams: z.number().int().positive().nullish(),
  minDays: z.number().int().min(0).max(90).optional(),
  maxDays: z.number().int().min(0).max(90).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateRateDto = z.infer<typeof updateRateSchema>;

export const createShipmentSchema = z.object({
  carrier: z.string().trim().min(1).max(60),
  trackingNumber: z.string().trim().min(1).max(120),
  trackingUrl: z.url().max(500).nullish(),
  /** Omit to ship everything still unshipped. */
  items: z
    .array(
      z.object({
        orderItemId: z.uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1)
    .optional(),
});
export type CreateShipmentDto = z.infer<typeof createShipmentSchema>;

export const updateShipmentStatusSchema = z.object({
  status: z.enum(ShipmentStatus),
  note: z.string().max(500).optional(),
});
export type UpdateShipmentStatusDto = z.infer<
  typeof updateShipmentStatusSchema
>;
