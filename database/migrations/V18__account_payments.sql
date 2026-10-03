-- Cobro simple por cuenta y su enlace con la caja.
SET search_path = wok, public;

INSERT INTO permissions (code, description)
VALUES ('payments:manage', 'Registrar cobros de cuentas')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('OPERATIONAL', 'ADMIN')
  AND p.code = 'payments:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES order_accounts(id) ON DELETE RESTRICT,
    cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL,
    currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
    method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CAPTURED',
    reference TEXT,
    captured_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    request_id UUID,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_payments_amount CHECK (amount > 0),
    CONSTRAINT ck_payments_method CHECK (method IN ('CASH', 'CARD_EXTERNAL', 'TRANSFER')),
    CONSTRAINT ck_payments_status CHECK (status IN ('CAPTURED', 'VOIDED')),
    CONSTRAINT ck_payments_reference CHECK (reference IS NULL OR length(btrim(reference)) BETWEEN 1 AND 120),
    CONSTRAINT ck_payments_finite CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_payments_account_id ON payments (account_id);
CREATE INDEX ix_payments_cash_session_id ON payments (cash_session_id);
CREATE UNIQUE INDEX ux_payments_request ON payments (request_id) WHERE request_id IS NOT NULL;

ALTER TABLE cash_movements
    ADD CONSTRAINT fk_cash_movements_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT;
