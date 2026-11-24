import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderItemImage1794637309585 implements MigrationInterface {
  name = 'OrderItemImage1794637309585';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD "image" character varying(500)`,
    );
    // Give orders that already exist the piece's first photograph, so they are recognisable too.
    await queryRunner.query(
      `UPDATE "order_items" oi SET "image" = p."colors"->0->>'image'
               FROM "products" p WHERE p."id" = oi."productId" AND jsonb_array_length(p."colors") > 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "image"`);
  }
}
