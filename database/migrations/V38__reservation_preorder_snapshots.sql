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
