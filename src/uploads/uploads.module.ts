import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InMemoryDisk, S3Disk, StorageModule } from '@nestjs/storage';
import type { Env } from '../config/env.schema.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

@Module({
  imports: [
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const get = <K extends keyof Env>(key: K) =>
          config.get(key, { infer: true }) as Env[K];
        const configured = Boolean(get('R2_BUCKET'));
        return {
          default: 'files',
          disks: {
            // Without R2 settings the disk is a throwaway placeholder and the endpoint refuses uploads,
            // so images are never silently lost.
            files: configured
              ? new S3Disk({
                  endpoint:
                    get('R2_ENDPOINT') ??
                    `https://${get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
                  forcePathStyle: Boolean(get('R2_ENDPOINT')),
                  region: 'auto',
                  bucket: get('R2_BUCKET')!,
                  publicUrl: get('R2_PUBLIC_URL')!.replace(/\/+$/, ''),
                  credentials: {
                    accessKeyId: get('R2_ACCESS_KEY_ID')!,
                    secretAccessKey: get('R2_SECRET_ACCESS_KEY')!,
                  },
                })
              : new InMemoryDisk({
                  publicUrl: 'http://localhost/not-configured',
                }),
          },
        };
      },
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
