-- LOCAL CANDIDATE CHAIN ONLY. Promotion requires shared Flyway history confirmation.
-- Depends on preserved V1-V27 and V56; excludes equivalent C V36.

-- Adapted unit: C 83bb196f V35__order_request_modifiers.sql
SET search_path = wok, public;

CREATE TABLE order_request_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_request_item_id UUID NOT NULL REFERENCES order_request_items(id) ON DELETE CASCADE,
    modifier_id UUID NOT NULL REFERENCES modifiers(id),
    group_name_snapshot TEXT NOT NULL,
    modifier_name_snapshot TEXT NOT NULL,
    price_delta NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_request_item_modifiers UNIQUE (order_request_item_id, modifier_id),
    CONSTRAINT ck_order_request_item_modifiers_price CHECK (price_delta >= 0 AND price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_order_request_item_modifiers_request_item ON order_request_item_modifiers(order_request_item_id);

CREATE TABLE order_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_id UUID NOT NULL REFERENCES modifiers(id),
    group_name_snapshot TEXT NOT NULL,
    modifier_name_snapshot TEXT NOT NULL,
    price_delta NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_item_modifiers UNIQUE (order_item_id, modifier_id),
    CONSTRAINT ck_order_item_modifiers_price CHECK (price_delta >= 0 AND price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_order_item_modifiers_order_item ON order_item_modifiers(order_item_id);


-- Adapted unit: C 83bb196f V38__reservation_preorder_snapshots.sql
-- A table reservation may carry a requested pre-order for staff review.
-- These lines are intent snapshots only: they do not reserve inventory or create an order.
SET search_path = wok, public;

CREATE TABLE reservation_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES reservation_evaluations(request_id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    name_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    line_total NUMERIC(14,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
    currency_id UUID NOT NULL REFERENCES currencies(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_reservation_request_items_product UNIQUE (request_id, menu_item_id),
    CONSTRAINT ck_reservation_request_items_name CHECK (length(btrim(name_snapshot)) > 0),
    CONSTRAINT ck_reservation_request_items_quantity CHECK (quantity BETWEEN 1 AND 50),
    CONSTRAINT ck_reservation_request_items_price CHECK (unit_price >= 0 AND unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_reservation_request_items_menu_item ON reservation_request_items(menu_item_id);

CREATE TABLE reservation_request_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_request_item_id UUID NOT NULL REFERENCES reservation_request_items(id) ON DELETE CASCADE,
    modifier_id UUID NOT NULL REFERENCES modifiers(id) ON DELETE RESTRICT,
    group_name_snapshot TEXT NOT NULL,
    modifier_name_snapshot TEXT NOT NULL,
    price_delta NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_reservation_request_item_modifiers UNIQUE (reservation_request_item_id, modifier_id),
    CONSTRAINT ck_reservation_request_item_modifiers_price CHECK (price_delta >= 0 AND price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_reservation_request_item_modifiers_item ON reservation_request_item_modifiers(reservation_request_item_id);


-- Adapted unit: C 83bb196f V46__persist_customer_order_quotes.sql
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


-- Adapted unit: C 83bb196f V47__record_order_quote_queue_estimates.sql
SET search_path = wok, public;

ALTER TABLE order_quotes
    ADD COLUMN queue_delay_seconds INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN total_eta_seconds INTEGER NOT NULL DEFAULT 0;

UPDATE order_quotes SET total_eta_seconds = preparation_seconds;

ALTER TABLE order_quotes
    ADD CONSTRAINT ck_order_quotes_queue_delay CHECK (queue_delay_seconds BETWEEN 0 AND 86400),
    ADD CONSTRAINT ck_order_quotes_total_eta CHECK (total_eta_seconds BETWEEN 0 AND 86400);


-- Adapted unit: C 83bb196f V48__temporary_order_capacity_holds.sql
SET search_path = wok, public;

CREATE TABLE order_capacity_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL UNIQUE REFERENCES order_quotes(id) ON DELETE RESTRICT,
    order_request_id UUID NOT NULL UNIQUE REFERENCES order_requests(id) ON DELETE RESTRICT,
    requested_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    CONSTRAINT ck_order_capacity_holds_status CHECK (status IN ('ACTIVE', 'RELEASED', 'CONVERTED', 'EXPIRED')),
    CONSTRAINT ck_order_capacity_holds_end CHECK (
        (status = 'ACTIVE' AND ended_at IS NULL)
        OR (status <> 'ACTIVE' AND ended_at IS NOT NULL)
    )
);
CREATE INDEX ix_order_capacity_holds_expiry ON order_capacity_holds(expires_at) WHERE status = 'ACTIVE';

CREATE TABLE order_capacity_hold_stations (
    hold_id UUID NOT NULL REFERENCES order_capacity_holds(id) ON DELETE CASCADE,
    station_id UUID NOT NULL REFERENCES preparation_areas(id) ON DELETE RESTRICT,
    preparation_seconds INTEGER NOT NULL,
    PRIMARY KEY (hold_id, station_id),
    CONSTRAINT ck_order_capacity_hold_station_seconds CHECK (preparation_seconds BETWEEN 1 AND 86400)
);
CREATE INDEX ix_order_capacity_hold_stations_station ON order_capacity_hold_stations(station_id, hold_id);
