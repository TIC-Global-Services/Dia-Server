import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jwtSecret } from '../auth/auth.constants.js';
import type { Env } from '../config/env.schema.js';
import { Setting } from './entities/setting.entity.js';
import { FIELD_BY_KEY, SETTING_GROUPS, type SettingField } from './settings.schema.js';

const REFRESH_MS = 15_000;

export interface FieldView {
  key: string;
  label: string;
  type: SettingField['type'];
  help?: string;
  placeholder?: string;
  /** Plain value for everything but secrets. */
  value: string | boolean | number | string[] | null;
  /** Secrets only: is one stored, and its last characters. */
  isSet?: boolean;
  hint?: string;
  /** Where the value in use comes from. */
  source: 'admin' | 'environment' | 'none';
}

/**
 * Settings edited in the back office, layered over the environment. Reads are synchronous and
 * come from memory (refreshed every few seconds and on every save), so providers can ask on each
 * request and see a change almost at once, on every instance.
 */
@Injectable()
export class SettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, { value: string; secret: boolean }>();
  private timer?: NodeJS.Timeout;
  private readonly key: Buffer;

  constructor(
    @InjectRepository(Setting) private readonly repo: Repository<Setting>,
    private readonly config: ConfigService<Env, true>,
  ) {
    // Secrets are encrypted with a key derived from SETTINGS_ENCRYPTION_KEY, or else the JWT secret.
    const base = process.env.SETTINGS_ENCRYPTION_KEY ?? jwtSecret(config);
    this.key = createHash('sha256').update(`dia-settings:${base}`).digest();
  }

  async onModuleInit(): Promise<void> {
    await this.reload();
    this.timer = setInterval(() => void this.reload().catch(() => undefined), REFRESH_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async reload(): Promise<void> {
    const rows = await this.repo.find();
    const next = new Map<string, { value: string; secret: boolean }>();
    for (const r of rows) {
      try {
        next.set(r.key, { value: r.secret ? this.decrypt(r.value) : r.value, secret: r.secret });
      } catch {
        this.logger.error(`Could not read setting ${r.key}: the encryption key has changed. Enter it again in the back office.`);
      }
    }
    this.cache = next;
  }

  // --- reading, for the rest of the app ---

  /** The value in use: the back-office override, else the environment. Empty counts as unset. */
  get(key: string): string | undefined {
    const own = this.cache.get(key)?.value;
    if (own !== undefined && own !== '') return own;
    const env = (this.config.get as (k: string) => unknown)(key);
    return typeof env === 'string' || typeof env === 'number' || typeof env === 'boolean' ? String(env) || undefined : undefined;
  }

  bool(key: string, fallback = false): boolean {
    const v = this.get(key);
    return v === undefined ? fallback : v === 'true';
  }

  number(key: string, fallback: number): number {
    const n = Number(this.get(key));
    return Number.isFinite(n) && this.get(key) !== undefined ? n : fallback;
  }

  // --- the back office ---

  view() {
    return SETTING_GROUPS.map((g) => ({
      ...g,
      sections: g.sections.map((s) => ({ ...s, fields: s.fields.map((f) => this.fieldView(f)) })),
    }));
  }

  private fieldView(f: SettingField): FieldView {
    const own = this.cache.get(f.key);
    const hasOwn = own !== undefined && own.value !== '';
    const value = this.get(f.key);
    const source = hasOwn ? 'admin' : value !== undefined ? 'environment' : 'none';
    const base = { key: f.key, label: f.label, type: f.type, help: f.help, placeholder: f.placeholder, source } as const;
    if (f.type === 'secret') {
      return { ...base, value: null, isSet: value !== undefined, hint: value ? `…${value.slice(-4)}` : undefined };
    }
    if (f.type === 'bool') return { ...base, value: value === undefined ? null : value === 'true' };
    if (f.type === 'number') return { ...base, value: value === undefined ? null : Number(value) };
    if (f.type === 'tags') return { ...base, value: value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [] };
    return { ...base, value: value ?? null };
  }

  /**
   * Save some fields. For a secret, `undefined` keeps what is stored and `null` or "" removes
   * the override (the environment value, if any, applies again).
   */
  async update(group: string, values: Record<string, unknown>, actorId: string): Promise<ReturnType<SettingsService['view']>> {
    const g = SETTING_GROUPS.find((x) => x.id === group);
    if (!g) throw new BadRequestException(`Unknown settings group ${group}`);
    const allowed = new Set(g.sections.flatMap((s) => s.fields.map((f) => f.key)));

    for (const [key, raw] of Object.entries(values)) {
      if (!allowed.has(key)) throw new BadRequestException(`${key} is not a setting in ${group}`);
      const field = FIELD_BY_KEY.get(key)!;
      if (raw === undefined) continue;
      const text = this.toText(field, raw);
      if (text === null) {
        await this.repo.delete({ key });
        continue;
      }
      const secret = field.type === 'secret';
      await this.repo.save({ key, value: secret ? this.encrypt(text) : text, secret, updatedBy: actorId });
    }
    await this.reload();
    return this.view();
  }

  private toText(field: SettingField, raw: unknown): string | null {
    if (raw === null || raw === '') return null;
    switch (field.type) {
      case 'bool':
        if (typeof raw !== 'boolean') throw new BadRequestException(`${field.label} must be on or off`);
        return String(raw);
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) throw new BadRequestException(`${field.label} must be a number`);
        return String(n);
      }
      case 'tags': {
        if (!Array.isArray(raw)) throw new BadRequestException(`${field.label} must be a list`);
        const list = [...new Set(raw.map((s) => String(s).trim()).filter(Boolean))];
        return list.length ? list.join(',') : null;
      }
      default:
        if (typeof raw !== 'string') throw new BadRequestException(`${field.label} must be text`);
        return raw.trim().slice(0, 500) || null;
    }
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
  }

  private decrypt(stored: string): string {
    const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
