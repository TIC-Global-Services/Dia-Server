import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StockService } from '../catalog/stock/stock.service.js';
import { OrdersService } from '../orders/orders.service.js';
import {
  ORDER_CANCELLED,
  type OrderCancelledEvent,
} from '../orders/orders.events.js';
import { Payment } from '../payment/entities/payment.entity.js';
import {
  PaymentStatus,
  REFUND_PROVIDER_UPDATE,
  type RefundProviderUpdate,
} from '../payment/payment-provider.js';
import { PaymentService } from '../payment/payment.service.js';
import type { CreateRefundDto } from './dto/refund.dto.js';
import {
  Refund,
  RefundReason,
  RefundStatus,
} from './entities/refund.entity.js';
import {
  REFUND_SUCCEEDED,
  type RefundSucceededEvent,
} from './refunds.events.js';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectRepository(Refund) private readonly refunds: Repository<Refund>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly orders: OrdersService,
    private readonly payments: PaymentService,
    private readonly stock: StockService,
    private readonly events: EventEmitter2,
  ) {}

  listForOrder(orderId: string): Promise<Refund[]> {
    return this.refunds.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Refund part or all of what the customer paid.
   * Step 1 reserves the amount under a row lock, so two refunds can never together
   * exceed the payment. Step 2 calls the provider with the refund id as idempotency key.
   */
  async create(
    orderId: string,
    dto: CreateRefundDto,
    actorId: string | null,
  ): Promise<Refund> {
    const order = await this.orders.findOne(orderId);
    const payment = await this.payments.findPaidForOrder(orderId);
    if (!payment)
      throw new ConflictException('This order has no paid payment to refund');

    if (dto.restock) {
      const byId = new Map(order.items.map((i) => [i.id, i.quantity]));
      for (const r of dto.restock) {
        const ordered = byId.get(r.orderItemId);
        if (ordered === undefined)
          throw new BadRequestException(
            `Item ${r.orderItemId} is not in this order`,
          );
        if (r.quantity > ordered)
          throw new BadRequestException(
            `Cannot restock more than ordered for ${r.orderItemId}`,
          );
      }
    }

    const refund = await this.dataSource.transaction(async (m) => {
      await m
        .getRepository(Payment)
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: payment.id })
        .getOne();
      const { sum } = (await m
        .createQueryBuilder(Refund, 'r')
        .select('COALESCE(SUM(r."amountMinor"), 0)', 'sum')
        .where('r."paymentId" = :id AND r.status <> :failed', {
          id: payment.id,
          failed: RefundStatus.FAILED,
        })
        .getRawOne<{ sum: string }>()) as { sum: string };
      const remaining = payment.amountMinor - Number(sum);
      const amount = dto.amountMinor ?? remaining;
      if (remaining <= 0)
        throw new ConflictException('This payment is already fully refunded');
      if (amount <= 0 || amount > remaining) {
        throw new BadRequestException(
          `Refund must be between 1 and ${remaining} (minor units)`,
        );
      }
      return m.save(
        m.create(Refund, {
          orderId,
          paymentId: payment.id,
          amountMinor: amount,
          currency: payment.currency,
          reason: dto.reason,
          note: dto.note ?? null,
          provider: payment.provider,
          restocked: dto.restock ?? null,
          initiatedBy: actorId,
        }),
      );
    });

    try {
      const result = await this.payments.refund(
        payment,
        refund.id,
        refund.amountMinor,
      );
      await this.refunds.update(refund.id, {
        providerRefundId: result.providerRefundId,
      });
      if (result.status === 'succeeded') await this.markSucceeded(refund.id);
    } catch (err) {
      // The provider refused (or was unreachable): give the amount back to the pool.
      await this.refunds.update(
        { id: refund.id, status: RefundStatus.PENDING },
        {
          status: RefundStatus.FAILED,
          failureReason: String((err as Error).message ?? err),
        },
      );
      throw err;
    }
    return this.refunds.findOneByOrFail({ id: refund.id });
  }

  /** The provider settled (or rejected) a refund that was pending. */
  @OnEvent(REFUND_PROVIDER_UPDATE, { suppressErrors: false })
  async onProviderUpdate(update: RefundProviderUpdate): Promise<void> {
    const refund = await this.refunds.findOneBy({
      providerRefundId: update.providerRefundId,
    });
    if (!refund) {
      this.logger.warn(
        `Provider update for unknown refund ${update.providerRefundId}`,
      );
      return;
    }
    if (update.status === 'succeeded') {
      await this.markSucceeded(refund.id);
    } else {
      await this.refunds.update(
        { id: refund.id, status: RefundStatus.PENDING },
        {
          status: RefundStatus.FAILED,
          failureReason: update.failureReason ?? 'rejected by provider',
        },
      );
      this.logger.error(
        `Refund ${refund.id} for order ${refund.orderId} failed at the provider`,
      );
    }
  }

  /** A paid order was cancelled: give the money back automatically. */
  @OnEvent(ORDER_CANCELLED)
  async onOrderCancelled(e: OrderCancelledEvent): Promise<void> {
    if (!e.refundDue) return;
    try {
      await this.create(
        e.orderId,
        { reason: RefundReason.ORDER_CANCELLED },
        e.actorId,
      );
    } catch (err) {
      // The cancellation stands; the refund can be retried from the admin endpoint.
      this.logger.error(
        `Automatic refund failed for cancelled order ${e.orderId}: ${String(err)}`,
      );
      await this.orders.addEvent(e.orderId, 'refund_failed', {
        message: 'Automatic refund failed: refund manually',
      });
    }
  }

  /** pending -> succeeded once; restock returned goods; tell the order. */
  private async markSucceeded(id: string): Promise<void> {
    const { affected } = await this.refunds.update(
      { id, status: RefundStatus.PENDING },
      { status: RefundStatus.SUCCEEDED },
    );
    const refund = await this.refunds.findOneBy({ id });
    if (!refund) throw new NotFoundException(`Refund ${id} not found`);
    if (!affected && refund.status !== RefundStatus.SUCCEEDED) return;

    if (affected && refund.restocked?.length) {
      const order = await this.orders.findOne(refund.orderId);
      const productOf = new Map(order.items.map((i) => [i.id, i.productId]));
      await this.stock.restock({
        reference: `refund:${refund.id}`,
        items: refund.restocked.map((r) => ({
          productId: productOf.get(r.orderItemId)!,
          quantity: r.quantity,
        })),
      });
    }

    const { sum } = (await this.refunds
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r."amountMinor"), 0)', 'sum')
      .where('r."paymentId" = :id AND r.status = :ok', {
        id: refund.paymentId,
        ok: RefundStatus.SUCCEEDED,
      })
      .getRawOne<{ sum: string }>())!;
    const payment = await this.dataSource
      .getRepository(Payment)
      .findOneByOrFail({ id: refund.paymentId });
    const event: RefundSucceededEvent = {
      orderId: refund.orderId,
      refundedMinor: Number(sum),
      paidMinor:
        payment.status === PaymentStatus.PAID ? payment.amountMinor : 0,
    };
    // Re-emitted on a redelivered webhook too: the order handler is idempotent.
    await this.events.emitAsync(REFUND_SUCCEEDED, event);
  }
}
