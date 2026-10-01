-- Requests are not accepted orders. A staff decision must revalidate operations before creating an order.
SET search_path = wok, public;

CREATE TABLE order_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_user_id UUID NOT NULL REFERENCES users(id),
    fulfillment_type TEXT NOT NULL DEFAULT 'PICKUP',
    status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    idempotency_key UUID NOT NULL,
    request_fingerprint TEXT NOT NULL,
    requested_for TIMESTAMPTZ NOT NULL,
    customer_note TEXT,
    subtotal NUMERIC(14,2) NOT NULL,
    currency_id UUID NOT NULL REFERENCES currencies(id),
    decided_by UUID REFERENCES users(id),
    decision_reason TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_requests_customer_key UNIQUE(customer_user_id, idempotency_key),
    CONSTRAINT ck_order_requests_fulfillment CHECK (fulfillment_type IN ('PICKUP')),
    CONSTRAINT ck_order_requests_status CHECK (status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
    CONSTRAINT ck_order_requests_fingerprint CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_order_requests_subtotal CHECK (subtotal >= 0 AND subtotal::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_order_requests_decision CHECK (
        (status = 'PENDING_REVIEW' AND decided_by IS NULL AND decided_at IS NULL)
        OR (status <> 'PENDING_REVIEW' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    ),
    CONSTRAINT ck_order_requests_note CHECK (customer_note IS NULL OR length(customer_note) <= 500)
);
CREATE INDEX ix_order_requests_review_queue ON order_requests(created_at, id) WHERE status = 'PENDING_REVIEW';
CREATE INDEX ix_order_requests_customer_history ON order_requests(customer_user_id, created_at DESC, id DESC);

CREATE TABLE order_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    name_snapshot TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    line_total NUMERIC(14,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
    currency_id UUID NOT NULL REFERENCES currencies(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_request_items_product UNIQUE(order_request_id, menu_item_id),
    CONSTRAINT ck_order_request_items_quantity CHECK (quantity BETWEEN 1 AND 50),
    CONSTRAINT ck_order_request_items_price CHECK (unit_price >= 0 AND unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_order_request_items_menu_item ON order_request_items(menu_item_id);

CREATE TABLE order_request_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor_user_id UUID REFERENCES users(id),
    reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_request_events_type CHECK (event_type IN ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
    CONSTRAINT ck_order_request_events_reason CHECK (reason IS NULL OR length(reason) <= 500)
);
CREATE INDEX ix_order_request_events_history ON order_request_events(order_request_id, occurred_at, id);
