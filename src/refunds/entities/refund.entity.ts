import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity.js';

export enum RefundStatus {
  /** Recorded, waiting for the provider. Counts against what is still refundable. */
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  /** Does not count: the money was not returned. */
  FAILED = 'failed',
}

export enum RefundReason {
  CUSTOMER_REQUEST = 'customer_request',
  ORDER_CANCELLED = 'order_cancelled',
  DAMAGED = 'damaged',
  WRONG_ITEM = 'wrong_item',
  OTHER = 'other',
}

@Entity('refunds')
export class Refund extends BaseEntity {
  @Index()
  @Column('uuid')
  orderId: string;

  @Index()
  @Column('uuid')
  paymentId: string;

  @Column({ type: 'int' })
  amountMinor: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: RefundReason })
  reason: RefundReason;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Index()
  @Column({ type: 'enum', enum: RefundStatus, default: RefundStatus.PENDING })
  status: RefundStatus;

  @Column({ length: 30 })
  provider: string;

  @Index()
  @Column({ type: 'varchar', length: 120, nullable: true })
  providerRefundId: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  /** Units put back in stock with this refund. */
  @Column({ type: 'jsonb', nullable: true })
  restocked: { orderItemId: string; quantity: number }[] | null;

  @Column({ type: 'uuid', nullable: true })
  initiatedBy: string | null;
}
