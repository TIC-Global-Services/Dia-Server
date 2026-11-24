export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
}

export type PaymentMode =
  /** Customer pays now through the provider; confirmed by webhook. */
  | 'online'
  /** Customer pays later (cash on delivery); order is confirmed immediately. */
  | 'offline';

export interface CreatePaymentInput {
  /** Our payment row id. Use it as the provider-side idempotency key / receipt. */
  paymentId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  customer: { email: string; phone?: string | null };
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  /** What the storefront needs to complete payment (public values only). */
  clientData: Record<string, unknown>;
}

export interface PaymentWebhookEvent {
  kind: 'payment';
  /** Provider's own event id, for logs. */
  eventId: string;
  providerPaymentId: string;
  /** Id needed to refund later, when it differs from providerPaymentId (Razorpay's pay_...). */
  providerChargeId?: string;
  status: PaymentStatus.PAID | PaymentStatus.FAILED;
  amountMinor?: number;
  failureReason?: string;
}

export interface RefundWebhookEvent {
  kind: 'refund';
  eventId: string;
  providerRefundId: string;
  status: 'succeeded' | 'failed';
  failureReason?: string;
}

export type ProviderWebhookEvent = PaymentWebhookEvent | RefundWebhookEvent;

export interface RefundInput {
  /** Our refund row id: the provider-side idempotency key, so a retry never refunds twice. */
  refundId: string;
  providerPaymentId: string;
  providerChargeId: string | null;
  amountMinor: number;
  currency: string;
}

export interface RefundResult {
  providerRefundId: string;
  /** `pending` settles later and is confirmed by a webhook. */
  status: 'succeeded' | 'pending';
}

/**
 * Adding a provider = implement this, register it in PaymentModule.
 * Nothing else in the app knows which providers exist.
 */
export interface PaymentProvider {
  readonly name: string;
  readonly mode: PaymentMode;
  isEnabled(): boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  /**
   * Verify the signature over the raw body and translate the event.
   * Throw on a bad signature. Return null for events we do not act on.
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent | null;
}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');

export const PAYMENT_SUCCEEDED = 'payment.succeeded';
export const PAYMENT_FAILED = 'payment.failed';

export interface PaymentEvent {
  orderId: string;
  paymentId: string;
}

export const REFUND_PROVIDER_UPDATE = 'refund.provider_update';

export interface RefundProviderUpdate {
  providerRefundId: string;
  status: 'succeeded' | 'failed';
  failureReason?: string;
}
