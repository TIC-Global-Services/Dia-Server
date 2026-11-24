import { Logger } from '@nestjs/common';
import {
  LogMailTransport,
  MailMessage,
  MailTransport,
  ResendTransport,
  type MailTransportResult,
  type MailTransportSendOptions,
} from '@nestjs/mail';
import type { SettingsService } from './settings.service.js';

/**
 * Chooses the delivery method per message from the current settings: Resend when an API key is
 * saved, otherwise the console in development. In production it refuses rather than printing
 * password links into the logs.
 */
export class SettingsMailTransport extends MailTransport {
  private readonly logger = new Logger(SettingsMailTransport.name);
  private readonly log = new LogMailTransport({ body: true });
  private resend?: { key: string; transport: ResendTransport };

  constructor(private readonly settings: SettingsService) {
    super();
  }

  send(message: MailMessage, options: MailTransportSendOptions): Promise<MailTransportResult> {
    const apiKey = this.settings.get('RESEND_API_KEY');
    if (apiKey) {
      if (this.resend?.key !== apiKey) this.resend = { key: apiKey, transport: new ResendTransport({ apiKey }) };
      return this.resend.transport.send(message, options);
    }
    if (process.env.NODE_ENV === 'production') {
      this.logger.error('Email is not set up: add a Resend API key under Settings > Email');
      return Promise.reject(new Error('Email is not set up'));
    }
    return this.log.send(message);
  }
}
