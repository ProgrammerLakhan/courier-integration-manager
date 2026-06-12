import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class ConsolidateAndIndex1749600010000 implements MigrationInterface {
  name = 'ConsolidateAndIndex1749600010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add new consolidated courier_config column
    await queryRunner.query(`
      ALTER TABLE "courier_providers" 
      ADD COLUMN IF NOT EXISTS "courier_config" JSONB;
    `);

    // 2. Migrate existing data if old columns exist (safe for fresh or existing DBs)
    await queryRunner.query(`
      UPDATE "courier_providers"
      SET "courier_config" = jsonb_build_object(
        'authType', "auth_type",
        'authEndpoint', "auth_endpoint",
        'authCredentials', "auth_credentials"
      ) || COALESCE("extra_config", '{}'::jsonb)
      WHERE "courier_config" IS NULL 
        AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='courier_providers' AND column_name='auth_type'
        );
    `);

    // 3. Drop old columns if they exist
    const dropColumns = ['auth_type', 'auth_endpoint', 'auth_credentials', 'extra_config'];
    for (const col of dropColumns) {
      await queryRunner.query(`
        ALTER TABLE "courier_providers" 
        DROP COLUMN IF EXISTS "${col}";
      `);
    }

    // 4. Create composite indexes on orders to optimize paginated list queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_orders_partner_status_created_at" 
      ON "orders" ("courier_partner", "status", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_orders_partner_status_updated_at" 
      ON "orders" ("courier_partner", "status", "updated_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop composite indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_orders_partner_status_updated_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_orders_partner_status_created_at"`);

    // 2. Re-create old columns
    await queryRunner.query(`
      ALTER TABLE "courier_providers" 
      ADD COLUMN IF NOT EXISTS "auth_type" courier_auth_type_enum NOT NULL DEFAULT 'BEARER_TOKEN';
    `);
    await queryRunner.query(`
      ALTER TABLE "courier_providers" 
      ADD COLUMN IF NOT EXISTS "auth_endpoint" VARCHAR(255);
    `);
    await queryRunner.query(`
      ALTER TABLE "courier_providers" 
      ADD COLUMN IF NOT EXISTS "auth_credentials" JSONB;
    `);
    await queryRunner.query(`
      ALTER TABLE "courier_providers" 
      ADD COLUMN IF NOT EXISTS "extra_config" JSONB;
    `);

    // 3. Restore data from courier_config back to old columns
    await queryRunner.query(`
      UPDATE "courier_providers"
      SET 
        "auth_type" = COALESCE(("courier_config"->>'authType')::courier_auth_type_enum, 'NONE'),
        "auth_endpoint" = "courier_config"->>'authEndpoint',
        "auth_credentials" = "courier_config"->'authCredentials',
        "extra_config" = "courier_config" - 'authType' - 'authEndpoint' - 'authCredentials'
      WHERE "courier_config" IS NOT NULL;
    `);

    // 4. Drop the consolidated column
    await queryRunner.query(`
      ALTER TABLE "courier_providers" 
      DROP COLUMN IF EXISTS "courier_config";
    `);
  }
}
