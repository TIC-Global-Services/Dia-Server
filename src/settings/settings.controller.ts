import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { Mailer } from '@nestjs/mail';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { randomInt } from 'node:crypto';
import { SmsService } from '../auth/sms.service.js';
import { CurrentUser } from '@nestjs/authentication';
import type { User } from '../users/entities/user.entity.js';
import { SettingsService } from './settings.service.js';

const groupParam = z.string().regex(/^[a-z]{2,20}$/);
const valuesSchema = z.record(z.string().max(80), z.unknown());
const emailTest = z.object({ to: z.email() });
const smsTest = z.object({ to: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +919876543210') });

@ApiTags('settings')
@ApiBearerAuth()
@Can(PermissionPolicy, 'settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly mailer: Mailer,
    private readonly sms: SmsService,
  ) {}

  /** Every group with its current values. Secrets are never returned, only whether one is set. */
  @Get()
  list() {
    return this.settings.view();
  }

  @Patch(':group')
  update(
    @Param('group', { schema: groupParam }) group: string,
    @Body({ schema: valuesSchema }) values: Record<string, unknown>,
    @CurrentUser() user: User,
  ) {
    return this.settings.update(group, values, user.id);
  }

  @Post('email/test')
  @HttpCode(200)
  async testEmail(@Body({ schema: emailTest }) dto: z.infer<typeof emailTest>) {
    await this.mailer.send({
      to: dto.to,
      subject: 'Test email from Dia Diamonds',
      text: 'This is a test. If you can read it, email is set up correctly.',
      html: '<p>This is a test. If you can read it, email is set up correctly.</p>',
    });
    return { sent: true, live: Boolean(this.settings.get('RESEND_API_KEY')) };
  }

  @Post('sms/test')
  @HttpCode(200)
  async testSms(@Body({ schema: smsTest }) dto: z.infer<typeof smsTest>) {
    // A real code goes to that number, so the whole delivery path is exercised.
    await this.sms.sendCode(dto.to, String(randomInt(0, 1_000_000)).padStart(6, '0'));
    return { sent: true, live: Boolean(this.settings.get('OTPFLOW_API_KEY')) };
  }
}
