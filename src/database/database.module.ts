import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../config/env.schema.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        type: 'postgres' as const,
        host: config.get('DB_HOST', { infer: true }),
        port: config.get('DB_PORT', { infer: true }),
        username: config.get('DB_USER', { infer: true }),
        password: config.get('DB_PASSWORD', { infer: true }),
        database: config.get('DB_NAME', { infer: true }),
        ssl: config.get('DB_SSL', { infer: true }),
        synchronize: config.get('DB_SYNCHRONIZE', { infer: true }),
        migrations: [join(import.meta.dirname, 'migrations', '*.js')],
        // One transaction per migration, so a migration may opt out (CREATE INDEX CONCURRENTLY).
        migrationsTransactionMode: 'each' as const,
        migrationsRun: config.get('DB_MIGRATIONS_RUN', { infer: true }),
        autoLoadEntities: true,
        extra: {
          max: config.get('DB_POOL_MAX', { infer: true }),
          statement_timeout: config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true }),
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
