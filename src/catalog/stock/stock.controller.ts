import { Can } from '@nestjs/authorization';
import { PermissionPolicy } from '../../auth/policies/permission.policy.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { uuidParam } from '../../common/pagination.js';
import {
  adjustStockSchema,
  stockLinesSchema,
  updateThresholdSchema,
  type AdjustStockDto,
  type StockLinesDto,
  type UpdateThresholdDto,
} from './dto/create-stock.dto.js';
import {
  listMovementsSchema,
  type ListMovementsQuery,
} from './dto/update-stock.dto.js';
import { StockService } from './stock.service.js';

@ApiTags('stock')
@ApiBearerAuth()
@Can(PermissionPolicy, 'catalogue')
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('low')
  findLow() {
    return this.stockService.findLow();
  }

  @Post('reserve')
  @HttpCode(200)
  reserve(@Body({ schema: stockLinesSchema }) dto: StockLinesDto) {
    return this.stockService.reserve(dto);
  }

  @Post('release')
  @HttpCode(200)
  release(@Body({ schema: stockLinesSchema }) dto: StockLinesDto) {
    return this.stockService.release(dto);
  }

  @Post('commit')
  @HttpCode(200)
  commit(@Body({ schema: stockLinesSchema }) dto: StockLinesDto) {
    return this.stockService.commit(dto);
  }

  @Get(':productId')
  findOne(@Param('productId', { schema: uuidParam }) productId: string) {
    return this.stockService.findOne(productId);
  }

  @Get(':productId/movements')
  movements(
    @Param('productId', { schema: uuidParam }) productId: string,
    @Query({ schema: listMovementsSchema }) query: ListMovementsQuery,
  ) {
    return this.stockService.movements(productId, query);
  }

  @Post(':productId/adjust')
  @HttpCode(200)
  adjust(
    @Param('productId', { schema: uuidParam }) productId: string,
    @Body({ schema: adjustStockSchema }) dto: AdjustStockDto,
  ) {
    return this.stockService.adjust(productId, dto);
  }

  @Patch(':productId/threshold')
  setThreshold(
    @Param('productId', { schema: uuidParam }) productId: string,
    @Body({ schema: updateThresholdSchema }) dto: UpdateThresholdDto,
  ) {
    return this.stockService.setThreshold(productId, dto);
  }
}
