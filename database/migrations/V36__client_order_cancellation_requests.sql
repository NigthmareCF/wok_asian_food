-- An accepted off-premise order can only be cancelled after an operator decision.
SET search_path = wok, public;

CREATE TABLE order_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE RESTRICT,
    customer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    request_type TEXT NOT NULL DEFAULT 'CANCEL_ORDER',
    status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    reason TEXT NOT NULL,
    decision_reason TEXT,
    expected_order_version INTEGER NOT NULL,
    row_version INTEGER NOT NULL DEFAULT 1,
    decided_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    decided_at TIMESTAMPTZ,
    request_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_change_request_type CHECK (request_type IN ('CANCEL_ORDER')),
    CONSTRAINT ck_order_change_request_status CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    CONSTRAINT ck_order_change_request_reason CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
    CONSTRAINT ck_order_change_request_decision_reason CHECK (decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 3 AND 500),
    CONSTRAINT ck_order_change_request_versions CHECK (expected_order_version > 0 AND row_version > 0),
    CONSTRAINT ck_order_change_request_decision CHECK (
        (status = 'PENDING_REVIEW' AND decided_by IS NULL AND decided_at IS NULL)
        OR (status <> 'PENDING_REVIEW' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    )
);

CREATE INDEX ix_order_change_requests_review
    ON order_change_requests(created_at, id) WHERE status = 'PENDING_REVIEW';
CREATE INDEX ix_order_change_requests_customer
    ON order_change_requests(customer_user_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX ux_order_change_request_pending_cancel
    ON order_change_requests(order_id)
    WHERE request_type = 'CANCEL_ORDER' AND status = 'PENDING_REVIEW';

CREATE TABLE order_change_request_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_change_request_id UUID NOT NULL REFERENCES order_change_requests(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    request_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_change_request_event_type CHECK (event_type IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
    CONSTRAINT ck_order_change_request_event_reason CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
    CONSTRAINT uq_order_change_request_event_request UNIQUE (request_id)
);

CREATE INDEX ix_order_change_request_events_history
    ON order_change_request_events(order_change_request_id, occurred_at, id);
