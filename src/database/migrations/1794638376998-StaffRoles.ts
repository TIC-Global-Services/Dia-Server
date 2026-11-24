import { MigrationInterface, QueryRunner } from "typeorm";

export class StaffRoles1794638376998 implements MigrationInterface {
    name = 'StaffRoles1794638376998'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "roles" ("key" character varying(40) NOT NULL, "name" character varying(80) NOT NULL, "description" character varying(300), "permissions" jsonb NOT NULL DEFAULT '[]', "builtIn" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a87cf0659c3ac379b339acf36a2" PRIMARY KEY ("key"))`);
        // Convert in place (an enum -> varchar cast) so every user keeps the role they have.
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE character varying(40) USING "role"::text`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'customer'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Custom roles have no meaning in the old enum: anyone on one falls back to customer.
        await queryRunner.query(`UPDATE "users" SET "role" = 'customer' WHERE "role" NOT IN ('customer', 'admin')`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('customer', 'admin')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"public"."users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'customer'`);
        await queryRunner.query(`DROP TABLE "roles"`);
    }

}
