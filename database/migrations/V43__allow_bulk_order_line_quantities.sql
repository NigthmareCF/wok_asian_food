-- Large requests remain subject to inventory, scheduling, capacity, and numeric-column validation.
-- A fixed 50-unit ceiling per SKU prevented legitimate bulk orders before those checks ran.
SET search_path = wok, public;

ALTER TABLE order_request_items
    DROP CONSTRAINT ck_order_request_items_quantity,
    ADD CONSTRAINT ck_order_request_items_quantity CHECK (quantity > 0);

ALTER TABLE reservation_request_items
    DROP CONSTRAINT ck_reservation_request_items_quantity,
    ADD CONSTRAINT ck_reservation_request_items_quantity CHECK (quantity > 0);
