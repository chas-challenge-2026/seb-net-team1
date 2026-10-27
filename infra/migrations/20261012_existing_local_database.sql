-- Bring databases created from older seed files up to the schema expected by
-- the dashboard and payment API. This migration is safe to rerun and preserves
-- existing payments, accounts, approval steps, and audit rows.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Older accounts did not carry tenant ownership. Infer it from their payments;
-- use the first tenant only for accounts without any payment history.
ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);

UPDATE accounts a
SET tenant_id = COALESCE(
    (SELECT MIN(p.tenant_id) FROM payments p WHERE p.from_account_id = a.id),
    (SELECT MIN(t.id) FROM tenants t)
)
WHERE a.tenant_id IS NULL;

ALTER TABLE accounts
    ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id
    ON accounts (tenant_id);

-- Add transaction history to older databases. Completed payments are copied
-- once so the account balance history starts with the existing payment data.
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description VARCHAR(255),
    transaction_type VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id
    ON transactions (account_id);

INSERT INTO transactions (account_id, amount, date, description, transaction_type)
SELECT p.from_account_id,
       -p.amount,
       COALESCE(p.executed_at, p.created_at),
       p.reference,
       'payment'
FROM payments p
WHERE p.status = 'completed'
  AND p.from_account_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM transactions t
      WHERE t.account_id = p.from_account_id
        AND t.amount = -p.amount
        AND COALESCE(t.description, '') = COALESCE(p.reference, '')
        AND t.transaction_type = 'payment'
  );

-- Older approval rows lack a stable public id and decision provenance.
ALTER TABLE approval_steps
    ADD COLUMN IF NOT EXISTS public_id UUID,
    ADD COLUMN IF NOT EXISTS decided_by INT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS decision_source VARCHAR(30);

UPDATE approval_steps
SET public_id = gen_random_uuid()
WHERE public_id IS NULL;

ALTER TABLE approval_steps
    ALTER COLUMN public_id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS approval_steps_public_id_key
    ON approval_steps (public_id);

-- Scope legacy audit rows to the tenant of their user, then fill the fields
-- required by the current API. Legacy signatures are explicitly unsigned.
ALTER TABLE audit_entries
    ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id),
    ADD COLUMN IF NOT EXISTS signature TEXT,
    ADD COLUMN IF NOT EXISTS previous_signature TEXT;

UPDATE audit_entries ae
SET tenant_id = u.tenant_id
FROM users u
WHERE ae.user_id = u.id
  AND ae.tenant_id IS NULL
  AND u.tenant_id IS NOT NULL;

UPDATE audit_entries ae
SET tenant_id = (SELECT MIN(t.id) FROM tenants t)
WHERE ae.tenant_id IS NULL;

UPDATE audit_entries
SET signature = 'UNSIGNED'
WHERE signature IS NULL OR btrim(signature) = '';

WITH chain AS (
    SELECT id,
           LAG(signature) OVER (PARTITION BY tenant_id ORDER BY id) AS prior_signature
    FROM audit_entries
)
UPDATE audit_entries ae
SET previous_signature = COALESCE(chain.prior_signature, 'GENESIS')
FROM chain
WHERE ae.id = chain.id
  AND (ae.previous_signature IS NULL OR btrim(ae.previous_signature) = '');

ALTER TABLE audit_entries
    ALTER COLUMN tenant_id SET NOT NULL,
    ALTER COLUMN signature SET NOT NULL,
    ALTER COLUMN previous_signature SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_entries_tenant_id_id
    ON audit_entries (tenant_id, id);

COMMIT;
