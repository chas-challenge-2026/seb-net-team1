-- Record the request's IP address on new audit events.
-- Apply before deploying an API build that reads ip_address.
-- Existing events remain NULL: their original IP address is unknown.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE audit_entries
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

COMMIT;
