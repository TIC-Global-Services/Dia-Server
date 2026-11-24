import { Module } from '@nestjs/common';
import { CategoriesModule } from './categories/categories.module.js';
import { ProductsModule } from './products/products.module.js';
import { StockModule } from './stock/stock.module.js';

@Module({
  imports: [CategoriesModule, ProductsModule, StockModule],
})
export class CatalogModule {}
