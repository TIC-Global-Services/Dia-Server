import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { SearchModule } from '../search/search.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule, SearchModule],
  controllers: [HealthController],
})
export class HealthModule {}
