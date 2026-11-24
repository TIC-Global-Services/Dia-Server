import { z } from 'zod';
import { OfferScope, OfferType } from '../entities/offer.entity.js';

const isoDate = z.iso.datetime({ offset: true });

export const offerFields = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullish(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,40}$/, '3-40 letters, digits, dash or underscore')
    .nullish(),
  autoApply: z.boolean().default(false),
  type: z.enum(OfferType),
  value: z.number().int().min(0).default(0),
  maxDiscountMinor: z.number().int().positive().nullish(),
  minSubtotalMinor: z.number().int().min(0).default(0),
  scope: z.enum(OfferScope).default(OfferScope.ALL),
  targetIds: z.array(z.uuid()).max(500).default([]),
  firstOrderOnly: z.boolean().default(false),
  startsAt: isoDate.nullish(),
  endsAt: isoDate.nullish(),
  usageLimit: z.number().int().positive().nullish(),
  perCustomerLimit: z.number().int().positive().nullish(),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(0),
});

type OfferInput = z.infer<typeof offerFields>;

/** Cross-field rules shared by create and update. */
export function checkOffer(o: Partial<OfferInput>, ctx: z.RefinementCtx): void {
  const bad = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  if (
    o.type === OfferType.PERCENTAGE &&
    !(o.value && o.value >= 1 && o.value <= 100)
  ) {
    bad('value', 'Percentage must be 1-100');
  }
  if (o.type === OfferType.FIXED && !(o.value && o.value > 0))
    bad('value', 'Fixed amount must be positive');
  if (
    o.scope &&
    o.scope !== OfferScope.ALL &&
    (o.targetIds?.length ?? 0) === 0
  ) {
    bad('targetIds', 'Pick at least one category or product');
  }
  if (!o.code && !o.autoApply && o.code !== undefined)
    bad('code', 'Needs a code or autoApply');
  if (o.startsAt && o.endsAt && new Date(o.startsAt) >= new Date(o.endsAt))
    bad('endsAt', 'endsAt must be after startsAt');
}

export const createOfferSchema = offerFields.superRefine(checkOffer);
export type CreateOfferDto = z.infer<typeof createOfferSchema>;
