import { Public } from '@nestjs/authentication';
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { RedisService } from '../redis/redis.service.js';
import { SearchService } from '../search/search.service.js';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly indicator: HealthIndicatorService,
    private readonly redis: RedisService,
    private readonly search: SearchService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('postgres', { timeout: 1500 }),
      () =>
        this.indicator
          .check('redis')
          .attempt(async () => {
            if (!(await this.redis.ping())) throw new Error('ping mismatch');
          })
          .withTimeout(1500),
      () =>
        this.indicator
          .check('elasticsearch')
          .attempt(async () => {
            if (!(await this.search.ping())) throw new Error('no response');
          })
          .withTimeout(1500),
    ]);
  }
}
