import { z } from 'zod';

const boolFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().default(4000),
    // Browser origins allowed to call the API (storefront, admin app), comma separated.
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:5173'),

    // PostgreSQL
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.coerce.number().int().default(5432),
    DB_USER: z.string().default('dia'),
    DB_PASSWORD: z.string().default('dia'),
    DB_NAME: z.string().default('dia'),
    DB_SSL: boolFromString.default(false),
    // Connections the API may hold open to Postgres.
    DB_POOL_MAX: z.coerce.number().int().min(2).default(20),
    // Queries slower than this are abandoned, so one bad query cannot hold the pool.
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
    // Auto-create tables from entities. Keep false in production, use migrations.
    DB_SYNCHRONIZE: boolFromString.default(false),
    // Apply pending migrations when the app starts. Otherwise run `npm run migration:run`.
    DB_MIGRATIONS_RUN: boolFromString.default(false),

    // Requests allowed per IP per minute across the API. Raise only for load tests.
    THROTTLE_LIMIT: z.coerce.number().int().min(1).default(120),

    // Redis (cache)
    REDIS_URL: z.string().default('redis://localhost:6379'),
    CACHE_TTL_MS: z.coerce.number().int().default(60_000),

    // Elasticsearch
    ELASTICSEARCH_NODE: z.string().default('http://localhost:9200'),
    ELASTICSEARCH_USERNAME: z.string().optional(),
    ELASTICSEARCH_PASSWORD: z.string().optional(),
    ELASTICSEARCH_INDEX_PREFIX: z.string().default('dia'),

    // Payment providers. A provider is enabled when its keys are set.
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    COD_ENABLED: boolFromString.default(false),
    // Unpaid orders are cancelled and their stock released after this long.
    ORDER_PAYMENT_TTL_MINUTES: z.coerce.number().int().min(1).default(30),

    // Image storage on Cloudflare R2 (S3 API). All five or none: without them uploads answer 503.
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    // Public address of the bucket (r2.dev URL or custom domain), no trailing slash.
    R2_PUBLIC_URL: z.url().optional(),
    // Only for MinIO or a test double; leave unset for real R2.
    R2_ENDPOINT: z.url().optional(),

    // Auth
    // HS256 key, at least 32 chars. Required in production; dev has a fixed fallback.
    JWT_SECRET: z.string().min(32).optional(),
    JWT_ISSUER: z.string().default('dia-server'),
    JWT_AUDIENCE: z.string().default('dia-storefront'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    // Base URL of the storefront; email links point here.
    APP_URL: z.string().default('http://localhost:3000'),
  // Base URL of the admin app: password links for the team point here.
  ADMIN_URL: z.string().default('http://localhost:5173'),
    // First admin account, created on boot if no admin exists yet.
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(10).optional(),

    // Google sign-in: comma separated OAuth client ids accepted as token audience.
    GOOGLE_CLIENT_IDS: z.string().default(''),

    // Email (Resend when the key is set, otherwise logged to the console)
    MAIL_FROM: z.string().default('Dia <no-reply@dia.local>'),
    // Sender for verification and password emails. Falls back to MAIL_FROM.
    MAIL_FROM_ACCOUNT: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    // Published template in the Resend dashboard for the verify-email message. Empty = built-in template.
    RESEND_VERIFY_TEMPLATE_ID: z.string().optional(),
    // Shown in the footer of emails that use a Resend template.
    COMPANY_NAME: z.string().default('Dia Diamonds'),
    COMPANY_ADDRESS: z.string().default('diadiamonds.in'),

    // SMS for mobile OTP, delivered by OTPFlow; without a key codes are logged outside production
    // OTPFlow delivers the SMS (Indian mobiles only); we generate and check the code.
    OTPFLOW_API_KEY: z.string().optional(),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.JWT_SECRET, {
    message: 'JWT_SECRET is required in production',
    path: ['JWT_SECRET'],
  });

export type Env = z.infer<typeof envSchema>;
