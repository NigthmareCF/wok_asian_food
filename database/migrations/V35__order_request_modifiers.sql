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
