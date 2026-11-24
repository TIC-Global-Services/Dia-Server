import { MigrationInterface, QueryRunner } from 'typeorm';

export class BannerMedia1794660000000 implements MigrationInterface {
  name = 'BannerMedia1794660000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "cms_banners" ADD "mediaType" character varying(10) NOT NULL DEFAULT 'image'`);
    await q.query(`ALTER TABLE "cms_banners" ADD "videoUrl" character varying(500)`);
    await q.query(`ALTER TABLE "cms_banners" ADD "buttonLabel" character varying(60)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "cms_banners" DROP COLUMN "buttonLabel"`);
    await q.query(`ALTER TABLE "cms_banners" DROP COLUMN "videoUrl"`);
    await q.query(`ALTER TABLE "cms_banners" DROP COLUMN "mediaType"`);
  }
}
