-- Cash collected by a delivery courier is a receivable until physically deposited.
SET search_path = wok, public;

CREATE TABLE courier_cash_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
    courier_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'PENDING_SETTLEMENT',
    recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    settled_at TIMESTAMPTZ,
    settled_cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE RESTRICT,
    CONSTRAINT ck_courier_cash_collections_status CHECK (status IN ('PENDING_SETTLEMENT', 'SETTLED')),
    CONSTRAINT ck_courier_cash_collections_settlement CHECK (
        (status = 'PENDING_SETTLEMENT' AND settled_by IS NULL AND settled_at IS NULL AND settled_cash_session_id IS NULL)
        OR (status = 'SETTLED' AND settled_by IS NOT NULL AND settled_at IS NOT NULL AND settled_cash_session_id IS NOT NULL)
    )
);
CREATE INDEX ix_courier_cash_collections_pending ON courier_cash_collections (courier_user_id, recorded_at, id)
    WHERE status = 'PENDING_SETTLEMENT';
CREATE INDEX ix_courier_cash_collections_session ON courier_cash_collections (settled_cash_session_id)
    WHERE settled_cash_session_id IS NOT NULL;

INSERT INTO wok.permissions (code, description)
VALUES ('cash:manage', 'Administrar caja y liquidaciones de efectivo')
ON CONFLICT (code) DO NOTHING;
INSERT INTO wok.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM wok.roles r CROSS JOIN wok.permissions p
WHERE r.code IN ('OPERATIONAL', 'ADMIN') AND p.code = 'cash:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;
