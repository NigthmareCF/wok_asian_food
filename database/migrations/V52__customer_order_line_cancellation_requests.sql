-- Allow a Customer to request cancellation of one accepted order line, still
-- requiring explicit Operational approval before changing kitchen/account state.
SET search_path = wok, public;

DROP INDEX ux_order_change_request_pending_cancel;

ALTER TABLE order_change_requests
    ADD COLUMN order_item_id UUID REFERENCES order_items(id) ON DELETE RESTRICT,
    ADD COLUMN expected_item_version INTEGER,
    DROP CONSTRAINT ck_order_change_request_type,
    ADD CONSTRAINT ck_order_change_request_type CHECK (request_type IN ('CANCEL_ORDER', 'CANCEL_LINE')),
    ADD CONSTRAINT ck_order_change_request_target CHECK (
        (request_type = 'CANCEL_ORDER' AND order_item_id IS NULL AND expected_item_version IS NULL)
        OR (request_type = 'CANCEL_LINE' AND order_item_id IS NOT NULL
            AND expected_item_version IS NOT NULL AND expected_item_version > 0)
    );

-- Only one unresolved change may target an order at a time. This serializes
-- whole-order and line-level cancellation requests against one another.
CREATE UNIQUE INDEX ux_order_change_request_pending_order
    ON order_change_requests(order_id) WHERE status = 'PENDING_REVIEW';

CREATE INDEX ix_order_change_request_line
    ON order_change_requests(order_item_id, created_at DESC)
    WHERE order_item_id IS NOT NULL;
