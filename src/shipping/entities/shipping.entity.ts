import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../common/base.entity.js';

/** Where an order can ship, matched by country, then optional states and postal-code prefixes. */
@Entity('shipping_zones')
export class ShippingZone extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  /** ISO 3166 alpha-2 codes, or "*" for anywhere. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  countries: string[];

  /** Empty = whole country. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  states: string[];

  /** Empty = any postal code. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  postalPrefixes: string[];

  /** The highest-priority matching zone wins, so put narrow zones above broad ones. */
  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ShippingRate, (rate) => rate.zone)
  rates: Relation<ShippingRate[]>;
}

/** One shipping option in a zone. Cost = base + perKg for each kg beyond the first; free over a threshold. */
@Entity('shipping_rates')
@Index(['zoneId', 'code'], { unique: true })
export class ShippingRate extends BaseEntity {
  @Column('uuid')
  zoneId: string;

  @ManyToOne(() => ShippingZone, (zone) => zone.rates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zoneId' })
  zone: Relation<ShippingZone>;

  /** Stable code the storefront sends, e.g. "standard", "express". */
  @Column({ length: 40 })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  carrier: string | null;

  @Column({ type: 'int' })
  baseMinor: number;

  @Column({ type: 'int', default: 0 })
  perKgMinor: number;

  @Column({ type: 'int', nullable: true })
  freeOverMinor: number | null;

  @Column({ type: 'int', nullable: true })
  maxWeightGrams: number | null;

  @Column({ type: 'int', default: 3 })
  minDays: number;

  @Column({ type: 'int', default: 7 })
  maxDays: number;

  @Column({ default: true })
  isActive: boolean;
}

export enum ShipmentStatus {
  LABEL_CREATED = 'label_created',
  IN_TRANSIT = 'in_transit',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  FAILED_ATTEMPT = 'failed_attempt',
  RETURNED = 'returned',
  CANCELLED = 'cancelled',
}

export interface ShipmentItem {
  orderItemId: string;
  quantity: number;
}

export interface ShipmentEvent {
  status: ShipmentStatus;
  at: string;
  note?: string;
}

@Entity('shipments')
export class Shipment extends BaseEntity {
  @Index()
  @Column('uuid')
  orderId: string;

  @Column({ length: 60 })
  carrier: string;

  @Index()
  @Column({ length: 120 })
  trackingNumber: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  trackingUrl: string | null;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.IN_TRANSIT,
  })
  status: ShipmentStatus;

  @Column({ type: 'jsonb' })
  items: ShipmentItem[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  events: ShipmentEvent[];

  @Column({ type: 'timestamptz', nullable: true })
  shippedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;
}
