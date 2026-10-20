-- Durable recipients shared by users in the same tenant.
-- Existing users, payments, accounts and audit entries remain unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS recipients (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    iban VARCHAR(34) NOT NULL,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_recipients_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    CONSTRAINT ck_recipients_iban CHECK (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_recipients_tenant_iban
    ON recipients (tenant_id, iban);

COMMIT;
