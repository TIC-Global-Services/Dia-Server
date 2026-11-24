import { MigrationInterface, QueryRunner } from 'typeorm';

export class Settings1794641000000 implements MigrationInterface {
  name = 'Settings1794641000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "settings" (
        "key" character varying(80) NOT NULL,
        "value" text NOT NULL,
        "secret" boolean NOT NULL DEFAULT false,
        "updatedBy" uuid,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_settings_key" PRIMARY KEY ("key")
      )`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "settings"`);
  }
}
