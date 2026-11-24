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
import { Can } from '@nestjs/authorization';
import { CurrentUser } from '@nestjs/authentication';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { uuidParam } from '../common/pagination.js';
import type { User } from '../users/entities/user.entity.js';
import { AddressesService } from './addresses.service.js';
import {
  createAddressSchema,
  updateAddressSchema,
  type CreateAddressDto,
  type UpdateAddressDto,
} from './dto/create-address.dto.js';

/** The signed-in customer's address book. */
@ApiTags('addresses')
@ApiBearerAuth()
@Can.Anyone()
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.addresses.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body({ schema: createAddressSchema }) dto: CreateAddressDto,
  ) {
    return this.addresses.create(user.id, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidParam }) id: string,
  ) {
    return this.addresses.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateAddressSchema }) dto: UpdateAddressDto,
  ) {
    return this.addresses.update(user.id, id, dto);
  }

  @Post(':id/default')
  @HttpCode(200)
  setDefault(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidParam }) id: string,
  ) {
    return this.addresses.setDefault(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidParam }) id: string,
  ) {
    return this.addresses.remove(user.id, id);
  }
}
