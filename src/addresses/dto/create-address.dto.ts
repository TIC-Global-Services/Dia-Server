import { z } from 'zod';
import { phoneSchema } from '../../auth/dto/auth.dto.js';

export const addressFields = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullish(),
  landmark: z.string().trim().max(200).nullish(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(3).max(12),
  country: z.string().length(2).toUpperCase().default('IN'),
});

export const createAddressSchema = addressFields.extend({
  label: z.string().trim().max(40).nullish(),
  isDefault: z.boolean().default(false),
});
export type CreateAddressDto = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = z.object({
  fullName: addressFields.shape.fullName.optional(),
  phone: addressFields.shape.phone.optional(),
  line1: addressFields.shape.line1.optional(),
  line2: addressFields.shape.line2,
  landmark: addressFields.shape.landmark,
  city: addressFields.shape.city.optional(),
  state: addressFields.shape.state.optional(),
  postalCode: addressFields.shape.postalCode.optional(),
  country: z.string().length(2).toUpperCase().optional(),
  label: z.string().trim().max(40).nullish(),
});
export type UpdateAddressDto = z.infer<typeof updateAddressSchema>;
