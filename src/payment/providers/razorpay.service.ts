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

interface RazorpayWebhook {
  event: string;
  payload?: {
    refund?: { entity?: { id: string; error_description?: string } };
    payment?: {
      entity?: {
        id: string;
        order_id?: string;
        amount?: number;
        error_description?: string;
      };
    };
  };
}

@Injectable()
export class RazorpayService implements PaymentProvider {
  readonly name = 'razorpay';
  readonly mode: PaymentMode = 'online';
  private readonly logger = new Logger(RazorpayService.name);

  constructor(private readonly settings: SettingsService) {}

  isEnabled(): boolean {
    return Boolean(
      this.settings.get('RAZORPAY_KEY_ID') &&
      this.settings.get('RAZORPAY_KEY_SECRET'),
    );
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const keyId = this.settings.get('RAZORPAY_KEY_ID')!;
    const keySecret = this.settings.get('RAZORPAY_KEY_SECRET')!;

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.orderNumber,
        notes: { paymentId: input.paymentId },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => {
      this.logger.error(`Razorpay request failed: ${String(err)}`);
      throw new BadGatewayException('Payment provider unreachable');
    });

    if (!response.ok) {
      this.logger.error(
        `Razorpay order failed: ${response.status} ${await response.text()}`,
      );
      throw new BadGatewayException('Payment provider rejected the request');
    }
    const order = (await response.json()) as { id: string };
    return {
      providerPaymentId: order.id,
      clientData: {
        keyId,
        razorpayOrderId: order.id,
        amount: input.amountMinor,
        currency: input.currency,
      },
    };
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent | null {
    const secret = this.settings.get('RAZORPAY_WEBHOOK_SECRET');
    const signature = headers['x-razorpay-signature'];
    if (!secret || typeof signature !== 'string') {
      throw new Error('Razorpay webhook not configured or unsigned');
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('Invalid Razorpay signature');
    }

    const body = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhook;
    const eventId = String(headers['x-razorpay-event-id'] ?? body.event);

    const refund = body.payload?.refund?.entity;
    if (
      refund &&
      (body.event === 'refund.processed' || body.event === 'refund.failed')
    ) {
      return {
        kind: 'refund',
        eventId,
        providerRefundId: refund.id,
        status: body.event === 'refund.processed' ? 'succeeded' : 'failed',
        failureReason: refund.error_description,
      };
    }

    const entity = body.payload?.payment?.entity;
    if (!entity?.order_id) return null;

    // Payments are keyed by the Razorpay *order* id we stored at creation.
    if (body.event === 'payment.captured' || body.event === 'order.paid') {
      return {
        kind: 'payment',
        eventId,
        providerPaymentId: entity.order_id,
        providerChargeId: entity.id,
        status: PaymentStatus.PAID,
        amountMinor: entity.amount,
      };
    }
    if (body.event === 'payment.failed') {
      return {
        kind: 'payment',
        eventId,
        providerPaymentId: entity.order_id,
        status: PaymentStatus.FAILED,
        failureReason: entity.error_description,
      };
    }
    return null;
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (!input.providerChargeId) {
      // The pay_... id only arrives with the payment webhook.
      throw new BadGatewayException(
        'Razorpay payment id not known yet, try again shortly',
      );
    }
    const keyId = this.settings.get('RAZORPAY_KEY_ID')!;
    const keySecret = this.settings.get('RAZORPAY_KEY_SECRET')!;
    const response = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(input.providerChargeId)}/refund`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          // Same refund row => same key => Razorpay will not refund twice.
          'x-refund-idempotency': input.refundId,
        },
        body: JSON.stringify({
          amount: input.amountMinor,
          receipt: input.refundId.slice(0, 40),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    ).catch((err: unknown) => {
      this.logger.error(`Razorpay refund request failed: ${String(err)}`);
      throw new BadGatewayException('Payment provider unreachable');
    });
    if (!response.ok) {
      this.logger.error(
        `Razorpay refund failed: ${response.status} ${await response.text()}`,
      );
      throw new BadGatewayException('Payment provider rejected the refund');
    }
    const refund = (await response.json()) as { id: string; status: string };
    return {
      providerRefundId: refund.id,
      status: refund.status === 'processed' ? 'succeeded' : 'pending',
    };
  }
}
