import {
  AuthenticationRegistry,
  EmailVerificationHandler,
  PasswordResetHandler,
  type EmailVerificationLink,
  type PasswordResetAccount,
  type PasswordResetLink,
} from '@nestjs/authentication';
import { Injectable, Logger } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import type { Env } from '../config/env.schema.js';
import { UserRole } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service.js';

import { renderEmail } from '../mail/email-layout.js';
import { sendResendTemplate } from '../mail/resend-template.js';

const minutesLeft = (d: Date) => Math.max(1, Math.round((d.getTime() - Date.now()) / 60_000));
const expiryText = (d: Date) => {
  const m = minutesLeft(d);
  return m >= 90 ? `This link works for about ${Math.round(m / 60)} hours.` : `This link works for about ${m} minutes.`;
};

@Injectable()
export class EmailVerificationMailer extends EmailVerificationHandler {
  private readonly logger = new Logger(EmailVerificationMailer.name);

  constructor(
    private readonly mailer: Mailer,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('emailVerification', this);
  }

  async send(link: EmailVerificationLink): Promise<void> {
    const templateId = this.settings.get('RESEND_VERIFY_TEMPLATE_ID');
    const apiKey = this.settings.get('RESEND_API_KEY');
    if (templateId && apiKey) {
      // Designed in the Resend dashboard: we only supply the values.
      await sendResendTemplate({
        apiKey,
        from: this.settings.get('MAIL_FROM_ACCOUNT') ?? this.settings.get('MAIL_FROM') ?? 'Dia <no-reply@dia.local>',
        to: link.email,
        subject: 'Verify your email',
        templateId,
        variables: {
          first_name: (await this.users.findById(link.userId).catch(() => null))?.name?.trim().split(/\s+/)[0] || 'there',
          company_name: this.settings.get('COMPANY_NAME') ?? 'Dia Diamonds',
          company_address: this.settings.get('COMPANY_ADDRESS') ?? 'diadiamonds.in',
          magic_link_url: link.url,
        },
      });
      this.logger.log(`Verification email (Resend template) sent to user ${link.userId}`);
      return;
    }
    const { html, text } = renderEmail({
      preview: 'Confirm your email to get order updates.',
      heading: 'Verify your email',
      paragraphs: [
        'Thanks for joining Dia Diamonds. Please confirm your email address so we can send you order updates and help you recover your account.',
      ],
      button: { label: 'Verify my email', url: link.url },
      note: `${expiryText(link.expiresAt)} If you did not create an account, you can ignore this email.`,
    });
    await this.mailer.send({
      from: this.settings.get('MAIL_FROM_ACCOUNT'),
      to: link.email,
      subject: 'Verify your email',
      text,
      html,
    });
    this.logger.log(`Verification email sent to user ${link.userId}`);
  }

  markVerified(userId: string, email: string): Promise<boolean> {
    return this.users.markEmailVerified(userId, email);
  }

  isVerified(user: unknown): boolean {
    return Boolean((user as { emailVerified?: boolean }).emailVerified);
  }
}

@Injectable()
export class PasswordResetMailer extends PasswordResetHandler {
  constructor(
    private readonly mailer: Mailer,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('passwordReset', this);
  }

  async findUser(email: string): Promise<PasswordResetAccount | null> {
    const user = await this.users.findByEmail(email, true);
    if (!user?.email) return null;
    return { id: user.id, email: user.email, passwordHash: user.passwordHash };
  }

  async send(link: PasswordResetLink): Promise<void> {
    // Team members set their password in the back office; shoppers do it on the website.
    const user = await this.users.findByEmail(link.email);
    const token = new URL(link.url).searchParams.get('token');
    if (user && user.role === UserRole.CUSTOMER && token) {
      link = { ...link, url: `${this.config.get('APP_URL', { infer: true })}/reset-password/?token=${encodeURIComponent(token)}` };
    }
    const { html, text } = renderEmail({
      preview: 'Choose a new password for your account.',
      heading: 'Reset your password',
      paragraphs: ['We received a request to reset the password for your Dia Diamonds account. Use the button below to choose a new one.'],
      button: { label: 'Choose a new password', url: link.url },
      note: `${expiryText(link.expiresAt)} If you did not ask for this, ignore this email and your password stays the same.`,
    });
    await this.mailer.send({
      from: this.settings.get('MAIL_FROM_ACCOUNT'),
      to: link.email,
      subject: 'Reset your password',
      text,
      html,
    });
  }

  updatePassword(userId: string, passwordHash: string): Promise<void> {
    return this.users.setPasswordHash(userId, passwordHash);
  }
}
