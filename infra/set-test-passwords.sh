#!/usr/bin/env bash
# Only mounted by the local Compose override. Also usable on an existing local DB.
seb_configure_test_passwords() {
    if [ -z "${SEED_TEST_PASSWORD:-}" ]; then
        printf '%s\n' 'No SEED_TEST_PASSWORD supplied; test account passwords are unchanged.'
        return 0
    fi

    local password_bytes
    password_bytes=$(printf '%s' "$SEED_TEST_PASSWORD" | wc -c)
    if [ "$password_bytes" -lt 16 ] || [ "$password_bytes" -gt 72 ]; then
        printf '%s\n' 'SEED_TEST_PASSWORD must contain 16 to 72 bytes.' >&2
        return 1
    fi

    psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
        --set=ON_ERROR_STOP=1 --set=test_password="$SEED_TEST_PASSWORD" <<'SQL'
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE users ALTER COLUMN password_md5 TYPE VARCHAR(255);
UPDATE users
SET password_md5 = crypt(:'test_password', gen_salt('bf', 12))
WHERE tenant_id = 1
  AND email IN ('lisa@malmobygg.se', 'johan@malmobygg.se', 'sara@malmobygg.se');
COMMIT;
SQL
}

seb_configure_test_passwords
