import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity.js';

/**
 * One row per product. available = onHand - reserved.
 * Constraints keep the counters valid even under concurrent writers.
 */
@Entity('stock')
@Check('"onHand" >= 0')
@Check('"reserved" >= 0 AND "reserved" <= "onHand"')
export class Stock {
  @PrimaryColumn('uuid')
  productId: string;

  @OneToOne(() => Product, (product) => product.stock, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'int', default: 0 })
  onHand: number;

  @Column({ type: 'int', default: 0 })
  reserved: number;

  @Column({ type: 'int', default: 0 })
  lowStockThreshold: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
