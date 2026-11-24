import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum StockMovementReason {
  RESTOCK = 'restock',
  ADJUSTMENT = 'adjustment',
  RETURN = 'return',
  RESERVE = 'reserve',
  RELEASE = 'release',
  SALE = 'sale',
}

/** Append-only ledger of every stock change. */
@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  productId: string;

  /** Change applied to onHand. */
  @Column({ type: 'int', default: 0 })
  onHandDelta: number;

  /** Change applied to reserved. */
  @Column({ type: 'int', default: 0 })
  reservedDelta: number;

  @Column({ type: 'enum', enum: StockMovementReason })
  reason: StockMovementReason;

  /** Order id, PO number, etc. */
  @Index()
  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
