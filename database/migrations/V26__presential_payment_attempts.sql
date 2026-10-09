-- Durable identity and fencing for in-person payment registration only.
SET search_path = wok, public;

CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES order_accounts(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sequence BIGINT NOT NULL CHECK (sequence > 0),
    previous_attempt_id UUID REFERENCES payment_attempts(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0 AND amount::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    tip_amount NUMERIC(14,2) NOT NULL CHECK (tip_amount >= 0 AND tip_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
    method TEXT NOT NULL CHECK (method IN ('CASH', 'CARD_EXTERNAL', 'TRANSFER')),
    reference TEXT CHECK (reference IS NULL OR length(btrim(reference)) BETWEEN 1 AND 120),
    register_code TEXT NOT NULL CHECK (length(register_code) BETWEEN 1 AND 32),
    capture_key UUID NOT NULL,
    request_hash TEXT NOT NULL,
    legacy BOOLEAN NOT NULL,
    status TEXT NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED', 'PENDING', 'CONFIRMED', 'REJECTED', 'RETIRED')),
    row_version BIGINT NOT NULL DEFAULT 1,
    execution_requested_at TIMESTAMPTZ,
    payment_id UUID UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
    rejection_status INTEGER CHECK (rejection_status IN (409, 422)),
    rejection_message TEXT,
    retired_reason TEXT,
    transition_reason TEXT,
    transition_actor UUID REFERENCES users(id) ON DELETE RESTRICT,
    request_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, sequence),
    UNIQUE (created_by, capture_key),
    UNIQUE (previous_attempt_id),
    CHECK (
        (status = 'PREPARED' AND execution_requested_at IS NULL AND payment_id IS NULL AND rejection_status IS NULL)
        OR (status = 'PENDING' AND execution_requested_at IS NOT NULL AND payment_id IS NULL AND rejection_status IS NULL)
        OR (status = 'CONFIRMED' AND execution_requested_at IS NOT NULL AND payment_id IS NOT NULL AND rejection_status IS NULL)
        OR (status = 'REJECTED' AND execution_requested_at IS NOT NULL AND payment_id IS NULL AND rejection_status IS NOT NULL AND rejection_message IS NOT NULL)
        OR (status = 'RETIRED' AND execution_requested_at IS NULL AND payment_id IS NULL AND rejection_status IS NULL AND retired_reason IS NOT NULL)
    )
);
CREATE UNIQUE INDEX ux_payment_attempts_active_account ON payment_attempts(account_id)
    WHERE status IN ('PREPARED', 'PENDING');
CREATE INDEX ix_payment_attempts_owner_history ON payment_attempts(created_by, created_at DESC, id);

-- Content/ownership cannot be rewritten, nor can a requested attempt become unrequested.
CREATE FUNCTION protect_payment_attempt_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.id, NEW.account_id, NEW.created_by, NEW.sequence, NEW.previous_attempt_id,
           NEW.amount, NEW.tip_amount, NEW.currency_id, NEW.method, NEW.reference, NEW.register_code,
           NEW.capture_key, NEW.request_hash, NEW.legacy, NEW.request_id, NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.account_id, OLD.created_by, OLD.sequence, OLD.previous_attempt_id,
           OLD.amount, OLD.tip_amount, OLD.currency_id, OLD.method, OLD.reference, OLD.register_code,
           OLD.capture_key, OLD.request_hash, OLD.legacy, OLD.request_id, OLD.created_at)
       OR (OLD.execution_requested_at IS NOT NULL AND NEW.execution_requested_at IS DISTINCT FROM OLD.execution_requested_at)
       OR NEW.row_version <> OLD.row_version + 1
       OR NOT ((OLD.status = 'PREPARED' AND NEW.status IN ('PENDING', 'RETIRED'))
            OR (OLD.status = 'PENDING' AND NEW.status IN ('CONFIRMED', 'REJECTED'))) THEN
        RAISE EXCEPTION 'Invalid payment attempt transition';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER payment_attempt_transition BEFORE UPDATE ON payment_attempts
    FOR EACH ROW EXECUTE FUNCTION protect_payment_attempt_transition();
