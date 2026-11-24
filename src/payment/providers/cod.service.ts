import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service.js';
import {
  PaymentMode,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type ProviderWebhookEvent,
  type RefundInput,
  type RefundResult,
} from '../payment-provider.js';

/** Cash on delivery: no gateway. Marked paid manually via POST /payments/:id/collect. */
@Injectable()
export class CodService implements PaymentProvider {
  readonly name = 'cod';
  readonly mode: PaymentMode = 'offline';

  constructor(private readonly settings: SettingsService) {}

  isEnabled(): boolean {
    return this.settings.bool('COD_ENABLED', false);
  }

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return Promise.resolve({
      providerPaymentId: `cod_${input.paymentId}`,
      clientData: { instructions: 'Pay in cash on delivery' },
    });
  }

  /** Cash goes back by hand, so recording the refund is the whole operation. */
  refund(input: RefundInput): Promise<RefundResult> {
    return Promise.resolve({
      providerRefundId: `cod_refund_${input.refundId}`,
      status: 'succeeded',
    });
  }

  parseWebhook(): ProviderWebhookEvent | null {
    throw new Error('COD has no webhooks');
  }
}
