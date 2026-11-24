import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { User } from '../users/entities/user.entity.js';
import { CheckoutService } from './checkout.service.js';
import {
  checkoutSchema,
  quoteSchema,
  type CheckoutDto,
  type QuoteDto,
} from './dto/create-checkout.dto.js';

/** Guests can check out; signed-in customers get saved addresses and order history. */
@ApiTags('checkout')
@ApiBearerAuth()
@Authenticate({ optional: true })
@Can.Anyone()
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  /** Price breakdown and shipping options. Reserves nothing. */
  @Post('quote')
  @HttpCode(200)
  quote(
    @Body({ schema: quoteSchema }) dto: QuoteDto,
    @CurrentUser() user: User | null,
  ) {
    return this.checkoutService.quote(dto, user ?? null);
  }

  @Post()
  checkout(
    @Body({ schema: checkoutSchema }) dto: CheckoutDto,
    @CurrentUser() user: User | null,
  ) {
    return this.checkoutService.checkout(dto, user ?? null);
  }
}
