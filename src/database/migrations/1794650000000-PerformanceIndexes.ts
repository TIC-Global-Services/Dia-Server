import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for the admin lists, search and dashboard once tables hold millions of rows.
 *
 * - Lists sort by newest first, so each filter gets an index that already is in that order
 *   (status, createdAt DESC), and the page is read from the index instead of sorting the table.
 * - Substring search (`ILIKE '%text%'`) cannot use a btree. pg_trgm GIN indexes make it fast.
 * - The customer index INCLUDEs the columns the Customers page totals, so those come from the
 *   index alone.
 * - Plain single-column indexes that a composite index now covers are dropped, which also makes
 *   every order and product write cheaper.
 *
 * Everything is CONCURRENTLY, so nothing is locked while it builds on a live database. That cannot
 * run inside a transaction, hence `transaction = false`.
 *
 * NOTE for `migration:generate`: TypeORM cannot describe descending, INCLUDE, expression or trigram
 * indexes in entities, so it will propose dropping the IDX_*_created / *_trgm / IDX_stock_low
 * indexes below. Delete those DROP lines from any generated migration.
 */
export class PerformanceIndexes1794650000000 implements MigrationInterface {
  name = 'PerformanceIndexes1794650000000';
  transaction = false as const;

  private static readonly create = [
    // orders
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_orders_created" ON "orders" ("createdAt" DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_orders_status_created" ON "orders" ("status", "createdAt" DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_orders_payment_created" ON "orders" ("paymentStatus", "createdAt" DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_orders_customer_created" ON "orders" ("customerId", "createdAt" DESC) INCLUDE ("totalMinor", "paymentStatus")`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_orders_email_trgm" ON "orders" USING gin ("email" gin_trgm_ops)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_orders_number_trgm" ON "orders" USING gin ("number" gin_trgm_ops)`,
    // order detail and reporting
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_order_events_order_created" ON "order_events" ("orderId", "createdAt")`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_order_items_product" ON "order_items" ("productId")`,
    // people
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_role_created" ON "users" ("role", "createdAt" DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_staff_created" ON "users" ("createdAt" DESC) WHERE "role" <> 'customer'`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_email_trgm" ON "users" USING gin ("email" gin_trgm_ops)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_name_trgm" ON "users" USING gin ("name" gin_trgm_ops)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_phone_trgm" ON "users" USING gin ("phone" gin_trgm_ops)`,
    // catalogue
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_products_status_order" ON "products" ("status", "sortOrder", "createdAt" DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_products_category_status_order" ON "products" ("categoryId", "status", "sortOrder", "createdAt" DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_products_price_on_request" ON "products" ("sortOrder", "createdAt" DESC) WHERE "price" IS NULL`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_products_name_trgm" ON "products" USING gin ("name" gin_trgm_ops)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_products_sku_trgm" ON "products" USING gin ("sku" gin_trgm_ops)`,
    // stock
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_stock_low" ON "stock" ((("onHand" - "reserved" - "lowStockThreshold")))`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_stock_movements_product_created" ON "stock_movements" ("productId", "createdAt" DESC)`,
  ];

  /** Old single-column indexes that the ones above make redundant: [name, column definition to restore]. */
  private static readonly replaced: [string, string, string][] = [
    ['IDX_775c9f06fc27ae3ff8fb26f2c4', 'orders', '("status")'],
    ['IDX_01b20118a3f640214e7a8a6b29', 'orders', '("paymentStatus")'],
    ['IDX_e5de51ca888d8b1f5ac25799dd', 'orders', '("customerId")'],
    ['IDX_ace513fa30d485cfd25c11a9e4', 'users', '("role")'],
    ['IDX_1846199852a695713b1f8f5e9a', 'products', '("status")'],
    ['IDX_8255e0db628b8d7c7053f06189', 'products', '("sortOrder")'],
    ['IDX_ff56834e735fa78a15d0cf2192', 'products', '("categoryId")'],
    ['IDX_a3acb59db67e977be45e382fc5', 'stock_movements', '("productId")'],
    ['IDX_74f8a596c01980f8e99f503c27', 'order_events', '("orderId")'],
  ];

  private static readonly tables = ['orders', 'order_items', 'order_events', 'users', 'products', 'stock', 'stock_movements'];

  public async up(q: QueryRunner): Promise<void> {
    // Building indexes on big tables takes longer than the API's normal query time limit.
    await q.query(`SET statement_timeout = 0`);
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    for (const sql of PerformanceIndexes1794650000000.create) await q.query(sql);
    for (const [name] of PerformanceIndexes1794650000000.replaced) await q.query(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
    for (const t of PerformanceIndexes1794650000000.tables) await q.query(`ANALYZE "${t}"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`SET statement_timeout = 0`);
    for (const [name, table, cols] of PerformanceIndexes1794650000000.replaced) {
      await q.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON "${table}" ${cols}`);
    }
    for (const sql of PerformanceIndexes1794650000000.create) {
      const name = /"(IDX_[a-z_]+)"/.exec(sql)![1];
      await q.query(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
    }
  }
}
