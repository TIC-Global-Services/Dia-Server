import { Can } from '@nestjs/authorization';
import { Public } from '@nestjs/authentication';
import { PermissionPolicy } from '../../auth/policies/permission.policy.js';
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { uuidParam } from '../../common/pagination.js';
import { BannersService } from './banners.service.js';
import {
  createBannerSchema,
  type CreateBannerDto,
} from './dto/create-banner.dto.js';
import {
  activeBannersSchema,
  updateBannerSchema,
  type ActiveBannersQuery,
  type UpdateBannerDto,
} from './dto/update-banner.dto.js';

@ApiTags('cms')
@Controller('cms/banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  /** Public: banners to render for a placement right now. */
  @Public()
  @Get('active')
  findActive(
    @Query({ schema: activeBannersSchema }) query: ActiveBannersQuery,
  ) {
    return this.bannersService.findActive(query.placement);
  }

  @Post()
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  create(@Body({ schema: createBannerSchema }) dto: CreateBannerDto) {
    return this.bannersService.create(dto);
  }

  @Get()
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  findAll() {
    return this.bannersService.findAll();
  }

  @Get(':id')
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  findOne(@Param('id', { schema: uuidParam }) id: string) {
    return this.bannersService.findOne(id);
  }

  @Patch(':id')
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateBannerSchema }) dto: UpdateBannerDto,
  ) {
    return this.bannersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.bannersService.remove(id);
  }
}
