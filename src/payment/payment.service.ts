import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity.js';
import {
  PAYMENT_FAILED,
  PAYMENT_PROVIDERS,
  PAYMENT_SUCCEEDED,
  PaymentStatus,
  REFUND_PROVIDER_UPDATE,
  type PaymentEvent,
  type RefundInput,
  type RefundProviderUpdate,
  type RefundResult,
  type PaymentMode,
  type PaymentProvider,
} from './payment-provider.js';

export interface PayableOrder {
  id: string;
  number: string;
  totalMinor: number;
  currency: string;
  email: string;
  phone?: string | null;
}

export interface InitiatedPayment {
  paymentId: string;
  provider: string;
  mode: PaymentMode;
  clientData: Record<string, unknown>;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly byName: Map<string, PaymentProvider>;

  constructor(
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    @Inject(PAYMENT_PROVIDERS) providers: PaymentProvider[],
    private readonly events: EventEmitter2,
  ) {
    this.byName = new Map(providers.map((p) => [p.name, p]));
  }

  /** Providers the storefront may offer right now. */
  enabledProviders(): { name: string; mode: PaymentMode }[] {
    return [...this.byName.values()]
      .filter((p) => p.isEnabled())
      .map((p) => ({ name: p.name, mode: p.mode }));
  }

  assertEnabled(name: string): PaymentProvider {
    const provider = this.byName.get(name);
    if (!provider?.isEnabled()) {
      throw new BadRequestException(
        `Payment provider "${name}" is not available`,
      );
    }
    return provider;
  }

  async initiate(
    order: PayableOrder,
    providerName: string,
  ): Promise<InitiatedPayment> {
    const provider = this.assertEnabled(providerName);
    const payment = await this.repo.save(
      this.repo.create({
        orderId: order.id,
        provider: provider.name,
        amountMinor: order.totalMinor,
        currency: order.currency,
      }),
    );
    try {
      const result = await provider.createPayment({
        paymentId: payment.id,
        orderNumber: order.number,
        amountMinor: order.totalMinor,
        currency: order.currency,
        customer: { email: order.email, phone: order.phone },
      });
      await this.repo.update(payment.id, {
        providerPaymentId: result.providerPaymentId,
      });
      return {
        paymentId: payment.id,
        provider: provider.name,
        mode: provider.mode,
        clientData: result.clientData,
      };
    } catch (err) {
      await this.repo.update(payment.id, {
        status: PaymentStatus.FAILED,
        failureReason: 'provider_error',
      });
      throw err;
    }
  }

  /** The payment that actually collected money for an order, if any. */
  findPaidForOrder(orderId: string): Promise<Payment | null> {
    return this.repo.findOneBy({ orderId, status: PaymentStatus.PAID });
  }

  /** Asks the provider to return money. Idempotent per refundId. */
  async refund(
    payment: Payment,
    refundId: string,
    amountMinor: number,
  ): Promise<RefundResult> {
    const provider = this.byName.get(payment.provider);
    if (!provider?.isEnabled() || !payment.providerPaymentId) {
      throw new BadRequestException(
        `Provider "${payment.provider}" is not available for refunds`,
      );
    }
    const input: RefundInput = {
      refundId,
      providerPaymentId: payment.providerPaymentId,
      providerChargeId: payment.providerChargeId,
      amountMinor,
      currency: payment.currency,
    };
    return provider.refund(input);
  }

  findByOrder(orderId: string): Promise<Payment[]> {
    return this.repo.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  async handleWebhook(
    providerName: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const provider = this.byName.get(providerName);
    if (!provider?.isEnabled() || !rawBody) {
      throw new NotFoundException();
    }
    let event;
    try {
      event = provider.parseWebhook(rawBody, headers);
    } catch (err) {
      this.logger.warn(`Rejected ${providerName} webhook: ${String(err)}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (!event) return;

    if (event.kind === 'refund') {
      const update: RefundProviderUpdate = {
        providerRefundId: event.providerRefundId,
        status: event.status,
        failureReason: event.failureReason,
      };
      await this.events.emitAsync(REFUND_PROVIDER_UPDATE, update);
      return;
    }

    const payment = await this.repo.findOneBy({
      provider: provider.name,
      providerPaymentId: event.providerPaymentId,
    });
    if (!payment) {
      this.logger.warn(
        `Webhook ${event.eventId}: unknown payment ${event.providerPaymentId}`,
      );
      return;
    }

    if (
      event.status === PaymentStatus.PAID &&
      event.amountMinor !== undefined &&
      event.amountMinor !== payment.amountMinor
    ) {
      // Never mark an order paid for the wrong amount. Needs a human.
      this.logger.error(
        `Amount mismatch on payment ${payment.id}: expected ${payment.amountMinor}, got ${event.amountMinor}`,
      );
      await this.repo.update(payment.id, { failureReason: 'amount_mismatch' });
      return;
    }

    await this.transition(
      payment,
      event.status,
      event.failureReason,
      event.providerChargeId,
    );
  }

  /** Admin: cash collected on delivery. */
  async collectCod(paymentId: string): Promise<Payment> {
    const payment = await this.repo.findOneBy({ id: paymentId });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);
    if (payment.provider !== 'cod') {
      throw new BadRequestException(
        'Only COD payments can be collected manually',
      );
    }
    await this.transition(payment, PaymentStatus.PAID);
    return this.repo.findOneByOrFail({ id: paymentId });
  }

  /**
   * pending -> paid | failed, once. A redelivered webhook for a payment already in
   * that state re-emits the event instead of being dropped: if the first delivery
   * failed halfway (order not finalised), the retry repairs it. Listeners are idempotent.
   */
  private async transition(
    payment: Payment,
    status: PaymentStatus.PAID | PaymentStatus.FAILED,
    failureReason?: string,
    chargeId?: string,
  ): Promise<void> {
    const { affected } = await this.repo.update(
      { id: payment.id, status: PaymentStatus.PENDING },
      {
        status,
        failureReason: failureReason ?? null,
        ...(chargeId && { providerChargeId: chargeId }),
      },
    );
    if (!affected && payment.status !== status) return; // e.g. failed after paid: ignore

    const payload: PaymentEvent = {
      orderId: payment.orderId,
      paymentId: payment.id,
    };
    await this.events.emitAsync(
      status === PaymentStatus.PAID ? PAYMENT_SUCCEEDED : PAYMENT_FAILED,
      payload,
    );
  }
}
