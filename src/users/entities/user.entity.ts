import { Column, Entity, Index, OneToMany, type Relation } from 'typeorm';
import { BaseEntity } from '../../common/base.entity.js';
import { UserIdentity } from './user-identity.entity.js';

/** Roles that always exist. Team roles live in the `roles` table; shoppers are "customer". */
export const UserRole = { CUSTOMER: 'customer', ADMIN: 'admin' } as const;

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Entity('users')
export class User extends BaseEntity {
  /** Stored lowercase. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  /** E.164, e.g. +919876543210. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16, nullable: true })
  phone: string | null;

  @Column({ default: false })
  phoneVerified: boolean;

  /** Never selected by default; load it explicitly where a password is checked. */
  @Column({ type: 'text', nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  /** "customer", or the key of a role in the `roles` table. */
  @Column({ type: 'varchar', length: 40, default: UserRole.CUSTOMER })
  role: string;

  /** What the role allows. Not stored: filled in on every authenticated request. */
  permissions?: string[];

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @OneToMany(() => UserIdentity, (identity) => identity.user)
  identities: Relation<UserIdentity[]>;
}
