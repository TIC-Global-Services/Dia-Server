import { Can } from '@nestjs/authorization';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { PermissionPolicy } from '../../auth/policies/permission.policy.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { uuidParam } from '../../common/pagination.js';
import {
  createProductSchema,
  type CreateProductDto,
} from './dto/create-product.dto.js';
import {
  featuredProductsSchema,
  listProductsSchema,
  type FeaturedProductsQuery,
  type ListProductsQuery,
} from './dto/list-products.dto.js';
import {
  updateProductSchema,
  type UpdateProductDto,
} from './dto/update-product.dto.js';
import type { User } from '../../users/entities/user.entity.js';
import { can } from '../../roles/permissions.js';
import { Product, ProductStatus } from './entities/product.entity.js';
import { ProductsService, withoutStock } from './products.service.js';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Can(PermissionPolicy, 'catalogue')
  @ApiBearerAuth()
  create(@Body({ schema: createProductSchema }) dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  /**
   * Storefront catalog. Everyone sees active products only; admins may ask for any status
   * and also get stock. Use GET /search/products for full-text search.
   */
  @Get()
  @Authenticate({ optional: true })
  @Can.Anyone()
  findAll(
    @Query({ schema: listProductsSchema }) query: ListProductsQuery,
    @CurrentUser() user: User | null,
  ) {
    return this.productsService.findAll(query, isAdmin(user));
  }

  /** Home page: the first few pieces of each category. */
  @Get('featured')
  @Authenticate({ optional: true })
  @Can.Anyone()
  featured(@Query({ schema: featuredProductsSchema }) query: FeaturedProductsQuery) {
    return this.productsService.featured(query.perCategory);
  }

  @Get('slug/:slug')
  @Authenticate({ optional: true })
  @Can.Anyone()
  async findBySlug(
    @Param('slug', { schema: z.string().min(1) }) slug: string,
    @CurrentUser() user: User | null,
  ) {
    return this.visibleTo(await this.productsService.findBySlug(slug), user);
  }

  @Get(':id')
  @Authenticate({ optional: true })
  @Can.Anyone()
  async findOne(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: User | null,
  ) {
    return this.visibleTo(await this.productsService.findOne(id), user);
  }

  @Patch(':id')
  @Can(PermissionPolicy, 'catalogue')
  @ApiBearerAuth()
  update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateProductSchema }) dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can(PermissionPolicy, 'catalogue')
  @ApiBearerAuth()
  remove(@Param('id', { schema: uuidParam }) id: string) {
    return this.productsService.remove(id);
  }

  /** Drafts and archived products do not exist for the public, and neither does stock. */
  private visibleTo(product: Product, user: User | null): Product {
    if (isAdmin(user)) return product;
    if (product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException(`Product ${product.slug} not found`);
    }
    return withoutStock(product);
  }
}

/** Team members who manage the catalogue also see drafts, archived pieces and stock. */
const isAdmin = (user: User | null): boolean => can(user, 'catalogue');
