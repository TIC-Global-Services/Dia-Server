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
import { z } from 'zod';
import { uuidParam } from '../../common/pagination.js';
import { createPageSchema, type CreatePageDto } from './dto/create-page.dto.js';
import {
  listPagesSchema,
  updatePageSchema,
  type ListPagesQuery,
  type UpdatePageDto,
} from './dto/update-page.dto.js';
import { PagesService } from './pages.service.js';

@ApiTags('cms')
@Controller('cms/pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  /** Public: published page by slug. */
  @Public()
  @Get('slug/:slug')
  findPublished(@Param('slug', { schema: z.string().min(1) }) slug: string) {
    return this.pagesService.findPublishedBySlug(slug);
  }

  @Post()
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  create(@Body({ schema: createPageSchema }) dto: CreatePageDto) {
    return this.pagesService.create(dto);
  }

  /** Admin: includes drafts. */
  @Get()
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  findAll(@Query({ schema: listPagesSchema }) query: ListPagesQuery) {
    return this.pagesService.findAll(query);
  }

  @Get(':id')
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  findOne(@Param('id', { schema: uuidParam }) id: string) {
    return this.pagesService.findOne(id);
  }

  @Patch(':id')
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updatePageSchema }) dto: UpdatePageDto,
  ) {
    return this.pagesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can(PermissionPolicy, 'content')
  @ApiBearerAuth()
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.pagesService.remove(id);
  }
}
