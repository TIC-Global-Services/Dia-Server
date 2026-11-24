import { CacheModule } from '@nestjs/cache-manager';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';
import type { Env } from '../config/env.schema.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const logger = new Logger('Redis');
        const store = createKeyv(config.get('REDIS_URL', { infer: true }), {
          namespace: 'dia',
        });
        // Without a listener a dropped connection would crash the process.
        store.on('error', (err: unknown) => logger.error(String(err)));
        return {
          stores: [store],
          ttl: config.get('CACHE_TTL_MS', { infer: true }),
        };
      },
    }),
  ],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisModule {}
