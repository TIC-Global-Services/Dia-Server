import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { uuidParam } from '../common/pagination.js';
import type { User } from '../users/entities/user.entity.js';
import { CartService } from './cart.service.js';
import {
  addItemSchema,
  couponSchema,
  setQuantitySchema,
  type AddItemDto,
  type CouponDto,
  type SetQuantityDto,
} from './dto/create-cart.dto.js';

/**
 * Guests and signed-in customers both shop. A guest cart is addressed by its
 * unguessable id; a cart that belongs to a user is only visible to that user.
 */
@ApiTags('cart')
@ApiBearerAuth()
@Authenticate({ optional: true })
@Can.Anyone()
@Controller('carts')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post()
  create(@CurrentUser() user: User | null) {
    return this.cartService.create(user ?? null);
  }

  @Get(':id')
  findOne(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: User | null,
  ) {
    return this.cartService.view(id, user ?? null);
  }

  /** After signing in: attach the guest cart to the account. */
  @Post(':id/claim')
  @Authenticate()
  @HttpCode(200)
  claim(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: User,
  ) {
    return this.cartService.claim(id, user);
  }

  @Post(':id/items')
  addItem(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: addItemSchema }) dto: AddItemDto,
    @CurrentUser() user: User | null,
  ) {
    return this.cartService.addItem(id, dto, user ?? null);
  }

  @Patch(':id/items/:productId')
  setQuantity(
    @Param('id', { schema: uuidParam }) id: string,
    @Param('productId', { schema: uuidParam }) productId: string,
    @Body({ schema: setQuantitySchema }) dto: SetQuantityDto,
    @CurrentUser() user: User | null,
  ) {
    return this.cartService.setQuantity(
      id,
      productId,
      dto.quantity,
      user ?? null,
    );
  }

  @Delete(':id/items/:productId')
  removeItem(
    @Param('id', { schema: uuidParam }) id: string,
    @Param('productId', { schema: uuidParam }) productId: string,
    @CurrentUser() user: User | null,
  ) {
    return this.cartService.removeItem(id, productId, user ?? null);
  }

  @Delete(':id/items')
  clear(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: User | null,
  ) {
    return this.cartService.clear(id, user ?? null);
  }

  @Put(':id/coupon')
  applyCoupon(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: couponSchema }) dto: CouponDto,
    @CurrentUser() user: User | null,
  ) {
    return this.cartService.applyCoupon(id, dto.code, user ?? null);
  }

  @Delete(':id/coupon')
  removeCoupon(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: User | null,
  ) {
    return this.cartService.removeCoupon(id, user ?? null);
  }
}
