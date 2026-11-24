import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockModule } from '../catalog/stock/stock.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { PaymentModule } from '../payment/payment.module.js';
import { OrderEvent } from './entities/order-event.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderExpiryService } from './order-expiry.service.js';
import {
  AdminOrdersController,
  OrdersController,
} from './orders.controller.js';
import { OrderMailer } from './order-mailer.service.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderEvent]),
    StockModule,
    OffersModule,
    PaymentModule,
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, OrderExpiryService, OrderMailer],
  exports: [OrdersService, TypeOrmModule],
})
export class OrdersModule {}
