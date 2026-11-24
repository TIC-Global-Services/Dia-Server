import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { uuidParam } from '../common/pagination.js';
import { OrdersService } from '../orders/orders.service.js';
import type { User } from '../users/entities/user.entity.js';
import { createRefundSchema, type CreateRefundDto } from './dto/refund.dto.js';
import { RefundsService } from './refunds.service.js';

@ApiTags('refunds')
@ApiBearerAuth()
@Controller()
export class RefundsController {
  constructor(
    private readonly refunds: RefundsService,
    private readonly orders: OrdersService,
  ) {}

  @Get('orders/:orderId/refunds')
  @Authenticate({ optional: true })
  @Can.Anyone()
  async forOrder(
    @Param('orderId', { schema: uuidParam }) orderId: string,
    @CurrentUser() user: User | null,
  ) {
    await this.orders.findForUser(orderId, user ?? null);
    return this.refunds.listForOrder(orderId);
  }

  @Post('admin/orders/:orderId/refunds')
  @Can(PermissionPolicy, 'refunds')
  create(
    @Param('orderId', { schema: uuidParam }) orderId: string,
    @Body({ schema: createRefundSchema }) dto: CreateRefundDto,
    @CurrentUser() user: User,
  ) {
    return this.refunds.create(orderId, dto, user.id);
  }
}
