import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';

const DEV_SECRET = 'dev-only-insecure-jwt-secret-0123456789';

/** The schema forces JWT_SECRET in production; the fallback only exists for local dev and tests. */
export const jwtSecret = (config: ConfigService<Env, true>): string =>
  config.get('JWT_SECRET', { infer: true }) ?? DEV_SECRET;
