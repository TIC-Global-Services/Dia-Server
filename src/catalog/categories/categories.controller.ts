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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { uuidParam } from '../../common/pagination.js';
import { CategoriesService } from './categories.service.js';
import {
  createCategorySchema,
  type CreateCategoryDto,
} from './dto/create-category.dto.js';
import {
  updateCategorySchema,
  type UpdateCategoryDto,
} from './dto/update-category.dto.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Can(PermissionPolicy, 'catalogue')
  @ApiBearerAuth()
  create(@Body({ schema: createCategorySchema }) dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Public()
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Public()
  @Get('slug/:slug')
  findBySlug(@Param('slug', { schema: z.string().min(1) }) slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', { schema: uuidParam }) id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @Can(PermissionPolicy, 'catalogue')
  @ApiBearerAuth()
  update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateCategorySchema }) dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can(PermissionPolicy, 'catalogue')
  @ApiBearerAuth()
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.categoriesService.remove(id);
  }
}
