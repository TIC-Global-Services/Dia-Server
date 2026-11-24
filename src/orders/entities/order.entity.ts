import { Column, Entity, Index, OneToMany, type Relation } from 'typeorm';
import { BaseEntity } from '../../common/base.entity.js';
import type { AppliedOffer } from '../../offers/offers.service.js';
import { OrderItem } from './order-item.entity.js';

export enum OrderStatus {
  /** Stock reserved, waiting for an online payment. */
  PENDING_PAYMENT = 'pending_payment',
  /** Paid, or placed with cash on delivery. Stock is committed. */
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum PaymentState {
  UNPAID = 'unpaid',
  PAID = 'paid',
  PARTIALLY_REFUNDED = 'partially_refunded',
  REFUNDED = 'refunded',
}

export interface ShippingAddress {
  name: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * All money on orders is integer minor units (paise/cents).
 * total = subtotal - discount + shipping - shippingDiscount.
 */
@Entity('orders')
export class Order extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 30 })
  number: string;

  @Column({ type: 'uuid', nullable: true })
  customerId: string | null;

  @Index()
  @Column({ length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'jsonb' })
  shippingAddress: ShippingAddress;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: 'int' })
  subtotalMinor: number;

  @Column({ type: 'int', default: 0 })
  discountMinor: number;

  @Column({ type: 'int', default: 0 })
  shippingMinor: number;

  @Column({ type: 'int', default: 0 })
  shippingDiscountMinor: number;

  @Column({ type: 'int' })
  totalMinor: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  couponCode: string | null;

  /** Snapshot of the offer that priced this order. */
  @Column({ type: 'jsonb', nullable: true })
  appliedOffer: AppliedOffer | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  shippingMethod: string | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING_PAYMENT,
  })
  status: OrderStatus;

  @Column({ type: 'enum', enum: PaymentState, default: PaymentState.UNPAID })
  paymentStatus: PaymentState;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  cancelReason: string | null;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: Relation<OrderItem[]>;
}
