import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockModule } from '../catalog/stock/stock.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentModule } from '../payment/payment.module.js';
import { Refund } from './entities/refund.entity.js';
import { RefundsController } from './refunds.controller.js';
import { RefundsService } from './refunds.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Refund]),
    OrdersModule,
    PaymentModule,
    StockModule,
  ],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
