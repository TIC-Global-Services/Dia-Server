import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Mailer } from '@nestjs/mail';
import { renderEmail } from '../mail/email-layout.js';
import type { Env } from '../config/env.schema.js';
import {
  REFUND_SUCCEEDED,
  type RefundSucceededEvent,
} from '../refunds/refunds.events.js';
import type { Order } from './entities/order.entity.js';
import {
  ORDER_CANCELLED,
  ORDER_STATUS_CHANGED,
  type OrderCancelledEvent,
  type OrderStatusChangedEvent,
} from './orders.events.js';
import { OrdersService } from './orders.service.js';


/** Emails the customer as their order moves. A mail failure is logged, never thrown into the order flow. */
@Injectable()
export class OrderMailer {
  private readonly logger = new Logger(OrderMailer.name);

  constructor(
    private readonly mailer: Mailer,
    private readonly orders: OrdersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @OnEvent(ORDER_STATUS_CHANGED)
  async onStatus({ orderId, status }: OrderStatusChangedEvent): Promise<void> {
    const copy = {
      confirmed: {
        subject: (n: string) => `Order ${n} confirmed`,
        lead: 'Thank you for your order. We are getting it ready.',
        showItems: true,
      },
      shipped: {
        subject: (n: string) => `Order ${n} has shipped`,
        lead: 'Your order is on its way.',
        showItems: false,
      },
      delivered: {
        subject: (n: string) => `Order ${n} delivered`,
        lead: 'Your order has been delivered. We hope you love it.',
        showItems: false,
      },
    }[status];
    await this.send(orderId, copy.subject, copy.lead, copy.showItems);
  }

  @OnEvent(ORDER_CANCELLED)
  async onCancelled({ orderId, refundDue }: OrderCancelledEvent): Promise<void> {
    await this.send(
      orderId,
      (n) => `Order ${n} cancelled`,
      refundDue
        ? 'Your order has been cancelled. Your refund is on its way and will follow in a separate email.'
        : 'Your order has been cancelled.',
      false,
    );
  }

  @OnEvent(REFUND_SUCCEEDED)
  async onRefunded({ orderId, refundedMinor }: RefundSucceededEvent): Promise<void> {
    await this.send(
      orderId,
      (n) => `Refund for order ${n}`,
      'We have refunded your payment. It can take a few days to show up with your bank.',
      false,
      this.money(refundedMinor),
    );
  }

  private money(minor: number, currency = 'INR'): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(
      minor / 100,
    );
  }

  private async send(
    orderId: string,
    subject: (number: string) => string,
    lead: string,
    showItems: boolean,
    extra?: string,
  ): Promise<void> {
    try {
      const order: Order = await this.orders.findOne(orderId);
      if (!order.email) return;
      const money = (m: number) => this.money(m, order.currency);
      const link = `${this.config.get('APP_URL', { infer: true })}/account`;
      const name = order.shippingAddress?.name ?? 'there';
      const rows = [
        { label: 'Order', value: order.number },
        ...(showItems
          ? order.items.map((i) => ({
              label: `${i.name} × ${i.quantity}`,
              value: money(i.lineTotalMinor),
            }))
          : []),
        ...(extra ? [{ label: 'Refunded', value: extra }] : []),
        { label: 'Total', value: money(order.totalMinor), strong: true },
      ];
      const { html, text } = renderEmail({
        preview: lead,
        heading: subject(order.number),
        paragraphs: [`Hi ${name},`, lead],
        rows,
        button: { label: 'View my orders', url: link },
      });
      await this.mailer.send({ to: order.email, subject: subject(order.number), text, html });
    } catch (err) {
      this.logger.error(`Could not send order email for ${orderId}: ${String(err)}`);
    }
  }
}
