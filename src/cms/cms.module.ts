import { Module } from '@nestjs/common';
import { PagesModule } from './pages/pages.module.js';
import { BannersModule } from './banners/banners.module.js';

@Module({
  imports: [PagesModule, BannersModule],
})
export class CmsModule {}
