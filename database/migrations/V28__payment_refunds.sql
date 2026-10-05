-- Manual refunds preserve the captured payment and add an auditable financial entry.
SET search_path = wok, public;

ALTER TABLE payments DROP CONSTRAINT ck_payments_status;
ALTER TABLE payments ADD CONSTRAINT ck_payments_status
    CHECK (status IN ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED'));

CREATE TABLE payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE RESTRICT,
    refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tip_refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    refund_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'RECORDED_MANUALLY',
    reference TEXT,
    reason TEXT NOT NULL,
    recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    request_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_payment_refunds_amount CHECK (
        refund_amount >= 0 AND tip_refund_amount >= 0 AND refund_amount + tip_refund_amount > 0
        AND refund_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND tip_refund_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
    ),
    CONSTRAINT ck_payment_refunds_method CHECK (refund_method IN ('CASH', 'CARD_EXTERNAL', 'TRANSFER')),
    CONSTRAINT ck_payment_refunds_status CHECK (status = 'RECORDED_MANUALLY'),
    CONSTRAINT ck_payment_refunds_reference CHECK (reference IS NULL OR length(btrim(reference)) BETWEEN 1 AND 120),
    CONSTRAINT ck_payment_refunds_reason CHECK (length(btrim(reason)) BETWEEN 3 AND 500)
);

CREATE INDEX ix_payment_refunds_payment ON payment_refunds(payment_id, created_at, id);
CREATE INDEX ix_payment_refunds_cash_session ON payment_refunds(cash_session_id) WHERE cash_session_id IS NOT NULL;
CREATE UNIQUE INDEX ux_payment_refunds_request ON payment_refunds(request_id);

ALTER TABLE cash_movements
    ADD CONSTRAINT fk_cash_movements_refund FOREIGN KEY (refund_id) REFERENCES payment_refunds(id) ON DELETE RESTRICT;
