import { defined } from '../common/where.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { rethrowDbError } from '../common/db-errors.js';
import type { Paginated } from '../common/pagination.js';
import type { CreateOfferDto } from './dto/create-offer.dto.js';
import type {
  ListOffersQuery,
  UpdateOfferDto,
} from './dto/update-offer.dto.js';
import {
  Offer,
  OfferRedemption,
  OfferScope,
  OfferType,
} from './entities/offer.entity.js';

export interface PricingLine {
  productId: string;
  categoryId: string | null;
  quantity: number;
  unitPriceMinor: number;
}

export interface OfferContext {
  lines: PricingLine[];
  subtotalMinor: number;
  shippingMinor: number;
  /** User id, or lowercased email for guests. Null skips per-customer limits. */
  customerKey: string | null;
  /** Orders this customer already placed (not cancelled). */
  priorOrders: number;
}

export interface AppliedOffer {
  offerId: string;
  code: string | null;
  name: string;
  type: OfferType;
  discountMinor: number;
  shippingDiscountMinor: number;
}

class NotApplicable extends Error {}

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(Offer) private readonly offers: Repository<Offer>,
    @InjectRepository(OfferRedemption)
    private readonly redemptions: Repository<OfferRedemption>,
  ) {}

  // --- admin CRUD ---

  async create(dto: CreateOfferDto): Promise<Offer> {
    try {
      return await this.offers.save(this.offers.create(this.toColumns(dto)));
    } catch (err) {
      rethrowDbError(err, 'Offer code already exists');
    }
  }

  async findAll(query: ListOffersQuery): Promise<Paginated<Offer>> {
    const [items, total] = await this.offers.findAndCount({
      where: defined({ isActive: query.active }),
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    return { items, total, page: query.page, size: query.size };
  }

  async findOne(id: string): Promise<Offer> {
    const offer = await this.offers.findOneBy({ id });
    if (!offer) throw new NotFoundException(`Offer ${id} not found`);
    return offer;
  }

  async update(id: string, dto: UpdateOfferDto): Promise<Offer> {
    const offer = await this.findOne(id);
    try {
      return await this.offers.save(
        this.offers.merge(offer, this.toColumns(dto)),
      );
    } catch (err) {
      rethrowDbError(err, 'Offer code already exists');
    }
  }

  async remove(id: string): Promise<void> {
    // Redemptions are history; deactivate instead of deleting once an offer was used.
    const offer = await this.findOne(id);
    if (offer.usedCount > 0) {
      throw new ConflictException('Offer has been used, deactivate it instead');
    }
    await this.offers.delete({ id });
  }

  /** Public: automatic offers a storefront can advertise. */
  findAdvertised(): Promise<Offer[]> {
    return this.offers.find({
      where: { isActive: true, autoApply: true },
      order: { priority: 'DESC' },
    });
  }

  // --- pricing ---

  /**
   * With a code: that coupon must apply, otherwise a specific 400 explains why.
   * Without: the best automatic offer, or null.
   */
  async evaluate(
    ctx: OfferContext,
    code?: string | null,
  ): Promise<AppliedOffer | null> {
    if (code) {
      const offer = await this.offers.findOneBy({
        code: code.trim().toUpperCase(),
      });
      if (!offer) throw new BadRequestException('Invalid coupon code');
      try {
        return await this.apply(offer, ctx);
      } catch (err) {
        if (err instanceof NotApplicable)
          throw new BadRequestException(err.message);
        throw err;
      }
    }

    const candidates = await this.offers.find({
      where: { isActive: true, autoApply: true },
    });
    let best: { applied: AppliedOffer; priority: number } | null = null;
    for (const offer of candidates) {
      try {
        const applied = await this.apply(offer, ctx);
        const worth = applied.discountMinor + applied.shippingDiscountMinor;
        const bestWorth = best
          ? best.applied.discountMinor + best.applied.shippingDiscountMinor
          : -1;
        if (
          worth > bestWorth ||
          (worth === bestWorth && best && offer.priority > best.priority)
        ) {
          best = { applied, priority: offer.priority };
        }
      } catch (err) {
        if (!(err instanceof NotApplicable)) throw err;
      }
    }
    return best?.applied ?? null;
  }

  /**
   * Claims one use inside the order transaction. Two buyers racing for the last
   * use cannot both get it: the usage counter is one guarded UPDATE.
   */
  async redeem(
    applied: AppliedOffer,
    customerKey: string,
    orderId: string,
    manager: EntityManager,
  ): Promise<void> {
    // Serialise one customer's redemptions of one offer so the per-customer limit holds.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${applied.offerId}:${customerKey}`,
    ]);

    const offer = await manager.findOneByOrFail(Offer, { id: applied.offerId });
    if (offer.perCustomerLimit !== null) {
      const active = await this.activeUses(manager, offer.id, customerKey);
      if (active >= offer.perCustomerLimit) {
        throw new ConflictException(
          'You have already used this offer the maximum number of times',
        );
      }
    }

    const { affected } = await manager
      .createQueryBuilder()
      .update(Offer)
      .set({ usedCount: () => '"usedCount" + 1' })
      .where(
        'id = :id AND "isActive" = true AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")',
        { id: offer.id },
      )
      .execute();
    if (!affected)
      throw new ConflictException('This offer is no longer available');

    await manager.insert(OfferRedemption, {
      offerId: offer.id,
      customerKey,
      orderId,
      discountMinor: applied.discountMinor + applied.shippingDiscountMinor,
    });
  }

  /** Gives the use back when an order is cancelled. Idempotent. */
  async release(orderId: string, manager: EntityManager): Promise<void> {
    const result = await manager
      .createQueryBuilder()
      .update(OfferRedemption)
      .set({ releasedAt: () => 'now()' })
      .where('"orderId" = :orderId AND "releasedAt" IS NULL', { orderId })
      .returning('"offerId"')
      .execute();
    for (const row of result.raw as { offerId: string }[]) {
      await manager
        .createQueryBuilder()
        .update(Offer)
        .set({ usedCount: () => 'GREATEST("usedCount" - 1, 0)' })
        .where('id = :id', { id: row.offerId })
        .execute();
    }
  }

  // --- internals ---

  private async apply(offer: Offer, ctx: OfferContext): Promise<AppliedOffer> {
    const now = new Date();
    if (!offer.isActive) throw new NotApplicable('This offer is not active');
    if (offer.startsAt && offer.startsAt > now)
      throw new NotApplicable('This offer has not started yet');
    if (offer.endsAt && offer.endsAt <= now)
      throw new NotApplicable('This offer has expired');
    if (offer.usageLimit !== null && offer.usedCount >= offer.usageLimit) {
      throw new NotApplicable('This offer is fully redeemed');
    }
    if (offer.firstOrderOnly && ctx.priorOrders > 0) {
      throw new NotApplicable('This offer is only for your first order');
    }
    if (offer.perCustomerLimit !== null && ctx.customerKey) {
      const used = await this.activeUses(
        this.redemptions.manager,
        offer.id,
        ctx.customerKey,
      );
      if (used >= offer.perCustomerLimit)
        throw new NotApplicable('You have already used this offer');
    }

    const eligible = this.eligibleSubtotal(offer, ctx.lines);
    if (eligible <= 0)
      throw new NotApplicable(
        'This offer does not apply to the items in your cart',
      );
    if (ctx.subtotalMinor < offer.minSubtotalMinor) {
      throw new NotApplicable(
        `Spend at least ${offer.minSubtotalMinor / 100} to use this offer`,
      );
    }

    let discountMinor = 0;
    let shippingDiscountMinor = 0;
    if (offer.type === OfferType.PERCENTAGE) {
      discountMinor = Math.floor((eligible * offer.value) / 100);
      if (offer.maxDiscountMinor !== null)
        discountMinor = Math.min(discountMinor, offer.maxDiscountMinor);
    } else if (offer.type === OfferType.FIXED) {
      discountMinor = Math.min(offer.value, eligible);
    } else {
      shippingDiscountMinor = ctx.shippingMinor;
    }
    if (discountMinor + shippingDiscountMinor <= 0)
      throw new NotApplicable('This offer gives no discount here');

    return {
      offerId: offer.id,
      code: offer.code,
      name: offer.name,
      type: offer.type,
      discountMinor,
      shippingDiscountMinor,
    };
  }

  /** Redemptions that still count: cancelled orders give their use back. */
  private activeUses(
    manager: EntityManager,
    offerId: string,
    customerKey: string,
  ): Promise<number> {
    return manager
      .createQueryBuilder(OfferRedemption, 'r')
      .where(
        'r."offerId" = :offerId AND r."customerKey" = :customerKey AND r."releasedAt" IS NULL',
        {
          offerId,
          customerKey,
        },
      )
      .getCount();
  }

  private eligibleSubtotal(offer: Offer, lines: PricingLine[]): number {
    const targets = new Set(offer.targetIds);
    return lines
      .filter((l) => {
        if (offer.scope === OfferScope.ALL) return true;
        if (offer.scope === OfferScope.PRODUCTS)
          return targets.has(l.productId);
        return l.categoryId !== null && targets.has(l.categoryId);
      })
      .reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);
  }

  private toColumns(dto: CreateOfferDto | UpdateOfferDto) {
    const { startsAt, endsAt, ...rest } = dto;
    return {
      ...rest,
      ...(startsAt !== undefined && {
        startsAt: startsAt ? new Date(startsAt) : null,
      }),
      ...(endsAt !== undefined && { endsAt: endsAt ? new Date(endsAt) : null }),
    };
  }
}
