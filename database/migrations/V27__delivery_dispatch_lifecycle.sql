-- Manual last-mile dispatch lifecycle. No GPS or external courier provider is assumed.
SET search_path = wok, public;

CREATE TABLE delivery_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'AWAITING_KITCHEN',
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_delivery_dispatches_status CHECK (status IN (
        'AWAITING_KITCHEN', 'READY_FOR_DISPATCH', 'ASSIGNED', 'OUT_FOR_DELIVERY',
        'DELIVERY_FAILED', 'DELIVERED', 'CANCELLED'
    )),
    CONSTRAINT ck_delivery_dispatches_assignment CHECK (
        status NOT IN ('ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED')
        OR (assigned_to_user_id IS NOT NULL AND assigned_at IS NOT NULL)
    ),
    CONSTRAINT ck_delivery_dispatches_dispatched CHECK (
        status NOT IN ('OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED') OR dispatched_at IS NOT NULL
    ),
    CONSTRAINT ck_delivery_dispatches_delivered CHECK (
        status <> 'DELIVERED' OR delivered_at IS NOT NULL
    ),
    CONSTRAINT ck_delivery_dispatches_failure CHECK (
        status <> 'DELIVERY_FAILED' OR (failure_reason IS NOT NULL AND length(btrim(failure_reason)) BETWEEN 1 AND 500)
    ),
    CONSTRAINT ck_delivery_dispatches_row_version CHECK (row_version > 0)
);

CREATE INDEX ix_delivery_dispatches_status ON delivery_dispatches(status, updated_at, id);
CREATE INDEX ix_delivery_dispatches_assignee ON delivery_dispatches(assigned_to_user_id, status, updated_at DESC);

CREATE TABLE delivery_dispatch_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES delivery_dispatches(id) ON DELETE RESTRICT,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    request_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_delivery_dispatch_events_status CHECK (
        to_status IN ('AWAITING_KITCHEN', 'READY_FOR_DISPATCH', 'ASSIGNED', 'OUT_FOR_DELIVERY',
            'DELIVERY_FAILED', 'DELIVERED', 'CANCELLED')
    ),
    CONSTRAINT ck_delivery_dispatch_events_reason CHECK (reason IS NULL OR length(reason) <= 500)
);

CREATE INDEX ix_delivery_dispatch_events_timeline ON delivery_dispatch_events(dispatch_id, created_at, id);
