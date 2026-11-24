import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationModule } from '@nestjs/authorization';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { createObserveModule } from '@nestjs/observe';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AddressesModule } from './addresses/addresses.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CartModule } from './cart/cart.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CheckoutModule } from './checkout/checkout.module.js';
import { CmsModule } from './cms/cms.module.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { OffersModule } from './offers/offers.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentModule } from './payment/payment.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RefundsModule } from './refunds/refunds.module.js';
import { SearchModule } from './search/search.module.js';
import { ShippingModule } from './shipping/shipping.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { RolesModule } from './roles/roles.module.js';
import { UsersModule } from './users/users.module.js';
import { WishlistModule } from './wishlist/wishlist.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { StatsModule } from './stats/stats.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'dia-server',
    }),
    AppConfigModule,
    SettingsModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Per-IP limit for every route; credential endpoints tighten it with @Throttle.
    // In-memory counters: with several instances, back this with Redis.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT ?? 120) },
    ]),

    // Infrastructure
    DatabaseModule,
    RedisModule,
    SearchModule,
    HealthModule,

    // Identity. Authentication must be registered before authorization.
    UsersModule,
    AuthModule,
    AuthorizationModule.forRoot(),
    AddressesModule,

    // Commerce
    CatalogModule,
    CmsModule,
    CartModule,
    WishlistModule,
    OffersModule,
    ShippingModule,
    PaymentModule,
    OrdersModule,
    CheckoutModule,
    RefundsModule,
    UploadsModule,
    StatsModule,
    RolesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
