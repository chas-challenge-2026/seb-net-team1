-- SEB Företagsbetalningar — seed data
-- Run via: psql -U seb -d seb -f seed.sql

CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100)
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id),
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password_md5 VARCHAR(32),
    role VARCHAR(20) -- 'initiator', 'attestant', 'admin'
);

CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id),
    account_name VARCHAR(100),
    iban VARCHAR(34),
    balance DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'SEK'
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id),
    from_account_id INT REFERENCES accounts(id),
    to_iban VARCHAR(34),
    amount DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'SEK',
    reference VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending_approval', -- 'pending_approval', 'completed', 'rejected'
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    executed_at TIMESTAMP
);

CREATE TABLE approval_steps (
    id SERIAL PRIMARY KEY,
    payment_id INT REFERENCES payments(id),
    attestant_id INT REFERENCES users(id),
    step_number INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    decided_at TIMESTAMP,
    comment VARCHAR(255)
);

CREATE TABLE audit_entries (
    id SERIAL PRIMARY KEY,
    user_id INT,
    action VARCHAR(100),
    entity_type VARCHAR(50),
    entity_id INT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed: tenant Malmö Bygg AB
INSERT INTO tenants (name) VALUES ('Malmö Bygg AB');

-- password = "password123" MD5 = 482c811da5d5b4bc6d497ffa98491e38
INSERT INTO users (tenant_id, name, email, password_md5, role) VALUES
(1, 'Lisa Persson',  'lisa@malmobygg.se',  '482c811da5d5b4bc6d497ffa98491e38', 'initiator'),
(1, 'Johan Berg',   'johan@malmobygg.se', '482c811da5d5b4bc6d497ffa98491e38', 'attestant'),
(1, 'Sara Ek',      'sara@malmobygg.se',  '482c811da5d5b4bc6d497ffa98491e38', 'admin');

INSERT INTO accounts (tenant_id, account_name, iban, balance, currency) VALUES
(1, 'Driftkonto',   'SE4550000000058398257466', 2500000.00, 'SEK'),
(1, 'Lönekonto',    'SE4550000000058398257467',  890000.00, 'SEK'),
(1, 'Projektkonto', 'SE4550000000058398257468',  450000.00, 'SEK');

-- Some pre-existing payments
INSERT INTO payments (tenant_id, from_account_id, to_iban, amount, reference, status, created_by, executed_at) VALUES
(1, 1, 'SE8550000000054910000003', 15000.00, 'Faktura #1042', 'completed',        1, NOW()),
(1, 1, 'SE8550000000054910000004', 75000.00, 'Faktura #1043', 'pending_approval', 1, NULL);

INSERT INTO approval_steps (payment_id, attestant_id, step_number, status) VALUES
(2, 2, 1, 'pending');

INSERT INTO audit_entries (user_id, action, entity_type, entity_id, description) VALUES
(1, 'CREATE_PAYMENT', 'payment', 1, 'Skapade betalning 15000 SEK till SE8550000000054910000003'),
(1, 'CREATE_PAYMENT', 'payment', 2, 'Skapade betalning 75000 SEK till SE8550000000054910000004');
