import { MigrationInterface, QueryRunner } from 'typeorm';

export class MetalsAndDiamond1794680000000 implements MigrationInterface {
  name = 'MetalsAndDiamond1794680000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" RENAME COLUMN "netGoldWeight" TO "netMetalWeight"`);
    await q.query(`ALTER TABLE "products" ADD "metal" character varying(10) NOT NULL DEFAULT 'gold'`);
    await q.query(`ALTER TABLE "products" ADD "diamondCarats" numeric(8,3) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "products" ADD "diamondRatePerCarat" numeric(12,2) NOT NULL DEFAULT 0`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" DROP COLUMN "diamondRatePerCarat"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN "diamondCarats"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN "metal"`);
    await q.query(`ALTER TABLE "products" RENAME COLUMN "netMetalWeight" TO "netGoldWeight"`);
  }
}
