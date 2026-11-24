import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Order } from './order.entity.js';

/** Snapshot of the product at purchase time; later catalog edits never change it. */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  /** No FK: the product may be deleted later, the order must survive. */
  @Column('uuid')
  productId: string;

  @Column({ length: 64 })
  sku: string;

  @Column({ length: 200 })
  name: string;

  /** Photograph shown with the piece when it was bought. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  image: string | null;

  @Column({ type: 'int' })
  unitPriceMinor: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int' })
  lineTotalMinor: number;
}
