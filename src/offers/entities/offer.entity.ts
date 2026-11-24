import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/base.entity.js';

export enum OfferType {
  /** `value` = percent off, 1..100. */
  PERCENTAGE = 'percentage',
  /** `value` = amount off in minor units. */
  FIXED = 'fixed',
  /** Shipping becomes free. */
  FREE_SHIPPING = 'free_shipping',
}

export enum OfferScope {
  ALL = 'all',
  CATEGORIES = 'categories',
  PRODUCTS = 'products',
}

@Entity('offers')
export class Offer extends BaseEntity {
  @Column({ length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Coupon code the customer types, stored uppercase. Null for offers that only apply automatically. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  code: string | null;

  /** Applied without a code when it is the best eligible deal. */
  @Column({ default: false })
  autoApply: boolean;

  @Column({ type: 'enum', enum: OfferType })
  type: OfferType;

  @Column({ type: 'int', default: 0 })
  value: number;

  /** Cap for percentage offers, minor units. */
  @Column({ type: 'int', nullable: true })
  maxDiscountMinor: number | null;

  @Column({ type: 'int', default: 0 })
  minSubtotalMinor: number;

  @Column({ type: 'enum', enum: OfferScope, default: OfferScope.ALL })
  scope: OfferScope;

  /** Category or product ids, depending on `scope`. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  targetIds: string[];

  @Column({ default: false })
  firstOrderOnly: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  /** Total redemptions allowed. Null = unlimited. */
  @Column({ type: 'int', nullable: true })
  usageLimit: number | null;

  @Column({ type: 'int', nullable: true })
  perCustomerLimit: number | null;

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ default: true })
  isActive: boolean;

  /** Breaks ties between equal automatic discounts. */
  @Column({ type: 'int', default: 0 })
  priority: number;
}

@Entity('offer_redemptions')
@Index(['offerId', 'customerKey'])
export class OfferRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  offerId: string;

  /** User id, or the lowercased email for guests. */
  @Column({ length: 254 })
  customerKey: string;

  @Index({ unique: true })
  @Column('uuid')
  orderId: string;

  @Column({ type: 'int' })
  discountMinor: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** Set when the order is cancelled; the use is given back. */
  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date | null;
}
