import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { Public } from '@nestjs/authentication';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { uuidParam } from '../common/pagination.js';
import {
  createOfferSchema,
  type CreateOfferDto,
} from './dto/create-offer.dto.js';
import {
  listOffersSchema,
  updateOfferSchema,
  type ListOffersQuery,
  type UpdateOfferDto,
} from './dto/update-offer.dto.js';
import { OffersService } from './offers.service.js';

@ApiTags('offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  /** Public: automatic deals the storefront can show. Coupon codes stay private. */
  @Get('active')
  @Public()
  advertised() {
    return this.offersService.findAdvertised().then((offers) =>
      offers.map((o) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        type: o.type,
        value: o.value,
        minSubtotalMinor: o.minSubtotalMinor,
        endsAt: o.endsAt,
      })),
    );
  }

  @Post()
  @ApiBearerAuth()
  @Can(PermissionPolicy, 'offers')
  create(@Body({ schema: createOfferSchema }) dto: CreateOfferDto) {
    return this.offersService.create(dto);
  }

  @Get()
  @ApiBearerAuth()
  @Can(PermissionPolicy, 'offers')
  findAll(@Query({ schema: listOffersSchema }) query: ListOffersQuery) {
    return this.offersService.findAll(query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Can(PermissionPolicy, 'offers')
  findOne(@Param('id', { schema: uuidParam }) id: string) {
    return this.offersService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Can(PermissionPolicy, 'offers')
  update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateOfferSchema }) dto: UpdateOfferDto,
  ) {
    return this.offersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth()
  @Can(PermissionPolicy, 'offers')
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.offersService.remove(id);
  }
}
