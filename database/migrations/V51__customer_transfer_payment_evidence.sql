SET search_path = wok, public;

-- Transfer receipts are evidence for staff review, never payment records by themselves.
CREATE TABLE payment_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE RESTRICT,
    customer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key UUID NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    content_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    review_reason TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
    row_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_payment_evidence_type CHECK (content_type IN ('image/jpeg', 'image/png')),
    CONSTRAINT ck_payment_evidence_size CHECK (byte_size BETWEEN 1 AND 8388608),
    CONSTRAINT ck_payment_evidence_status CHECK (status IN ('NEEDS_REVIEW', 'VERIFIED', 'REJECTED')),
    CONSTRAINT ck_payment_evidence_review CHECK (
        (status = 'NEEDS_REVIEW' AND reviewed_by IS NULL AND reviewed_at IS NULL AND payment_id IS NULL)
        OR (status = 'VERIFIED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND payment_id IS NOT NULL)
        OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL AND payment_id IS NULL)
    ),
    CONSTRAINT ck_payment_evidence_row_version CHECK (row_version > 0),
    CONSTRAINT uq_payment_evidence_customer_idempotency UNIQUE (customer_user_id, idempotency_key),
    CONSTRAINT uq_payment_evidence_payment UNIQUE (payment_id)
);

-- A proof cannot be submitted twice, even for another request. The API returns a generic conflict
-- and does not disclose which order already owns the image.
CREATE UNIQUE INDEX ux_payment_evidence_content_sha256 ON payment_evidence(content_sha256);
CREATE INDEX ix_payment_evidence_review_queue ON payment_evidence(created_at, id) WHERE status = 'NEEDS_REVIEW';
CREATE INDEX ix_payment_evidence_request_history ON payment_evidence(order_request_id, created_at DESC, id DESC);

CREATE TABLE payment_evidence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_evidence_id UUID NOT NULL REFERENCES payment_evidence(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    request_id UUID NOT NULL UNIQUE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_payment_evidence_event_type CHECK (event_type IN ('SUBMITTED', 'VERIFIED', 'REJECTED')),
    CONSTRAINT ck_payment_evidence_event_reason CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500)
);
CREATE INDEX ix_payment_evidence_events_history ON payment_evidence_events(payment_evidence_id, occurred_at, id);
