import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity.js';

@Entity('addresses')
// At most one default address per user, enforced by the database.
@Index(['userId'], { unique: true, where: '"isDefault" = true' })
export class Address extends BaseEntity {
  @Index()
  @Column('uuid')
  userId: string;

  /** "Home", "Office"... */
  @Column({ type: 'varchar', length: 40, nullable: true })
  label: string | null;

  @Column({ length: 120 })
  fullName: string;

  @Column({ length: 20 })
  phone: string;

  @Column({ length: 200 })
  line1: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  line2: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  landmark: string | null;

  @Column({ length: 100 })
  city: string;

  @Column({ length: 100 })
  state: string;

  @Column({ length: 12 })
  postalCode: string;

  /** ISO 3166 alpha-2. */
  @Column({ length: 2, default: 'IN' })
  country: string;

  @Column({ default: false })
  isDefault: boolean;
}
