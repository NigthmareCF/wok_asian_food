-- Customer-owned billing identities used as defaults for future invoice requests.
SET search_path = wok, public;

CREATE TABLE customer_tax_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    label TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_tax_id TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_customer_tax_profiles_label CHECK (length(btrim(label)) BETWEEN 1 AND 60),
    CONSTRAINT ck_customer_tax_profiles_name CHECK (length(btrim(customer_name)) BETWEEN 1 AND 150),
    CONSTRAINT ck_customer_tax_profiles_tax_id CHECK (length(btrim(customer_tax_id)) BETWEEN 1 AND 32),
    CONSTRAINT ck_customer_tax_profiles_row_version CHECK (row_version > 0)
);

CREATE UNIQUE INDEX ux_customer_tax_profiles_label
    ON customer_tax_profiles(customer_user_id, lower(label));
CREATE UNIQUE INDEX ux_customer_tax_profiles_one_default
    ON customer_tax_profiles(customer_user_id) WHERE is_default = true;
CREATE INDEX ix_customer_tax_profiles_customer
    ON customer_tax_profiles(customer_user_id, is_default DESC, updated_at DESC, id);
