import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  type Relation,
} from 'typeorm';
import type { Metal } from '../../../common/jewellery-price.js';
import { BaseEntity } from '../../../common/base.entity.js';
import { Category } from '../../categories/entities/category.entity.js';
import { Stock } from '../../stock/entities/stock.entity.js';

export enum ProductStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

const numeric = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : Number(value),
};

@Entity('products')
export class Product extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  sku: string;

  @Column({ length: 200 })
  name: string;

  @Index({ unique: true })
  @Column({ length: 220 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Null = price on request (showroom pieces): such a product cannot be added to a cart. */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numeric,
  })
  price: number | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numeric,
  })
  compareAtPrice: number | null;

  /**
   * Metal pricing inputs. When netMetalWeight is set, `price` is derived:
   * F = (W*R + W*R*P/100 + carats*rate + S) * 1.03, with R the rate of `metal` from settings.
   * Null = fixed price.
   */
  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true, transformer: numeric })
  netMetalWeight: number | null;

  /** gold | silver | platinum: picks which rate in settings applies. */
  @Column({ type: 'varchar', length: 10, default: 'gold' })
  metal: Metal;

  /** Total diamond weight in carats. */
  @Column({ type: 'numeric', precision: 8, scale: 3, default: 0, transformer: numeric })
  diamondCarats: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numeric })
  diamondRatePerCarat: number;

  /** P: making charge, percent of the metal value. */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: numeric })
  makingChargePercent: number;

  /** Other stones, flat amount. */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numeric })
  stoneCharges: number;

  /** Id the product had in the original catalog file. Unique, so seeding is repeatable. */
  @Index({ unique: true })
  @Column({ type: 'int', nullable: true })
  legacyId: number | null;

  /** Position in the storefront listing. */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 60, nullable: true })
  diamondType: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  tags: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  sizes: string[];

  /** One entry per metal/colour variant, each with its own image. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  colors: { color: string; image: string }[];

  /** Editorial images for the product page (position: left | top | right | bottom). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  layoutImages: { position: string; image: string }[];

  @Column({ default: false })
  isNewArrival: boolean;

  @Column({ default: false })
  isNewCollection: boolean;

  @Column({ default: false })
  isRecommended: boolean;

  /** Shipping weight in grams. */
  @Column({ type: 'int', default: 0 })
  weightGrams: number;

  @Column({ length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  images: string[];

  /** Free-form attributes (color, size, material...). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  attributes: Record<string, string | number | boolean>;

  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Relation<Category> | null;

  @OneToOne(() => Stock, (stock) => stock.product)
  stock: Relation<Stock> | null;
}
