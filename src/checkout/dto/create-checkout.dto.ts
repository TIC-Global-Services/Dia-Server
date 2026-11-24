import { z } from 'zod';
import { addressFields } from '../../addresses/dto/create-address.dto.js';
import { emailSchema } from '../../auth/dto/auth.dto.js';

/** Enough to price shipping before the customer has typed a full address. */
export const quoteAddressSchema = z.object({
  country: z.string().length(2).toUpperCase().default('IN'),
  state: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(3).max(12),
});

export const quoteSchema = z
  .object({
    cartId: z.uuid(),
    /** A saved address of the signed-in customer. */
    addressId: z.uuid().optional(),
    address: quoteAddressSchema.optional(),
    /** Shipping rate code, e.g. "standard". Omit to see the options. */
    shippingRate: z.string().trim().toLowerCase().max(40).optional(),
    /** Overrides the coupon stored on the cart. */
    couponCode: z.string().trim().max(40).optional(),
    /** Guests: lets "first order only" offers be checked. */
    email: emailSchema.optional(),
  })
  .refine((q) => q.addressId || q.address, {
    message: 'Provide addressId or address',
    path: ['address'],
  });
export type QuoteDto = z.infer<typeof quoteSchema>;

export const checkoutSchema = z
  .object({
    cartId: z.uuid(),
    addressId: z.uuid().optional(),
    /** Full delivery address, for guests or a one-off address. */
    shippingAddress: addressFields.optional(),
    shippingRate: z.string().trim().toLowerCase().min(1).max(40),
    couponCode: z.string().trim().max(40).optional(),
    /** Required for guests; signed-in customers default to their account email. */
    email: emailSchema.optional(),
    /** One of GET /payments/providers. */
    paymentProvider: z.string().min(1).max(30),
  })
  .refine((c) => c.addressId || c.shippingAddress, {
    message: 'Provide addressId or shippingAddress',
    path: ['shippingAddress'],
  });
export type CheckoutDto = z.infer<typeof checkoutSchema>;
