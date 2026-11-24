import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { jwtSecret } from './auth.constants.js';
import { SmsService } from './sms.service.js';

const CODE_TTL_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const HOURLY_LIMIT = 5;
const MAX_ATTEMPTS = 5;

interface OtpRecord {
  /** Keyed hash of the code; the code itself is never stored. */
  hash: string;
  attempts: number;
}

/** One-time codes for phone login, kept in Redis only as a keyed hash, never in clear. */
@Injectable()
export class OtpService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly sms: SmsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async request(
    phone: string,
  ): Promise<{ expiresInSeconds: number; resendInSeconds: number }> {
    if (await this.cache.get(`otp:cooldown:${phone}`)) {
      throw new HttpException(
        'Please wait before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const sent = (await this.cache.get<number>(`otp:hourly:${phone}`)) ?? 0;
    if (sent >= HOURLY_LIMIT) {
      throw new HttpException(
        'Too many codes requested, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Send first: a failed SMS must not burn the customer's cooldown.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.sms.sendCode(phone, code);
    const record: OtpRecord = { hash: this.hash(phone, code), attempts: 0 };
    await this.cache.set<OtpRecord>(`otp:${phone}`, record, CODE_TTL_MS);
    await this.cache.set(`otp:cooldown:${phone}`, 1, RESEND_COOLDOWN_MS);
    await this.cache.set(`otp:hourly:${phone}`, sent + 1, 60 * 60_000);
    return {
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendInSeconds: RESEND_COOLDOWN_MS / 1000,
    };
  }

  /** Throws unless the code is right. A code works once and allows a few wrong guesses. */
  async verify(phone: string, code: string): Promise<void> {
    const key = `otp:${phone}`;
    const record = await this.cache.get<OtpRecord>(key);
    if (!record) throw new BadRequestException('Code expired or not requested');

    if (record.attempts >= MAX_ATTEMPTS) {
      await this.cache.del(key);
      throw new HttpException(
        'Too many wrong codes, request a new one',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const given = Buffer.from(this.hash(phone, code));
    const expected = Buffer.from(record.hash);
    const right = given.length === expected.length && timingSafeEqual(given, expected);
    if (!right) {
      await this.cache.set<OtpRecord>(
        key,
        { ...record, attempts: record.attempts + 1 },
        CODE_TTL_MS,
      );
      throw new BadRequestException('Incorrect code');
    }
    await this.cache.del(key);
  }

  private hash(phone: string, code: string): string {
    return createHmac('sha256', jwtSecret(this.config))
      .update(`${phone}:${code}`)
      .digest('hex');
  }
}
