import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { CurrentUser } from '@nestjs/authentication';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { uuidParam } from '../common/pagination.js';
import { OrdersService } from '../orders/orders.service.js';
import type { User } from '../users/entities/user.entity.js';
import {
  createShipmentSchema,
  updateShipmentStatusSchema,
  type CreateShipmentDto,
  type UpdateShipmentStatusDto,
} from './dto/shipping.dto.js';
import { ShipmentsService } from './shipments.service.js';

@ApiTags('shipments')
@ApiBearerAuth()
@Controller()
export class ShipmentsController {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly orders: OrdersService,
  ) {}

  /** Tracking for the customer who owns the order (or an admin). */
  @Get('orders/:orderId/shipments')
  @Can.Anyone()
  async forOrder(
    @Param('orderId', { schema: uuidParam }) orderId: string,
    @CurrentUser() user: User,
  ) {
    await this.orders.findForUser(orderId, user);
    return this.shipments.listForOrder(orderId);
  }

  @Post('orders/:orderId/shipments')
  @Can(PermissionPolicy, 'orders')
  create(
    @Param('orderId', { schema: uuidParam }) orderId: string,
    @Body({ schema: createShipmentSchema }) dto: CreateShipmentDto,
  ) {
    return this.shipments.create(orderId, dto);
  }

  @Patch('shipments/:id/status')
  @Can(PermissionPolicy, 'orders')
  updateStatus(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateShipmentStatusSchema }) dto: UpdateShipmentStatusDto,
  ) {
    return this.shipments.updateStatus(id, dto);
  }
}
