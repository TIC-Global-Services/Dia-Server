import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { Cart } from './cart.entity.js';

@Entity('cart_items')
@Check('"quantity" > 0')
export class CartItem {
  @PrimaryColumn('uuid')
  cartId: string;

  @PrimaryColumn('uuid')
  productId: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart: Relation<Cart>;

  @Column({ type: 'int' })
  quantity: number;
}
