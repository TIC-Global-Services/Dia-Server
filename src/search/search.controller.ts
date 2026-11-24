import { Can } from '@nestjs/authorization';
import { Public } from '@nestjs/authentication';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  searchProductsSchema,
  type SearchProductsQuery,
} from './dto/search-products.dto.js';
import { SearchService } from './search.service.js';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('products')
  products(
    @Query({ schema: searchProductsSchema }) query: SearchProductsQuery,
  ) {
    return this.searchService.searchProducts(query);
  }

  /** Rebuild the product index from Postgres. */
  @Post('reindex')
  @HttpCode(200)
  @Can(PermissionPolicy, 'catalogue')
  @ApiBearerAuth()
  reindex() {
    return this.searchService.reindexAll();
  }
}
