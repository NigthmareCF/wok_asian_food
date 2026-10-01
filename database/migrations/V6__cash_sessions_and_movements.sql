CREATE TABLE wok.cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    currency_id UUID NOT NULL REFERENCES wok.currencies(id) ON DELETE RESTRICT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES wok.users(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES wok.users(id) ON DELETE RESTRICT,
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_cash_registers_code CHECK (code = upper(btrim(code)) AND length(code) BETWEEN 1 AND 32),
    CONSTRAINT ck_cash_registers_row_version CHECK (row_version > 0)
);

CREATE TABLE wok.cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_register_id UUID NOT NULL REFERENCES wok.cash_registers(id) ON DELETE RESTRICT,
    opened_by UUID NOT NULL REFERENCES wok.users(id) ON DELETE RESTRICT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by UUID REFERENCES wok.users(id) ON DELETE RESTRICT,
    closed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES wok.users(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES wok.users(id) ON DELETE RESTRICT,
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_cash_sessions_status CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED')),
    CONSTRAINT ck_cash_sessions_close_time CHECK (closed_at IS NULL OR closed_at >= opened_at),
    CONSTRAINT ck_cash_sessions_closed_state CHECK (status <> 'CLOSED' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL)),
    CONSTRAINT ck_cash_sessions_row_version CHECK (row_version > 0)
);
CREATE UNIQUE INDEX ux_cash_sessions_one_open_per_register ON wok.cash_sessions (cash_register_id) WHERE status IN ('OPEN', 'CLOSING');
CREATE INDEX ix_cash_sessions_register ON wok.cash_sessions (cash_register_id);
CREATE INDEX ix_cash_sessions_opened_by ON wok.cash_sessions (opened_by);
CREATE INDEX ix_cash_sessions_closed_by ON wok.cash_sessions (closed_by);

CREATE TABLE wok.cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_session_id UUID NOT NULL REFERENCES wok.cash_sessions(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL,
    amount_delta NUMERIC(14,2) NOT NULL,
    payment_id UUID,
    refund_id UUID,
    reversal_of_id UUID REFERENCES wok.cash_movements(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    responsible_user_id UUID NOT NULL REFERENCES wok.users(id) ON DELETE RESTRICT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_cash_movements_type CHECK (movement_type IN ('OPENING', 'SALE', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'REFUND', 'TIP_PAYOUT', 'REVERSAL')),
    CONSTRAINT ck_cash_movements_direction CHECK (
        (movement_type = 'OPENING' AND amount_delta >= 0) OR
        (movement_type IN ('SALE', 'INCOME', 'REVERSAL') AND amount_delta > 0) OR
        (movement_type IN ('EXPENSE', 'WITHDRAWAL', 'REFUND', 'TIP_PAYOUT') AND amount_delta < 0)
    ),
    CONSTRAINT ck_cash_movements_reason CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
    CONSTRAINT ck_cash_movements_finite CHECK (amount_delta::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_cash_movements_sale_payment CHECK (movement_type <> 'SALE' OR payment_id IS NOT NULL),
    CONSTRAINT ck_cash_movements_refund_ref CHECK (movement_type <> 'REFUND' OR refund_id IS NOT NULL)
);
CREATE UNIQUE INDEX ux_cash_movements_opening ON wok.cash_movements (cash_session_id) WHERE movement_type = 'OPENING';
CREATE UNIQUE INDEX ux_cash_movements_request ON wok.cash_movements (request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX ux_cash_movements_payment ON wok.cash_movements (payment_id) WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX ux_cash_movements_refund ON wok.cash_movements (refund_id) WHERE refund_id IS NOT NULL;
CREATE UNIQUE INDEX ux_cash_movements_reversal ON wok.cash_movements (reversal_of_id) WHERE reversal_of_id IS NOT NULL;
CREATE INDEX ix_cash_movements_session_occurred ON wok.cash_movements (cash_session_id, occurred_at, id);
CREATE INDEX ix_cash_movements_responsible ON wok.cash_movements (responsible_user_id);

CREATE TABLE wok.cash_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_session_id UUID NOT NULL REFERENCES wok.cash_sessions(id) ON DELETE RESTRICT,
    expected_cash NUMERIC(14,2) NOT NULL,
    counted_cash NUMERIC(14,2) NOT NULL,
    difference NUMERIC(14,2) GENERATED ALWAYS AS (counted_cash - expected_cash) STORED,
    counted_by UUID NOT NULL REFERENCES wok.users(id) ON DELETE RESTRICT,
    counted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_final BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_cash_reconciliations_nonnegative CHECK (expected_cash >= 0 AND counted_cash >= 0),
    CONSTRAINT ck_cash_reconciliations_finite CHECK (expected_cash::text NOT IN ('NaN','Infinity','-Infinity') AND counted_cash::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE UNIQUE INDEX ux_cash_reconciliations_final ON wok.cash_reconciliations (cash_session_id) WHERE is_final;
CREATE INDEX ix_cash_reconciliations_session ON wok.cash_reconciliations (cash_session_id);
CREATE INDEX ix_cash_reconciliations_counter ON wok.cash_reconciliations (counted_by);

INSERT INTO wok.cash_registers (code, name, currency_id)
SELECT 'MAIN', 'Caja principal', id FROM wok.currencies WHERE code = 'GTQ'
ON CONFLICT (code) DO NOTHING;
