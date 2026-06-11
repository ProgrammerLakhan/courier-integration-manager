import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class InitialSchema1749600000000 implements MigrationInterface {
  name = 'InitialSchema1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE user_role_enum AS ENUM ('ADMIN', 'OPS', 'CLIENT');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE courier_auth_type_enum AS ENUM ('BEARER_TOKEN', 'API_KEY', 'NONE');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE order_status_enum AS ENUM ('CREATED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED','FAILED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE batch_job_status_enum AS ENUM ('PENDING','PROCESSING','COMPLETED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "email"         VARCHAR(255) NOT NULL UNIQUE,
        "password_hash" VARCHAR(255) NOT NULL,
        "role"          user_role_enum NOT NULL DEFAULT 'CLIENT',
        "is_active"     BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create refresh_tokens table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id"          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id"     UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash"  VARCHAR(512) NOT NULL,
        "expires_at"  TIMESTAMPTZ NOT NULL,
        "revoked"     BOOLEAN NOT NULL DEFAULT FALSE,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_id" ON "refresh_tokens"("user_id");
    `);

    // Create courier_providers table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "courier_providers" (
        "id"                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "code"                     VARCHAR(50) NOT NULL UNIQUE,
        "display_name"             VARCHAR(100) NOT NULL,
        "is_active"                BOOLEAN NOT NULL DEFAULT TRUE,
        "base_url"                 VARCHAR(500) NOT NULL,
        "auth_type"                courier_auth_type_enum NOT NULL DEFAULT 'BEARER_TOKEN',
        "auth_endpoint"            VARCHAR(255),
        "auth_credentials"         JSONB,
        "timeout_ms"               INT NOT NULL DEFAULT 10000,
        "max_retries"              INT NOT NULL DEFAULT 3,
        "retry_backoff_ms"         INT NOT NULL DEFAULT 1000,
        "retry_backoff_multiplier" FLOAT NOT NULL DEFAULT 2.0,
        "max_backoff_ms"           INT NOT NULL DEFAULT 30000,
        "extra_config"             JSONB,
        "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create batch_jobs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "batch_jobs" (
        "id"             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "created_by"     UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "total_count"    INT NOT NULL DEFAULT 0,
        "success_count"  INT NOT NULL DEFAULT 0,
        "failure_count"  INT NOT NULL DEFAULT 0,
        "pending_count"  INT NOT NULL DEFAULT 0,
        "status"         batch_job_status_enum NOT NULL DEFAULT 'PENDING',
        "results"        JSONB NOT NULL DEFAULT '[]',
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create orders table and indices
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id"                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "external_order_id"        VARCHAR(255) NOT NULL UNIQUE,
        "courier_partner"          VARCHAR(50) NOT NULL,
        "courier_order_id"         VARCHAR(255),
        "awb_number"               VARCHAR(255),
        "status"                   order_status_enum NOT NULL DEFAULT 'CREATED',
        "courier_request_payload"  JSONB,
        "courier_response_payload" JSONB,
        "failure_reason"           TEXT,
        "batch_id"                 UUID REFERENCES "batch_jobs"("id") ON DELETE SET NULL,
        "created_by"               UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "cancelled_by"             UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_orders_courier_partner" ON "orders"("courier_partner");
      CREATE INDEX IF NOT EXISTS "idx_orders_awb_number"      ON "orders"("awb_number");
      CREATE INDEX IF NOT EXISTS "idx_orders_batch_id"        ON "orders"("batch_id");
      CREATE INDEX IF NOT EXISTS "idx_orders_created_by"      ON "orders"("created_by");
      CREATE INDEX IF NOT EXISTS "idx_orders_status"          ON "orders"("status");
    `);

    // Create tracking_events table and indices
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tracking_events" (
        "id"                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "order_id"          UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "status"            VARCHAR(100) NOT NULL,
        "normalized_status" order_status_enum,
        "location"          VARCHAR(255),
        "description"       TEXT,
        "raw_payload"       JSONB,
        "event_time"        TIMESTAMPTZ,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_tracking_events_order_id"   ON "tracking_events"("order_id");
      CREATE INDEX IF NOT EXISTS "idx_tracking_events_event_time"  ON "tracking_events"("event_time");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tracking_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "batch_jobs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "courier_providers" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS batch_job_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS order_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS courier_auth_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_role_enum`);
  }
}
