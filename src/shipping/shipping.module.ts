import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from '../orders/orders.module.js';
import {
  Shipment,
  ShippingRate,
  ShippingZone,
} from './entities/shipping.entity.js';
import { ShipmentsController } from './shipments.controller.js';
import { ShipmentsService } from './shipments.service.js';
import { ShippingController } from './shipping.controller.js';
import { ShippingService } from './shipping.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShippingZone, ShippingRate, Shipment]),
    OrdersModule,
  ],
  controllers: [ShippingController, ShipmentsController],
  providers: [ShippingService, ShipmentsService],
  exports: [ShippingService],
})
export class ShippingModule {}
