-- Adds payment idempotency support to an existing database.
-- Fresh databases already receive the same schema from infra/seed.sql.

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_tenant_creator_idempotency
    ON payments (tenant_id, created_by, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
