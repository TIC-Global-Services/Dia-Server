import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SettingsService } from '../settings/settings.service.js';
import { Order, OrderStatus } from './entities/order.entity.js';
import { OrdersService } from './orders.service.js';

/**
 * Cancels unpaid orders and frees their reserved stock and offer use. Safe with several
 * instances: cancelPending is a guarded update, only one caller wins per order.
 */
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly ordersService: OrdersService,
    private readonly settings: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireUnpaid(): Promise<void> {
    const ttlMs =
      this.settings.number('ORDER_PAYMENT_TTL_MINUTES', 30) * 60_000;
    const stale = await this.orders.find({
      select: { id: true },
      where: {
        status: OrderStatus.PENDING_PAYMENT,
        createdAt: LessThan(new Date(Date.now() - ttlMs)),
      },
      take: 100,
    });
    for (const { id } of stale) {
      try {
        if (await this.ordersService.cancelPending(id, 'payment_timeout')) {
          this.logger.log(`Expired unpaid order ${id}`);
        }
      } catch (err) {
        this.logger.error(`Failed to expire order ${id}: ${String(err)}`);
      }
    }
  }
}
