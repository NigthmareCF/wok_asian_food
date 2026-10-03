-- Link an accepted order request with the order created by the staff decision.
SET search_path = wok, public;

ALTER TABLE order_requests ADD COLUMN order_id UUID REFERENCES orders(id);

CREATE UNIQUE INDEX uq_order_requests_order_id ON order_requests(order_id) WHERE order_id IS NOT NULL;
