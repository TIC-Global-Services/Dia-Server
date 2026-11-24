import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity.js';
import { PaymentStatus } from '../payment-provider.js';

@Entity('payments')
@Index(['provider', 'providerPaymentId'], { unique: true })
export class Payment extends BaseEntity {
  @Index()
  @Column('uuid')
  orderId: string;

  @Column({ length: 30 })
  provider: string;

  /** Provider-side id (Razorpay order id, Stripe PaymentIntent id...). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  providerPaymentId: string | null;

  /** Id used to refund, when the provider needs a different one (Razorpay payment id). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  providerChargeId: string | null;

  @Column({ type: 'int' })
  amountMinor: number;

  @Column({ length: 3 })
  currency: string;

  @Index()
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;
}
