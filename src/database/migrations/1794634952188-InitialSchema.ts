import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1794634952188 implements MigrationInterface {
  name = 'InitialSchema1794634952188';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "label" character varying(40), "fullName" character varying(120) NOT NULL, "phone" character varying(20) NOT NULL, "line1" character varying(200) NOT NULL, "line2" character varying(200), "landmark" character varying(200), "city" character varying(100) NOT NULL, "state" character varying(100) NOT NULL, "postalCode" character varying(12) NOT NULL, "country" character varying(2) NOT NULL DEFAULT 'IN', "isDefault" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_745d8f43d3af10ab8247465e450" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95c93a584de49f0b0e13f75363" ON "addresses"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dd5dc83e4f7409ad44e564871c" ON "addresses"  ("userId") WHERE "isDefault" = true`,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_refresh_tokens" ("id" character varying(64) NOT NULL, "familyId" character varying(64) NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "familyExpiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "claims" jsonb, CONSTRAINT "PK_df6893d2063a4ea7bbf1eda31e5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f2435c12b641c8c901bd6e8b55" ON "auth_refresh_tokens"  ("familyId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4cee0cefed5da7cdacff696683" ON "auth_refresh_tokens"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_208aee31318065f18fed597eaf" ON "auth_refresh_tokens"  ("expiresAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb4b299be30c3ba6de25e1fdef" ON "auth_refresh_tokens"  ("familyExpiresAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_revoked_families" ("familyId" character varying(64) NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f8ef765db47501e0ecd3bd7885d" PRIMARY KEY ("familyId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_email_tokens" ("id" character varying(64) NOT NULL, "purpose" character varying(30) NOT NULL, "userId" uuid NOT NULL, "email" character varying(254) NOT NULL, "fingerprint" character varying(64), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_f79cec7f9697a27ccb6b159e35c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cefe2276bce7287d23a6e47eb7" ON "auth_email_tokens"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a2416f2839688218ab277e7aa2" ON "auth_email_tokens"  ("expiresAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_sessions" ("id" character varying(64) NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastActiveAt" TIMESTAMP WITH TIME ZONE NOT NULL, "mfa" jsonb, "metadata" jsonb, "extra" jsonb, CONSTRAINT "PK_641507381f32580e8479efc36cd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_925b24d7fc2f9324ce972aee02" ON "auth_sessions"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."carts_status_enum" AS ENUM('active', 'converted')`,
    );
    await queryRunner.query(
      `CREATE TABLE "carts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customerId" uuid, "couponCode" character varying(40), "status" "public"."carts_status_enum" NOT NULL DEFAULT 'active', CONSTRAINT "PK_b5f695a59f5ebb50af3c8160816" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a4393093f31aabad6de1f54b0e" ON "carts"  ("customerId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "cart_items" ("cartId" uuid NOT NULL, "productId" uuid NOT NULL, "quantity" integer NOT NULL, CONSTRAINT "CHK_66dd42f2aee15437b7ec8caf99" CHECK ("quantity" > 0), CONSTRAINT "PK_2bf7996b7946ce753b60a87468c" PRIMARY KEY ("cartId", "productId"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."offers_type_enum" AS ENUM('percentage', 'fixed', 'free_shipping')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."offers_scope_enum" AS ENUM('all', 'categories', 'products')`,
    );
    await queryRunner.query(
      `CREATE TABLE "offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(160) NOT NULL, "description" text, "code" character varying(40), "autoApply" boolean NOT NULL DEFAULT false, "type" "public"."offers_type_enum" NOT NULL, "value" integer NOT NULL DEFAULT '0', "maxDiscountMinor" integer, "minSubtotalMinor" integer NOT NULL DEFAULT '0', "scope" "public"."offers_scope_enum" NOT NULL DEFAULT 'all', "targetIds" jsonb NOT NULL DEFAULT '[]', "firstOrderOnly" boolean NOT NULL DEFAULT false, "startsAt" TIMESTAMP WITH TIME ZONE, "endsAt" TIMESTAMP WITH TIME ZONE, "usageLimit" integer, "perCustomerLimit" integer, "usedCount" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "priority" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_4c88e956195bba85977da21b8f4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cae46299e89e2f0bf3f23b40b7" ON "offers"  ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "offer_redemptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "offerId" uuid NOT NULL, "customerKey" character varying(254) NOT NULL, "orderId" uuid NOT NULL, "discountMinor" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "releasedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a48942abc9cc81feec975a5c142" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a233b4e28f1832eb62fbfe206b" ON "offer_redemptions"  ("offerId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1e985ed99ae605d46515c2d7ba" ON "offer_redemptions"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8fc4d136f34cd15d9af0260026" ON "offer_redemptions"  ("offerId", "customerKey") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "type" character varying(40) NOT NULL, "message" text, "data" jsonb, "actorId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cc1b82b0fcf1be577d9d7ecbf8b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_74f8a596c01980f8e99f503c27" ON "order_events"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "productId" uuid NOT NULL, "sku" character varying(64) NOT NULL, "name" character varying(200) NOT NULL, "unitPriceMinor" integer NOT NULL, "quantity" integer NOT NULL, "lineTotalMinor" integer NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f1d359a55923bb45b057fbdab0" ON "order_items"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_paymentstatus_enum" AS ENUM('unpaid', 'paid', 'partially_refunded', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "number" character varying(30) NOT NULL, "customerId" uuid, "email" character varying(254) NOT NULL, "phone" character varying(30), "shippingAddress" jsonb NOT NULL, "currency" character varying(3) NOT NULL, "subtotalMinor" integer NOT NULL, "discountMinor" integer NOT NULL DEFAULT '0', "shippingMinor" integer NOT NULL DEFAULT '0', "shippingDiscountMinor" integer NOT NULL DEFAULT '0', "totalMinor" integer NOT NULL, "couponCode" character varying(40), "appliedOffer" jsonb, "shippingMethod" character varying(120), "status" "public"."orders_status_enum" NOT NULL DEFAULT 'pending_payment', "paymentStatus" "public"."orders_paymentstatus_enum" NOT NULL DEFAULT 'unpaid', "paidAt" TIMESTAMP WITH TIME ZONE, "deliveredAt" TIMESTAMP WITH TIME ZONE, "cancelledAt" TIMESTAMP WITH TIME ZONE, "cancelReason" character varying(60), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e174e347d448617acdf98fef0" ON "orders"  ("number") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e5de51ca888d8b1f5ac25799dd" ON "orders"  ("customerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_290bc8842ff16ea3be0f1a74c3" ON "orders"  ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_775c9f06fc27ae3ff8fb26f2c4" ON "orders"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_01b20118a3f640214e7a8a6b29" ON "orders"  ("paymentStatus") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'paid', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orderId" uuid NOT NULL, "provider" character varying(30) NOT NULL, "providerPaymentId" character varying(120), "providerChargeId" character varying(120), "amountMinor" integer NOT NULL, "currency" character varying(3) NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending', "failureReason" text, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af929a5f2a400fdb6913b4967e" ON "payments"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_32b41cdb985a296213e9a928b5" ON "payments"  ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ae74248237b064f6415e0e2cf0" ON "payments"  ("provider", "providerPaymentId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."refunds_reason_enum" AS ENUM('customer_request', 'order_cancelled', 'damaged', 'wrong_item', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."refunds_status_enum" AS ENUM('pending', 'succeeded', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "refunds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orderId" uuid NOT NULL, "paymentId" uuid NOT NULL, "amountMinor" integer NOT NULL, "currency" character varying(3) NOT NULL, "reason" "public"."refunds_reason_enum" NOT NULL, "note" text, "status" "public"."refunds_status_enum" NOT NULL DEFAULT 'pending', "provider" character varying(30) NOT NULL, "providerRefundId" character varying(120), "failureReason" text, "restocked" jsonb, "initiatedBy" uuid, CONSTRAINT "PK_5106efb01eeda7e49a78b869738" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_605cf4d367799f3e5cfb9f6822" ON "refunds"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a276dea330e561499e4a6e1b30" ON "refunds"  ("paymentId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_90c78d3c32a3346772edf34e73" ON "refunds"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_79fdce91ac4bd6a68d8c140759" ON "refunds"  ("providerRefundId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "shipping_zones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "countries" jsonb NOT NULL DEFAULT '[]', "states" jsonb NOT NULL DEFAULT '[]', "postalPrefixes" jsonb NOT NULL DEFAULT '[]', "priority" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_e55857b9198ec611b75d72ff958" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipping_rates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "zoneId" uuid NOT NULL, "code" character varying(40) NOT NULL, "name" character varying(120) NOT NULL, "carrier" character varying(60), "baseMinor" integer NOT NULL, "perKgMinor" integer NOT NULL DEFAULT '0', "freeOverMinor" integer, "maxWeightGrams" integer, "minDays" integer NOT NULL DEFAULT '3', "maxDays" integer NOT NULL DEFAULT '7', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_c97b830633433697b24df68885a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_16e6f709e7eb5af26b46de6585" ON "shipping_rates"  ("zoneId", "code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shipments_status_enum" AS ENUM('label_created', 'in_transit', 'out_for_delivery', 'delivered', 'failed_attempt', 'returned', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orderId" uuid NOT NULL, "carrier" character varying(60) NOT NULL, "trackingNumber" character varying(120) NOT NULL, "trackingUrl" character varying(500), "status" "public"."shipments_status_enum" NOT NULL DEFAULT 'in_transit', "items" jsonb NOT NULL, "events" jsonb NOT NULL DEFAULT '[]', "shippedAt" TIMESTAMP WITH TIME ZONE, "deliveredAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6deda4532ac542a93eab214b564" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_13ba957bcb616719a0dc3fca82" ON "shipments"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3300d7adbd17fdb51bdfd8c951" ON "shipments"  ("trackingNumber") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_identities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "provider" character varying(30) NOT NULL, "subject" character varying(255) NOT NULL, "email" character varying(254), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e23bff04e9c3e7b785e442b262c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_084cef3785217102f222e90ea7" ON "user_identities"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ad3f47ebbf0a5521265b4ea2c2" ON "user_identities"  ("provider", "subject") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('customer', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'suspended')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(254), "emailVerified" boolean NOT NULL DEFAULT false, "phone" character varying(16), "phoneVerified" boolean NOT NULL DEFAULT false, "passwordHash" text, "name" character varying(120), "avatarUrl" character varying(500), "role" "public"."users_role_enum" NOT NULL DEFAULT 'customer', "status" "public"."users_status_enum" NOT NULL DEFAULT 'active', "lastLoginAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a000cca60bcf04454e72769949" ON "users"  ("phone") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ace513fa30d485cfd25c11a9e4" ON "users"  ("role") `,
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "slug" character varying(140) NOT NULL, "description" text, "imageUrl" character varying(500), "isActive" boolean NOT NULL DEFAULT true, "sortOrder" integer NOT NULL DEFAULT '0', "parentId" uuid, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_420d9f679d41281f282f5bc7d0" ON "categories"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE TABLE "stock" ("productId" uuid NOT NULL, "onHand" integer NOT NULL DEFAULT '0', "reserved" integer NOT NULL DEFAULT '0', "lowStockThreshold" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_1a332b823d41def48d72f44005" CHECK ("reserved" >= 0 AND "reserved" <= "onHand"), CONSTRAINT "CHK_b4efbe8e3dac1dc36c3db3e28f" CHECK ("onHand" >= 0), CONSTRAINT "PK_e855a71c31948188c2bf78824a5" PRIMARY KEY ("productId"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."products_status_enum" AS ENUM('draft', 'active', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "sku" character varying(64) NOT NULL, "name" character varying(200) NOT NULL, "slug" character varying(220) NOT NULL, "description" text, "price" numeric(12,2), "compareAtPrice" numeric(12,2), "legacyId" integer, "sortOrder" integer NOT NULL DEFAULT '0', "diamondType" character varying(60), "tags" jsonb NOT NULL DEFAULT '[]', "sizes" jsonb NOT NULL DEFAULT '[]', "colors" jsonb NOT NULL DEFAULT '[]', "layoutImages" jsonb NOT NULL DEFAULT '[]', "isNewArrival" boolean NOT NULL DEFAULT false, "isNewCollection" boolean NOT NULL DEFAULT false, "isRecommended" boolean NOT NULL DEFAULT false, "weightGrams" integer NOT NULL DEFAULT '0', "currency" character varying(3) NOT NULL DEFAULT 'INR', "status" "public"."products_status_enum" NOT NULL DEFAULT 'draft', "images" jsonb NOT NULL DEFAULT '[]', "attributes" jsonb NOT NULL DEFAULT '{}', "categoryId" uuid, CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c44ac33a05b144dd0d9ddcf932" ON "products"  ("sku") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_464f927ae360106b783ed0b410" ON "products"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b031da926770b299d9ecdf2aae" ON "products"  ("legacyId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8255e0db628b8d7c7053f06189" ON "products"  ("sortOrder") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1846199852a695713b1f8f5e9a" ON "products"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ff56834e735fa78a15d0cf2192" ON "products"  ("categoryId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "wishlist_items" ("customerId" uuid NOT NULL, "productId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_33724555bd846f3f31b998136b9" PRIMARY KEY ("customerId", "productId"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."stock_movements_reason_enum" AS ENUM('restock', 'adjustment', 'return', 'reserve', 'release', 'sale')`,
    );
    await queryRunner.query(
      `CREATE TABLE "stock_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "productId" uuid NOT NULL, "onHandDelta" integer NOT NULL DEFAULT '0', "reservedDelta" integer NOT NULL DEFAULT '0', "reason" "public"."stock_movements_reason_enum" NOT NULL, "reference" character varying(120), "note" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_57a26b190618550d8e65fb860e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a3acb59db67e977be45e382fc5" ON "stock_movements"  ("productId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_06f0c5a720f8750702edb44bf4" ON "stock_movements"  ("reference") `,
    );
    await queryRunner.query(
      `CREATE TABLE "cms_banners" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(200) NOT NULL, "subtitle" character varying(300), "imageUrl" character varying(500) NOT NULL, "linkUrl" character varying(500), "placement" character varying(60) NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "startsAt" TIMESTAMP WITH TIME ZONE, "endsAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ea6961bbc639ded31606c57c5bf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f2dd642fdfde59660c14180916" ON "cms_banners"  ("placement") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cms_pages_status_enum" AS ENUM('draft', 'published')`,
    );
    await queryRunner.query(
      `CREATE TABLE "cms_pages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "slug" character varying(160) NOT NULL, "title" character varying(200) NOT NULL, "content" text NOT NULL DEFAULT '', "blocks" jsonb NOT NULL DEFAULT '[]', "seoTitle" character varying(200), "seoDescription" character varying(400), "status" "public"."cms_pages_status_enum" NOT NULL DEFAULT 'draft', "publishedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a6bd4d97252f8f122d34bc6bce6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_164bf011d905e86e677bc86a1e" ON "cms_pages"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2bdcc106771440ffdd3e9c75c9" ON "cms_pages"  ("status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_edd714311619a5ad09525045838" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipping_rates" ADD CONSTRAINT "FK_96388e6b9496fd05fd24f60d849" FOREIGN KEY ("zoneId") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_identities" ADD CONSTRAINT "FK_084cef3785217102f222e90ea7c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock" ADD CONSTRAINT "FK_e855a71c31948188c2bf78824a5" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_485ece8ab9b569d1c560144aa25" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_485ece8ab9b569d1c560144aa25"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_ff56834e735fa78a15d0cf21926"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock" DROP CONSTRAINT "FK_e855a71c31948188c2bf78824a5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_identities" DROP CONSTRAINT "FK_084cef3785217102f222e90ea7c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipping_rates" DROP CONSTRAINT "FK_96388e6b9496fd05fd24f60d849"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_edd714311619a5ad09525045838"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2bdcc106771440ffdd3e9c75c9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_164bf011d905e86e677bc86a1e"`,
    );
    await queryRunner.query(`DROP TABLE "cms_pages"`);
    await queryRunner.query(`DROP TYPE "public"."cms_pages_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f2dd642fdfde59660c14180916"`,
    );
    await queryRunner.query(`DROP TABLE "cms_banners"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_06f0c5a720f8750702edb44bf4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a3acb59db67e977be45e382fc5"`,
    );
    await queryRunner.query(`DROP TABLE "stock_movements"`);
    await queryRunner.query(`DROP TYPE "public"."stock_movements_reason_enum"`);
    await queryRunner.query(`DROP TABLE "wishlist_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ff56834e735fa78a15d0cf2192"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1846199852a695713b1f8f5e9a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8255e0db628b8d7c7053f06189"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b031da926770b299d9ecdf2aae"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_464f927ae360106b783ed0b410"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c44ac33a05b144dd0d9ddcf932"`,
    );
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TYPE "public"."products_status_enum"`);
    await queryRunner.query(`DROP TABLE "stock"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_420d9f679d41281f282f5bc7d0"`,
    );
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ace513fa30d485cfd25c11a9e4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a000cca60bcf04454e72769949"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ad3f47ebbf0a5521265b4ea2c2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_084cef3785217102f222e90ea7"`,
    );
    await queryRunner.query(`DROP TABLE "user_identities"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3300d7adbd17fdb51bdfd8c951"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_13ba957bcb616719a0dc3fca82"`,
    );
    await queryRunner.query(`DROP TABLE "shipments"`);
    await queryRunner.query(`DROP TYPE "public"."shipments_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_16e6f709e7eb5af26b46de6585"`,
    );
    await queryRunner.query(`DROP TABLE "shipping_rates"`);
    await queryRunner.query(`DROP TABLE "shipping_zones"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_79fdce91ac4bd6a68d8c140759"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_90c78d3c32a3346772edf34e73"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a276dea330e561499e4a6e1b30"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_605cf4d367799f3e5cfb9f6822"`,
    );
    await queryRunner.query(`DROP TABLE "refunds"`);
    await queryRunner.query(`DROP TYPE "public"."refunds_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."refunds_reason_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ae74248237b064f6415e0e2cf0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_32b41cdb985a296213e9a928b5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_af929a5f2a400fdb6913b4967e"`,
    );
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_01b20118a3f640214e7a8a6b29"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_775c9f06fc27ae3ff8fb26f2c4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_290bc8842ff16ea3be0f1a74c3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e5de51ca888d8b1f5ac25799dd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4e174e347d448617acdf98fef0"`,
    );
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_paymentstatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f1d359a55923bb45b057fbdab0"`,
    );
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_74f8a596c01980f8e99f503c27"`,
    );
    await queryRunner.query(`DROP TABLE "order_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8fc4d136f34cd15d9af0260026"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1e985ed99ae605d46515c2d7ba"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a233b4e28f1832eb62fbfe206b"`,
    );
    await queryRunner.query(`DROP TABLE "offer_redemptions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cae46299e89e2f0bf3f23b40b7"`,
    );
    await queryRunner.query(`DROP TABLE "offers"`);
    await queryRunner.query(`DROP TYPE "public"."offers_scope_enum"`);
    await queryRunner.query(`DROP TYPE "public"."offers_type_enum"`);
    await queryRunner.query(`DROP TABLE "cart_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a4393093f31aabad6de1f54b0e"`,
    );
    await queryRunner.query(`DROP TABLE "carts"`);
    await queryRunner.query(`DROP TYPE "public"."carts_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_925b24d7fc2f9324ce972aee02"`,
    );
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a2416f2839688218ab277e7aa2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cefe2276bce7287d23a6e47eb7"`,
    );
    await queryRunner.query(`DROP TABLE "auth_email_tokens"`);
    await queryRunner.query(`DROP TABLE "auth_revoked_families"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bb4b299be30c3ba6de25e1fdef"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_208aee31318065f18fed597eaf"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4cee0cefed5da7cdacff696683"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f2435c12b641c8c901bd6e8b55"`,
    );
    await queryRunner.query(`DROP TABLE "auth_refresh_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dd5dc83e4f7409ad44e564871c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_95c93a584de49f0b0e13f75363"`,
    );
    await queryRunner.query(`DROP TABLE "addresses"`);
  }
}
