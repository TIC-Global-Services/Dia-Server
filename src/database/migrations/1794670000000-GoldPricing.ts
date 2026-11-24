import { MigrationInterface, QueryRunner } from 'typeorm';

export class GoldPricing1794670000000 implements MigrationInterface {
  name = 'GoldPricing1794670000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" ADD "netGoldWeight" numeric(10,3)`);
    await q.query(`ALTER TABLE "products" ADD "makingChargePercent" numeric(5,2) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "products" ADD "stoneCharges" numeric(12,2) NOT NULL DEFAULT 0`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" DROP COLUMN "stoneCharges"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN "makingChargePercent"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN "netGoldWeight"`);
  }
}
