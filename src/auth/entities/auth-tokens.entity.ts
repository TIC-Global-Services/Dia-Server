import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Refresh token, keyed by the SHA-256 of the token. Each is single use; rotations share a family. */
@Entity('auth_refresh_tokens')
export class AuthRefreshToken {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Index()
  @Column({ length: 64 })
  familyId: string;

  @Index()
  @Column('uuid')
  userId: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Index()
  @Column({ type: 'timestamptz' })
  familyExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  claims: Record<string, unknown> | null;
}

/** A revoked family stays revoked for tokens saved after the revocation too. */
@Entity('auth_revoked_families')
export class AuthRevokedFamily {
  @PrimaryColumn({ length: 64 })
  familyId: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  revokedAt: Date;
}

/** Password reset / email verification link, keyed by the SHA-256 of the token. */
@Entity('auth_email_tokens')
export class AuthEmailToken {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ length: 30 })
  purpose: string;

  @Index()
  @Column('uuid')
  userId: string;

  @Column({ length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  fingerprint: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}

@Entity('auth_sessions')
export class AuthSession {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Index()
  @Column('uuid')
  userId: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  lastActiveAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  mfa: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  extra: Record<string, unknown> | null;
}
