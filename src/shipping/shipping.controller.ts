import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { uuidParam } from '../common/pagination.js';
import {
  createRateSchema,
  createZoneSchema,
  updateRateSchema,
  updateZoneSchema,
  type CreateRateDto,
  type CreateZoneDto,
  type UpdateRateDto,
  type UpdateZoneDto,
} from './dto/shipping.dto.js';
const estimateSchema = z.object({
  country: z.string().trim().length(2).default('IN'),
  state: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(3).max(12),
  weightGrams: z.number().int().min(0).default(500),
  subtotalMinor: z.number().int().min(0).default(0),
});

import { ShippingService } from './shipping.service.js';

/** Zones and rates. Customers get their options from POST /checkout/quote. */
@ApiTags('shipping')
@ApiBearerAuth()
@Can(PermissionPolicy, 'shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('zones')
  listZones() {
    return this.shipping.listZones();
  }

  @Post('estimate')
  @HttpCode(200)
  estimate(@Body({ schema: estimateSchema }) dto: z.infer<typeof estimateSchema>) {
    return this.shipping.estimate({
      address: { country: dto.country, state: dto.state, postalCode: dto.postalCode },
      weightGrams: dto.weightGrams,
      subtotalMinor: dto.subtotalMinor,
    });
  }

  @Post('zones')
  createZone(@Body({ schema: createZoneSchema }) dto: CreateZoneDto) {
    return this.shipping.createZone(dto);
  }

  @Patch('zones/:id')
  updateZone(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateZoneSchema }) dto: UpdateZoneDto,
  ) {
    return this.shipping.updateZone(id, dto);
  }

  @Delete('zones/:id')
  @HttpCode(204)
  removeZone(@Param('id', { schema: uuidParam }) id: string) {
    return this.shipping.removeZone(id);
  }

  @Post('zones/:id/rates')
  createRate(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: createRateSchema }) dto: CreateRateDto,
  ) {
    return this.shipping.createRate(id, dto);
  }

  @Patch('rates/:id')
  updateRate(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateRateSchema }) dto: UpdateRateDto,
  ) {
    return this.shipping.updateRate(id, dto);
  }

  @Delete('rates/:id')
  @HttpCode(204)
  removeRate(@Param('id', { schema: uuidParam }) id: string) {
    return this.shipping.removeRate(id);
  }
}
