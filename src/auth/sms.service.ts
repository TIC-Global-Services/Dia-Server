import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SettingsService } from '../settings/settings.service.js';

/** OTPFlow sends to Indian mobiles only: +91 followed by 10 digits starting 6-9. */
const INDIAN_MOBILE = /^\+91([6-9]\d{9})$/;

/**
 * Delivers one-time codes by SMS through OTPFlow. We generate and check the code ourselves;
 * OTPFlow only delivers it. In development without a key the code is logged so the flow can be
 * tried locally. In production without a key it refuses, it never "pretends" to send.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly settings: SettingsService) {}

  /** `phone` is E.164, e.g. +919876543210. `ttlMinutes` is how long OTPFlow keeps the code alive (5-120). */
  async sendCode(phone: string, code: string, ttlMinutes = 5): Promise<void> {
    const number = INDIAN_MOBILE.exec(phone)?.[1];
    if (!number) {
      throw new BadRequestException('Only Indian mobile numbers (+91) are supported for codes');
    }
    const apiKey = this.settings.get('OTPFLOW_API_KEY');
    if (!apiKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException('SMS is not configured');
      }
      this.logger.warn(`[dev sms] code for ${phone}: ${code}`);
      return;
    }
    const response = await fetch('https://otpflow.in/send-otp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      // We pass our own code and check it ourselves, so OTPFlow's verify endpoint is never used.
      body: JSON.stringify({ number, purpose: 'login', ttl: ttlMinutes, otp: code }),
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => {
      this.logger.error(`OTPFlow request failed: ${String(err)}`);
      throw new ServiceUnavailableException('Could not send SMS');
    });
    if (response.ok) return;

    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    this.logger.error(`OTPFlow rejected the message: ${response.status} ${body.error ?? ''} ${body.message ?? ''}`);
    if (response.status === 422) throw new BadRequestException('That phone number is not valid');
    if (response.status === 429) {
      throw new HttpException('Too many codes requested, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
    // 401 bad key, 402 empty wallet, 403 suspended, 502 carrier refused: nothing the customer can fix.
    throw new ServiceUnavailableException('Could not send SMS');
  }
}
