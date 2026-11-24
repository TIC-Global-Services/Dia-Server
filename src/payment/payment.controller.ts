import { Can } from '@nestjs/authorization';
import { Public } from '@nestjs/authentication';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { uuidParam } from '../common/pagination.js';
import { PaymentService } from './payment.service.js';

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /** Providers the storefront can offer at checkout. */
  @Public()
  @Get('providers')
  providers() {
    return this.paymentService.enabledProviders();
  }

  /** Called by the provider. Authenticated by signature, not by API key. */
  @Public()
  @SkipThrottle()
  @Post('webhooks/:provider')
  @HttpCode(200)
  async webhook(
    @Param('provider', { schema: z.string().min(1).max(30) }) provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    await this.paymentService.handleWebhook(provider, req.rawBody, headers);
    return { received: true };
  }

  @Post(':id/collect')
  @HttpCode(200)
  @Can(PermissionPolicy, 'orders')
  @ApiBearerAuth()
  collect(@Param('id', { schema: uuidParam }) id: string) {
    return this.paymentService.collectCod(id);
  }
}
