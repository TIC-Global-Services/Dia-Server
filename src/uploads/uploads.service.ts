import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDisk, StorageDisk, type StoredUpload } from '@nestjs/storage';
import type { Env } from '../config/env.schema.js';

export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

@Injectable()
export class UploadsService {
  constructor(
    @InjectDisk('files') private readonly disk: StorageDisk,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get configured(): boolean {
    return Boolean(this.config.get('R2_BUCKET', { infer: true }));
  }

  assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Image storage (Cloudflare R2) is not configured',
      );
    }
  }

  describe(file: StoredUpload) {
    return {
      key: file.key,
      url: this.disk.url(file.key),
      contentType: file.contentType,
      size: file.size,
    };
  }

  async putVideo(key: string, body: Buffer, contentType: string) {
    await this.disk.put(key, body, {
      contentType,
      // Names never repeat, so browsers and Cloudflare may cache them forever.
      cacheControl: 'public, max-age=31536000, immutable',
    });
    return { key, url: this.disk.url(key), contentType, size: body.length };
  }

  /** Removes an uploaded image. Only keys this app could have created are accepted. */
  async remove(key: string): Promise<void> {
    this.assertConfigured();
    await this.disk.delete(key);
  }
}
