import {
  AuthenticationStorage,
  type EmailTokenPurpose,
  type EmailTokenRecord,
  type EmailTokenStore,
  type RefreshTokenRecord,
  type RefreshTokenStore,
  type SessionRecord,
  type SessionStore,
} from '@nestjs/authentication';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual } from 'typeorm';
import {
  AuthEmailToken,
  AuthRefreshToken,
  AuthRevokedFamily,
  AuthSession,
} from './entities/auth-tokens.entity.js';

/** jsonb columns: TypeORM's insert typing rejects `null`/arbitrary objects, so narrow it once here. */
const json = (value: unknown): never => (value ?? null) as never;

/**
 * Postgres-backed storage for the authentication package, so refresh tokens,
 * reset links and sessions survive restarts and work across instances.
 * Every "exactly once" rule in the package contracts is one conditional write.
 */
@Injectable()
export class AuthenticationStore
  implements RefreshTokenStore, EmailTokenStore, SessionStore
{
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({
      refreshTokens: this,
      emailTokens: this,
      sessions: this,
    });
  }

  // --- refresh tokens ---

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const row = await this.db.getRepository(AuthRefreshToken).findOneBy({ id });
    if (!row) return undefined;
    return {
      id: row.id,
      familyId: row.familyId,
      userId: row.userId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      familyExpiresAt: row.familyExpiresAt,
      usedAt: row.usedAt ?? undefined,
      claims: row.claims ?? undefined,
    };
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await this.db.getRepository(AuthRefreshToken).insert({
      ...record,
      usedAt: record.usedAt ?? null,
      claims: json(record.claims),
    });
    // Keep the table bounded: dead families, and revocations nobody can present anymore.
    await this.db
      .getRepository(AuthRefreshToken)
      .delete({ familyExpiresAt: LessThanOrEqual(record.createdAt) });
    await this.db.query(
      `DELETE FROM auth_revoked_families r
       WHERE r."revokedAt" < now() - interval '1 day'
         AND NOT EXISTS (SELECT 1 FROM auth_refresh_tokens t WHERE t."familyId" = r."familyId")`,
    );
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    const { affected } = await this.db
      .createQueryBuilder()
      .update(AuthRefreshToken)
      .set({ usedAt: at })
      .where('id = :id AND "usedAt" IS NULL', { id })
      .execute();
    return (affected ?? 0) > 0;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.db
      .createQueryBuilder()
      .insert()
      .into(AuthRevokedFamily)
      .values({ familyId })
      .orIgnore()
      .execute();
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    return this.db.getRepository(AuthRevokedFamily).existsBy({ familyId });
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO auth_revoked_families ("familyId")
       SELECT DISTINCT "familyId" FROM auth_refresh_tokens WHERE "userId" = $1
       ON CONFLICT DO NOTHING`,
      [userId],
    );
  }

  // --- email tokens ---

  async saveEmailToken(record: EmailTokenRecord): Promise<void> {
    await this.db.getRepository(AuthEmailToken).insert({
      ...record,
      fingerprint: record.fingerprint ?? null,
    });
    await this.db
      .getRepository(AuthEmailToken)
      .delete({ expiresAt: LessThanOrEqual(record.createdAt) });
  }

  async consumeEmailToken(
    id: string,
    purpose: EmailTokenPurpose,
  ): Promise<EmailTokenRecord | undefined> {
    const result = await this.db
      .createQueryBuilder()
      .delete()
      .from(AuthEmailToken)
      .where('id = :id AND purpose = :purpose', { id, purpose })
      .returning('*')
      .execute();
    const row = (result.raw as AuthEmailToken[])[0];
    if (!row) return undefined;
    return {
      id: row.id,
      purpose: row.purpose as EmailTokenPurpose,
      userId: row.userId,
      email: row.email,
      fingerprint: row.fingerprint ?? undefined,
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt),
    };
  }

  async deleteUserEmailTokens(
    userId: string,
    purpose: EmailTokenPurpose,
  ): Promise<void> {
    await this.db.getRepository(AuthEmailToken).delete({ userId, purpose });
  }

  // --- sessions (bearer-only API: used by password reset to sign users out everywhere) ---

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const row = await this.db.getRepository(AuthSession).findOneBy({ id });
    return row ? this.toSession(row) : undefined;
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.db.getRepository(AuthSession).insert({
      ...record,
      mfa: json(record.mfa),
      metadata: json(record.metadata),
      extra: json(record.extra),
    });
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    await this.db.getRepository(AuthSession).update({ id }, { lastActiveAt });
  }

  async deleteSession(id: string): Promise<boolean> {
    const { affected } = await this.db
      .getRepository(AuthSession)
      .delete({ id });
    return (affected ?? 0) > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.db.getRepository(AuthSession).findBy({ userId });
    return rows.map((r) => this.toSession(r));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.getRepository(AuthSession).delete({ userId });
  }

  private toSession(row: AuthSession): SessionRecord {
    return {
      id: row.id,
      userId: row.userId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      lastActiveAt: row.lastActiveAt,
      mfa: (row.mfa as unknown as SessionRecord['mfa']) ?? undefined,
      metadata: row.metadata ?? undefined,
      extra: (row.extra as unknown as SessionRecord['extra']) ?? undefined,
    };
  }
}
