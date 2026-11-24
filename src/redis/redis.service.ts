import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';

/** Thin cache-aside helper over the Redis-backed cache. Cache failures never break requests. */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async remember<T>(
    key: string,
    loader: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    try {
      const hit = await this.cache.get<T>(key);
      if (hit !== undefined && hit !== null) return hit;
    } catch (err) {
      this.logger.warn(`cache get failed for ${key}: ${String(err)}`);
    }
    const value = await loader();
    if (value !== undefined && value !== null) {
      try {
        await this.cache.set(key, value, ttlMs);
      } catch (err) {
        this.logger.warn(`cache set failed for ${key}: ${String(err)}`);
      }
    }
    return value;
  }

  async forget(...keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        try {
          await this.cache.del(key);
        } catch (err) {
          this.logger.warn(`cache del failed for ${key}: ${String(err)}`);
        }
      }),
    );
  }

  async ping(): Promise<boolean> {
    const key = 'health:ping';
    await this.cache.set(key, 'pong', 5_000);
    return (await this.cache.get<string>(key)) === 'pong';
  }
}
