<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Database: migrations and seed

```bash
npm run build
npm run migration:run         # apply pending migrations (or set DB_MIGRATIONS_RUN=true to do it at startup)
npm run seed                  # load seed-data/products_new.json (240 products, 5 categories) and rebuild the search index
npm run seed -- --force       # also overwrite products that already exist with the file's values
```

- Never use `DB_SYNCHRONIZE=true` outside throwaway databases. After changing an entity:
  `npm run migration:generate -- src/database/migrations/WhatChanged`, review the file, commit it.
- `npm run migration:revert` undoes the last migration; `npm run migration:show` lists them.
- The seed stores the catalog exactly as in the file: names, descriptions, tags, sizes, colours with their image URLs, page images, flags and order. Products have no price (price on request) and no stock until entered in the admin.
- Changing the Elasticsearch mapping needs a new index: delete `dia-products` and run `npm run seed` or `POST /search/reindex`.

## Image uploads (Cloudflare R2)

`POST /uploads?folder=product/rings` (admin, multipart field `file`) stores an image in an R2 bucket through its S3 API and returns `{ url, key }`. Built on `@nestjs/storage`.

1. In Cloudflare: create (or reuse) an R2 bucket, enable its public access (r2.dev URL or a custom domain), and create an API token with *Object Read & Write* on that bucket.
2. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (all or none). The existing catalog images use `https://pub-0364ee20e0724579b28b7900df70d9fa.r2.dev`, which is the same bucket layout (`diadiamonds/product/<category>/...`).
3. Without them uploads answer 503; nothing is stored anywhere else.

Only JPEG, PNG, WebP, AVIF and GIF up to 10 MB are accepted. The type is detected from the file's bytes, so a renamed text file or an SVG is refused (415). Files get unique names and a one-year cache header. If you serve images from a custom domain, add it to `images.remotePatterns` in the website's `next.config.ts`.

## E-commerce backend

Modules: `catalog` (categories, products, stock), `cms` (pages, banners), `search` (Elasticsearch), `redis` (cache), `database` (Postgres/TypeORM), `health`.

```bash
cp .env.example .env
docker compose up -d      # postgres, redis, elasticsearch
npm run start:dev         # http://localhost:4000, Swagger at /docs, health at /health
```

- Postgres is the source of truth. Products sync to Elasticsearch through events (best effort); `POST /search/reindex` rebuilds the index.
- Stock = `onHand` and `reserved`, changed only by guarded SQL updates (`reserve` / `release` / `commit` / `adjust`) and logged in `stock_movements`.
- `DB_SYNCHRONIZE=true` creates tables in dev. Production needs migrations (not set up yet).

### Auth and accounts

- Built on Nest's `@nestjs/authentication` (JWT access tokens, single-use rotating refresh tokens stored in Postgres, scrypt password hashing) and `@nestjs/authorization` (deny by default: every route is `@Public()`, `@Can.Anyone()` or `@Can(Policy, ability)`).
- Sign in with email + password, mobile OTP (`/auth/otp/request`, `/auth/otp/verify`), or a social ID token (`/auth/social/google|apple|facebook`). Password reset and email verification are emailed.
- Roles: `customer` and `admin`. `ADMIN_EMAIL` + `ADMIN_PASSWORD` create the first admin on boot. Back-office routes use `@Can(AdminPolicy, 'manage')`.
- `/users/me`, `/addresses` (address book with one default), `/wishlist`, `/orders` need a signed-in customer. Cart, checkout and viewing an order by id also work for guests.
- Without OTPFlow/Resend keys, OTP codes and emails are logged in development; production refuses to start without `RESEND_API_KEY` and `JWT_SECRET`, and refuses to send SMS without an OTPFlow key.

### Cart, checkout, orders

- `POST /carts` -> items -> optional `PUT /carts/:id/coupon` -> `POST /checkout/quote` (shipping options and a full price breakdown) -> `POST /checkout`.
- Prices, coupons and shipping are always computed on the server. total = subtotal - discount + shipping - shipping discount, all in minor units (paise/cents).
- Checkout claims the cart, reserves stock, creates the order and uses up the offer in one transaction, then starts the payment. A failure undoes the earlier steps. Unpaid orders expire after `ORDER_PAYMENT_TTL_MINUTES`.
- Order `status`: pending_payment, confirmed, processing, shipped, delivered, cancelled. `paymentStatus`: unpaid, paid, partially_refunded, refunded. Every order has a timeline (`GET /orders/:id`).
- Customers cancel before shipping. After payment that restocks the goods and refunds automatically.

### Offers

- Admin creates percentage, fixed or free-shipping offers (`/offers`): coupon code or automatic, scoped to all items, categories or products, with minimum spend, date window, total and per-customer limits, first-order-only. At most one offer applies per order: the coupon if given, otherwise the best automatic one. Redemption is atomic, cancellations give the use back.

### Shipping

- Admin defines zones (country, states, postal prefixes, priority) and rates (base + per kg, free over a threshold, max weight, ETA) under `/shipping`. Product `weightGrams` drives the price.
- Shipments (`POST /orders/:id/shipments`, `PATCH /shipments/:id/status`) support partial shipments and tracking; the order moves to shipped and delivered by itself. Carriers are entered by hand (name, tracking number); no carrier API is integrated.

### Payments and refunds

- Payment providers: `GET /payments/providers` (Razorpay, Stripe, COD). To add one, implement `PaymentProvider` (`src/payment/payment-provider.ts`, including `refund()` and webhook parsing) and register it in `PaymentModule`.
- Point provider webhooks at `POST /payments/webhooks/razorpay` and `/stripe` (signature verified; set the `*_WEBHOOK_SECRET` values). They also carry refund results.
- Refunds (`POST /admin/orders/:id/refunds`): partial or full, never more than was paid (checked under a row lock), idempotent at the provider, optional restock of returned goods. Customers get an automatic full refund when they cancel a paid order.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. To connect it, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It writes the app key and secret into `.env` and makes every `nest start` script (`start`, `start:dev`, `start:debug`) load it. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand: create an application and an API key at [observe.nestjs.com](https://observe.nestjs.com), and set the pair as `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment the app runs in.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
