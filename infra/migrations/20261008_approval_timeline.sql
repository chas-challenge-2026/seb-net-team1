-- Add timeline provenance to an existing local database without changing its rows.
-- Run this before starting an API build that reads the new approval-step fields.
-- Previous decisions stay unknown: the assigned attestant need not be the caller.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE approval_steps
    ADD COLUMN IF NOT EXISTS decided_by INT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS decision_source VARCHAR(30);

COMMIT;
