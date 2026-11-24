import { z } from 'zod';
import { paginationSchema } from '../../common/pagination.js';
import { checkOffer, offerFields } from './create-offer.dto.js';

const f = offerFields.shape;

// Defaults must not apply on PATCH, so each field is rebuilt without its default.
export const updateOfferSchema = z
  .object({
    name: f.name.optional(),
    description: f.description,
    code: f.code,
    autoApply: f.autoApply.unwrap().optional(),
    type: f.type.optional(),
    value: f.value.unwrap().optional(),
    maxDiscountMinor: f.maxDiscountMinor,
    minSubtotalMinor: f.minSubtotalMinor.unwrap().optional(),
    scope: f.scope.unwrap().optional(),
    targetIds: f.targetIds.unwrap().optional(),
    firstOrderOnly: f.firstOrderOnly.unwrap().optional(),
    startsAt: f.startsAt,
    endsAt: f.endsAt,
    usageLimit: f.usageLimit,
    perCustomerLimit: f.perCustomerLimit,
    isActive: f.isActive.unwrap().optional(),
    priority: f.priority.unwrap().optional(),
  })
  .superRefine(checkOffer);
export type UpdateOfferDto = z.infer<typeof updateOfferSchema>;

export const listOffersSchema = paginationSchema.extend({
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListOffersQuery = z.infer<typeof listOffersSchema>;
