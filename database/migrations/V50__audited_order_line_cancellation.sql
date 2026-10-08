-- Operational line cancellation keeps the original order line while updating the active bill.
SET search_path = wok, public;

ALTER TABLE order_items
    ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN cancelled_at TIMESTAMPTZ,
    ADD COLUMN cancelled_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    ADD COLUMN resource_snapshot_complete BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT ck_order_items_status CHECK (status IN ('ACTIVE', 'CANCELLED')),
    ADD CONSTRAINT ck_order_items_cancellation CHECK (
        (status = 'ACTIVE' AND cancelled_at IS NULL AND cancelled_by IS NULL)
        OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)
    );

CREATE INDEX ix_order_items_active_order ON order_items(order_id, created_at, id) WHERE status = 'ACTIVE';

-- Resource contributions are captured per order line so a later cancellation never recalculates
-- from a recipe or modifier definition that may have changed since the order was accepted.
CREATE TABLE order_item_resource_reservations (
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity_delta NUMERIC(18,6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (order_item_id, item_id),
    CONSTRAINT ck_order_item_resource_delta CHECK (quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_order_item_resource_item ON order_item_resource_reservations(item_id, order_item_id);

CREATE TABLE order_item_change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    change_type TEXT NOT NULL,
    previous_status TEXT NOT NULL,
    previous_quantity INTEGER NOT NULL,
    previous_line_total NUMERIC(14,2) NOT NULL,
    next_status TEXT NOT NULL,
    next_quantity INTEGER NOT NULL,
    next_line_total NUMERIC(14,2) NOT NULL,
    financial_delta NUMERIC(14,2) NOT NULL,
    reason TEXT NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    resource_delta_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    kitchen_ticket_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    request_id UUID NOT NULL UNIQUE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_item_change_type CHECK (change_type = 'CANCEL_LINE'),
    CONSTRAINT ck_order_item_change_quantities CHECK (
        previous_quantity > 0 AND next_quantity = 0
    ),
    CONSTRAINT ck_order_item_change_status CHECK (
        previous_status = 'ACTIVE' AND next_status = 'CANCELLED'
    ),
    CONSTRAINT ck_order_item_change_reason CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
    CONSTRAINT ck_order_item_change_financial_delta CHECK (
        financial_delta = next_line_total - previous_line_total
    )
);
CREATE INDEX ix_order_item_change_history ON order_item_change_events(order_id, occurred_at, id);

-- Cancelling after kitchen work starts records material as waste instead of returning it to stock.
ALTER TABLE inventory_movements DROP CONSTRAINT ck_inventory_movements_scope;
ALTER TABLE inventory_movements ADD CONSTRAINT ck_inventory_movements_order_reference CHECK (
    (order_id IS NULL OR production_batch_id IS NULL)
    AND (movement_type IN ('CONSUMPTION', 'WASTE') OR order_id IS NULL)
);
CREATE UNIQUE INDEX ux_inventory_movements_order_waste
    ON inventory_movements(order_id, item_id, request_id)
    WHERE movement_type = 'WASTE' AND order_id IS NOT NULL AND request_id IS NOT NULL;
