import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service.js';
import {
  PaymentMode,
  PaymentStatus,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type ProviderWebhookEvent,
  type RefundInput,
  type RefundResult,
} from '../payment-provider.js';

const TOLERANCE_SECONDS = 300;

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      status?: string;
      failure_reason?: string;
      amount_received?: number;
      last_payment_error?: { message?: string };
    };
  };
}

@Injectable()
export class StripeService implements PaymentProvider {
  readonly name = 'stripe';
  readonly mode: PaymentMode = 'online';
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly settings: SettingsService) {}

  isEnabled(): boolean {
    return Boolean(this.settings.get('STRIPE_SECRET_KEY'));
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const secret = this.settings.get('STRIPE_SECRET_KEY')!;
    const form = new URLSearchParams({
      amount: String(input.amountMinor),
      currency: input.currency.toLowerCase(),
      'automatic_payment_methods[enabled]': 'true',
      receipt_email: input.customer.email,
      'metadata[paymentId]': input.paymentId,
      'metadata[orderNumber]': input.orderNumber,
    });

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/x-www-form-urlencoded',
        // Safe to retry: the same payment row never creates two intents.
        'idempotency-key': input.paymentId,
      },
      body: form,
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => {
      this.logger.error(`Stripe request failed: ${String(err)}`);
      throw new BadGatewayException('Payment provider unreachable');
    });

    if (!response.ok) {
      this.logger.error(
        `Stripe intent failed: ${response.status} ${await response.text()}`,
      );
      throw new BadGatewayException('Payment provider rejected the request');
    }
    const intent = (await response.json()) as {
      id: string;
      client_secret: string;
    };
    return {
      providerPaymentId: intent.id,
      clientData: { clientSecret: intent.client_secret },
    };
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent | null {
    const secret = this.settings.get('STRIPE_WEBHOOK_SECRET');
    const header = headers['stripe-signature'];
    if (!secret || typeof header !== 'string') {
      throw new Error('Stripe webhook not configured or unsigned');
    }

    const parts = Object.fromEntries(
      header.split(',').map((kv) => kv.split('=') as [string, string]),
    );
    const timestamp = Number(parts.t);
    if (
      !timestamp ||
      Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS
    ) {
      throw new Error('Stripe signature timestamp outside tolerance');
    }
    const expected = createHmac('sha256', secret)
      .update(`${parts.t}.`)
      .update(rawBody)
      .digest('hex');
    const provided = Buffer.from(parts.v1 ?? '');
    const wanted = Buffer.from(expected);
    if (
      provided.length !== wanted.length ||
      !timingSafeEqual(provided, wanted)
    ) {
      throw new Error('Invalid Stripe signature');
    }

    const event = JSON.parse(rawBody.toString('utf8')) as StripeEvent;
    const object = event.data.object;
    if (event.type === 'refund.updated' || event.type === 'refund.failed') {
      if (
        object.status === 'succeeded' ||
        object.status === 'failed' ||
        object.status === 'canceled'
      ) {
        return {
          kind: 'refund',
          eventId: event.id,
          providerRefundId: object.id,
          status: object.status === 'succeeded' ? 'succeeded' : 'failed',
          failureReason: object.failure_reason,
        };
      }
      return null; // still pending
    }
    if (event.type === 'payment_intent.succeeded') {
      return {
        kind: 'payment',
        eventId: event.id,
        providerPaymentId: object.id,
        status: PaymentStatus.PAID,
        amountMinor: object.amount_received,
      };
    }
    if (event.type === 'payment_intent.payment_failed') {
      return {
        kind: 'payment',
        eventId: event.id,
        providerPaymentId: object.id,
        status: PaymentStatus.FAILED,
        failureReason: object.last_payment_error?.message,
      };
    }
    return null;
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const secret = this.settings.get('STRIPE_SECRET_KEY')!;
    const response = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': `refund_${input.refundId}`,
      },
      body: new URLSearchParams({
        payment_intent: input.providerPaymentId,
        amount: String(input.amountMinor),
        'metadata[refundId]': input.refundId,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => {
      this.logger.error(`Stripe refund request failed: ${String(err)}`);
      throw new BadGatewayException('Payment provider unreachable');
    });
    if (!response.ok) {
      this.logger.error(
        `Stripe refund failed: ${response.status} ${await response.text()}`,
      );
      throw new BadGatewayException('Payment provider rejected the refund');
    }
    const refund = (await response.json()) as { id: string; status: string };
    if (refund.status === 'failed' || refund.status === 'canceled') {
      throw new BadGatewayException('Payment provider could not refund');
    }
    return {
      providerRefundId: refund.id,
      status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
    };
  }
}
