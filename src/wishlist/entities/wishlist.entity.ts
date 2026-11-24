import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { Product } from '../../catalog/products/entities/product.entity.js';

@Entity('wishlist_items')
export class WishlistItem {
  @PrimaryColumn('uuid')
  customerId: string;

  @PrimaryColumn('uuid')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
