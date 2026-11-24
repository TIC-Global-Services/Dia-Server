import { Column, Entity, Index, OneToMany, type Relation } from 'typeorm';
import { BaseEntity } from '../../common/base.entity.js';
import { CartItem } from './cart-item.entity.js';

export enum CartStatus {
  ACTIVE = 'active',
  CONVERTED = 'converted',
}

@Entity('carts')
export class Cart extends BaseEntity {
  /** Null for guest carts, which are addressed by their id alone. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  customerId: string | null;

  /** Coupon the customer applied; re-validated on every quote and at checkout. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  couponCode: string | null;

  @Column({ type: 'enum', enum: CartStatus, default: CartStatus.ACTIVE })
  status: CartStatus;

  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true })
  items: Relation<CartItem[]>;
}
