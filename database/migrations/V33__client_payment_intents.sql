-- Durable online-payment intent records. Provider integration remains a mock and never captures funds.
SET search_path = wok, public;

CREATE TABLE payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES order_accounts(id) ON DELETE RESTRICT,
    customer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    provider TEXT NOT NULL,
    provider_reference TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_payment_intents_provider CHECK (provider IN ('MOCK')),
    CONSTRAINT ck_payment_intents_reference CHECK (length(btrim(provider_reference)) BETWEEN 1 AND 200),
    CONSTRAINT ck_payment_intents_amount CHECK (amount > 0 AND amount::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_payment_intents_status CHECK (status IN
        ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'REFUNDED'))
);

CREATE INDEX ix_payment_intents_order_history ON payment_intents(order_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX ux_payment_intents_active_order ON payment_intents(order_id)
    WHERE status IN ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'UNKNOWN');
