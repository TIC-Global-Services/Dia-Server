import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { uuidParam } from '../common/pagination.js';
import type { User } from '../users/entities/user.entity.js';
import {
  addWishlistSchema,
  type AddWishlistDto,
} from './dto/create-wishlist.dto.js';
import { WishlistService } from './wishlist.service.js';

@ApiTags('wishlist')
@ApiBearerAuth()
@Can.Anyone()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.wishlistService.list(user.id);
  }

  @Post()
  @HttpCode(200)
  add(
    @CurrentUser() user: User,
    @Body({ schema: addWishlistSchema }) dto: AddWishlistDto,
  ) {
    return this.wishlistService.add(user.id, dto.productId);
  }

  @Delete(':productId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidParam }) productId: string,
  ) {
    return this.wishlistService.remove(user.id, productId);
  }
}
