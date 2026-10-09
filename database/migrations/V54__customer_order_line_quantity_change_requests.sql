-- Customers may request a quantity adjustment while an order is still queued.
SET search_path = wok, public;

ALTER TABLE order_change_requests
    DROP CONSTRAINT ck_order_change_request_type,
    ADD COLUMN requested_quantity INTEGER,
    ADD CONSTRAINT ck_order_change_request_type CHECK
        (request_type IN ('CANCEL_ORDER', 'CANCEL_LINE', 'MODIFY_LINE_QUANTITY')),
    DROP CONSTRAINT ck_order_change_request_target,
    ADD CONSTRAINT ck_order_change_request_target CHECK (
        (request_type = 'CANCEL_ORDER' AND order_item_id IS NULL
            AND expected_item_version IS NULL AND requested_quantity IS NULL)
        OR (request_type = 'CANCEL_LINE' AND order_item_id IS NOT NULL
            AND expected_item_version IS NOT NULL AND expected_item_version > 0
            AND requested_quantity IS NULL)
        OR (request_type = 'MODIFY_LINE_QUANTITY' AND order_item_id IS NOT NULL
            AND expected_item_version IS NOT NULL AND expected_item_version > 0
            AND requested_quantity IS NOT NULL AND requested_quantity > 0)
    );

ALTER TABLE order_item_change_events
    DROP CONSTRAINT ck_order_item_change_type,
    DROP CONSTRAINT ck_order_item_change_quantities,
    DROP CONSTRAINT ck_order_item_change_status,
    ADD CONSTRAINT ck_order_item_change_type CHECK
        (change_type IN ('CANCEL_LINE', 'MODIFY_LINE_QUANTITY')),
    ADD CONSTRAINT ck_order_item_change_quantities CHECK (
        previous_quantity > 0 AND next_quantity >= 0
        AND ((change_type = 'CANCEL_LINE' AND next_quantity = 0)
          OR (change_type = 'MODIFY_LINE_QUANTITY' AND next_quantity > 0
              AND next_quantity <> previous_quantity))
    ),
    ADD CONSTRAINT ck_order_item_change_status CHECK (
        previous_status = 'ACTIVE'
        AND ((change_type = 'CANCEL_LINE' AND next_status = 'CANCELLED')
          OR (change_type = 'MODIFY_LINE_QUANTITY' AND next_status = 'ACTIVE'))
    );

-- Snapshot preparation at order creation; a later menu edit must not rewrite queue estimates.
ALTER TABLE order_items ADD COLUMN preparation_seconds_per_unit_snapshot INTEGER;
UPDATE order_items item
SET preparation_seconds_per_unit_snapshot = menu.estimated_preparation_seconds
FROM menu_items menu
WHERE menu.id = item.menu_item_id;
ALTER TABLE order_items
    ALTER COLUMN preparation_seconds_per_unit_snapshot SET NOT NULL,
    ALTER COLUMN preparation_seconds_per_unit_snapshot SET DEFAULT 0,
    ADD CONSTRAINT ck_order_item_preparation_snapshot CHECK
        (preparation_seconds_per_unit_snapshot >= 0);
ALTER TABLE order_items ADD COLUMN preparation_snapshot_complete BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX ix_order_change_request_line_quantity
    ON order_change_requests(order_item_id, created_at DESC)
    WHERE request_type = 'MODIFY_LINE_QUANTITY';
