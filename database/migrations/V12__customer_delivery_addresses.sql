-- Customer-owned delivery destinations for authenticated, owner-scoped API operations.
SET search_path = wok, public;

CREATE TABLE customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    label TEXT NOT NULL,
    address TEXT NOT NULL,
    reference TEXT,
    contact_phone TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_customer_addresses_label UNIQUE(customer_user_id, label),
    CONSTRAINT ck_customer_addresses_label CHECK (length(btrim(label)) BETWEEN 1 AND 80),
    CONSTRAINT ck_customer_addresses_address CHECK (length(btrim(address)) BETWEEN 5 AND 500),
    CONSTRAINT ck_customer_addresses_reference CHECK (reference IS NULL OR length(reference) <= 300),
    CONSTRAINT ck_customer_addresses_phone CHECK (contact_phone ~ '^[0-9+() .-]{7,32}$'),
    CONSTRAINT ck_customer_addresses_row_version CHECK (row_version > 0)
);

CREATE UNIQUE INDEX ux_customer_addresses_one_default
    ON customer_addresses(customer_user_id) WHERE is_default = true;
CREATE INDEX ix_customer_addresses_customer
    ON customer_addresses(customer_user_id, is_default DESC, updated_at DESC, id);
