import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { uuidParam } from '../common/pagination.js';
import type { User } from '../users/entities/user.entity.js';
import {
  addNoteSchema,
  adminListOrdersSchema,
  cancelOrderSchema,
  listOrdersSchema,
  payOrderSchema,
  updateOrderStatusSchema,
  type AddNoteDto,
  type AdminListOrdersQuery,
  type CancelOrderDto,
  type ListOrdersQuery,
  type PayOrderDto,
  type UpdateOrderStatusDto,
} from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Can.Anyone()
  list(
    @CurrentUser() user: User,
    @Query({ schema: listOrdersSchema }) query: ListOrdersQuery,
  ) {
    return this.orders.listForUser(user.id, query);
  }

  // Guests may open, pay and cancel their own order by its id, so sign-in is optional here.
  @Get(':id')
  @Authenticate({ optional: true })
  @Can.Anyone()
  detail(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: User | null,
  ) {
    return this.orders.detail(id, user ?? null);
  }

  @Post(':id/payments')
  @Authenticate({ optional: true })
  @Can.Anyone()
  pay(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: payOrderSchema }) dto: PayOrderDto,
    @CurrentUser() user: User | null,
  ) {
    return this.orders.pay(id, dto.paymentProvider, user ?? null);
  }

  @Post(':id/cancel')
  @Can.Anyone()
  cancel(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: cancelOrderSchema }) dto: CancelOrderDto,
    @CurrentUser() user: User,
  ) {
    return this.orders.cancel(id, user, dto.reason);
  }
}

@ApiTags('orders-admin')
@ApiBearerAuth()
@Can(PermissionPolicy, 'orders')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query({ schema: adminListOrdersSchema }) query: AdminListOrdersQuery) {
    return this.orders.listAll(query);
  }

  @Get(':id')
  detail(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: User,
  ) {
    return this.orders.detail(id, user);
  }

  @Patch(':id/status')
  status(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateOrderStatusSchema }) _dto: UpdateOrderStatusDto,
    @CurrentUser() user: User,
  ) {
    return this.orders.startProcessing(id, user.id);
  }

  @Post(':id/notes')
  note(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: addNoteSchema }) dto: AddNoteDto,
    @CurrentUser() user: User,
  ) {
    return this.orders.addNote(id, dto.note, user.id);
  }

  /** Admins cancel through the same rules as customers: refunds and restock follow. */
  @Post(':id/cancel')
  cancel(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: cancelOrderSchema }) dto: CancelOrderDto,
    @CurrentUser() user: User,
  ) {
    return this.orders.cancel(id, user, dto.reason);
  }
}
