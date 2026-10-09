-- Preserve the modifier-level stock contribution needed for safe queued-order edits.
SET search_path = wok, public;

CREATE TABLE order_item_modifier_resource_reservations (
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    modifier_id UUID NOT NULL REFERENCES modifiers(id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity_delta NUMERIC(18,6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (order_item_id, modifier_id, item_id),
    CONSTRAINT ck_order_item_modifier_resource_delta CHECK
        (quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_order_item_modifier_resource_item
    ON order_item_modifier_resource_reservations(item_id, order_item_id);

ALTER TABLE order_items
    ADD COLUMN modifier_resource_snapshot_complete BOOLEAN NOT NULL DEFAULT false;
-- Lines without modifiers have no modifier-derived stock contribution to reconstruct.
UPDATE order_items item SET modifier_resource_snapshot_complete = true
WHERE NOT EXISTS (SELECT 1 FROM order_item_modifiers selected WHERE selected.order_item_id = item.id);

ALTER TABLE order_change_requests
    ADD COLUMN requested_modifier_snapshot JSONB,
    DROP CONSTRAINT ck_order_change_request_type,
    ADD CONSTRAINT ck_order_change_request_type CHECK
        (request_type IN ('CANCEL_ORDER', 'CANCEL_LINE', 'MODIFY_LINE_QUANTITY', 'MODIFY_LINE_MODIFIERS')),
    DROP CONSTRAINT ck_order_change_request_target,
    ADD CONSTRAINT ck_order_change_request_target CHECK (
        (request_type = 'CANCEL_ORDER' AND order_item_id IS NULL
            AND expected_item_version IS NULL AND requested_quantity IS NULL
            AND requested_modifier_snapshot IS NULL)
        OR (request_type = 'CANCEL_LINE' AND order_item_id IS NOT NULL
            AND expected_item_version IS NOT NULL AND expected_item_version > 0
            AND requested_quantity IS NULL AND requested_modifier_snapshot IS NULL)
        OR (request_type = 'MODIFY_LINE_QUANTITY' AND order_item_id IS NOT NULL
            AND expected_item_version IS NOT NULL AND expected_item_version > 0
            AND requested_quantity IS NOT NULL AND requested_quantity > 0
            AND requested_modifier_snapshot IS NULL)
        OR (request_type = 'MODIFY_LINE_MODIFIERS' AND order_item_id IS NOT NULL
            AND expected_item_version IS NOT NULL AND expected_item_version > 0
            AND requested_quantity IS NULL AND jsonb_typeof(requested_modifier_snapshot) = 'array')
    );

ALTER TABLE order_item_change_events
    ADD COLUMN modifier_snapshot JSONB NOT NULL DEFAULT '{"previous": [], "next": []}'::jsonb,
    DROP CONSTRAINT ck_order_item_change_type,
    DROP CONSTRAINT ck_order_item_change_quantities,
    DROP CONSTRAINT ck_order_item_change_status,
    ADD CONSTRAINT ck_order_item_change_type CHECK
        (change_type IN ('CANCEL_LINE', 'MODIFY_LINE_QUANTITY', 'MODIFY_LINE_MODIFIERS')),
    ADD CONSTRAINT ck_order_item_change_quantities CHECK (
        previous_quantity > 0 AND next_quantity >= 0
        AND ((change_type = 'CANCEL_LINE' AND next_quantity = 0)
          OR (change_type = 'MODIFY_LINE_QUANTITY' AND next_quantity > 0
              AND next_quantity <> previous_quantity)
          OR (change_type = 'MODIFY_LINE_MODIFIERS' AND next_quantity = previous_quantity))
    ),
    ADD CONSTRAINT ck_order_item_change_status CHECK (
        previous_status = 'ACTIVE'
        AND ((change_type = 'CANCEL_LINE' AND next_status = 'CANCELLED')
          OR (change_type IN ('MODIFY_LINE_QUANTITY', 'MODIFY_LINE_MODIFIERS') AND next_status = 'ACTIVE'))
    );

CREATE INDEX ix_order_change_request_line_modifiers
    ON order_change_requests(order_item_id, created_at DESC)
    WHERE request_type = 'MODIFY_LINE_MODIFIERS';
