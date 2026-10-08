SET search_path = wok, public;

CREATE TABLE order_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    fulfillment_type TEXT NOT NULL,
    idempotency_key UUID NOT NULL,
    request_fingerprint TEXT NOT NULL,
    requested_for TIMESTAMPTZ NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
    preparation_seconds INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_order_request_id UUID REFERENCES order_requests(id) ON DELETE RESTRICT,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_quotes_customer_idempotency UNIQUE (customer_user_id, idempotency_key),
    CONSTRAINT ck_order_quotes_fulfillment CHECK (fulfillment_type IN ('PICKUP', 'DELIVERY')),
    CONSTRAINT ck_order_quotes_amount CHECK (subtotal >= 0 AND subtotal::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_order_quotes_preparation CHECK (preparation_seconds BETWEEN 0 AND 86400),
    CONSTRAINT ck_order_quotes_status CHECK (status IN ('ACTIVE', 'CONSUMED', 'EXPIRED')),
    CONSTRAINT ck_order_quotes_consumption CHECK (
        (status = 'CONSUMED' AND consumed_order_request_id IS NOT NULL AND consumed_at IS NOT NULL)
        OR (status <> 'CONSUMED' AND consumed_order_request_id IS NULL AND consumed_at IS NULL)
    )
);
CREATE INDEX ix_order_quotes_expiry ON order_quotes(expires_at) WHERE status = 'ACTIVE';

CREATE TABLE order_quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_quote_id UUID NOT NULL REFERENCES order_quotes(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    name_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    line_total NUMERIC(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_quote_items_quantity CHECK (quantity BETWEEN 1 AND 2147483647),
    CONSTRAINT ck_order_quote_items_unit_price CHECK (unit_price >= 0 AND unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT uq_order_quote_items_product UNIQUE (order_quote_id, menu_item_id)
);
CREATE INDEX ix_order_quote_items_quote ON order_quote_items(order_quote_id);

CREATE TABLE order_quote_item_modifiers (
    order_quote_item_id UUID NOT NULL REFERENCES order_quote_items(id) ON DELETE CASCADE,
    modifier_id UUID NOT NULL REFERENCES modifiers(id) ON DELETE RESTRICT,
    group_name_snapshot TEXT NOT NULL,
    modifier_name_snapshot TEXT NOT NULL,
    price_delta NUMERIC(12,2) NOT NULL,
    PRIMARY KEY (order_quote_item_id, modifier_id),
    CONSTRAINT ck_order_quote_modifier_price CHECK (price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
