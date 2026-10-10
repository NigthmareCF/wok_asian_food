-- Exceptional, separated-duty retirement of a durable in-person attempt. No financial backfill.
SET search_path = wok, public;

ALTER TABLE payment_attempts
    ADD COLUMN resolved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    ADD COLUMN resolved_at TIMESTAMPTZ,
    ADD COLUMN resolution_reason TEXT,
    ADD COLUMN resolution_evidence TEXT,
    ADD COLUMN resolution_evidence_reference TEXT,
    ADD COLUMN resolution_expected_version BIGINT,
    ADD COLUMN resolution_physical_receipt_status TEXT;

ALTER TABLE payment_attempts DROP CONSTRAINT payment_attempts_check;
ALTER TABLE payment_attempts ADD CONSTRAINT ck_payment_attempts_state_evidence CHECK (
    (status = 'PREPARED' AND execution_requested_at IS NULL AND payment_id IS NULL AND rejection_status IS NULL)
    OR (status = 'PENDING' AND execution_requested_at IS NOT NULL AND payment_id IS NULL AND rejection_status IS NULL)
    OR (status = 'CONFIRMED' AND execution_requested_at IS NOT NULL AND payment_id IS NOT NULL AND rejection_status IS NULL)
    OR (status = 'REJECTED' AND execution_requested_at IS NOT NULL AND payment_id IS NULL AND rejection_status IS NOT NULL AND rejection_message IS NOT NULL)
    OR (status = 'RETIRED' AND payment_id IS NULL AND rejection_status IS NULL AND retired_reason IS NOT NULL
        AND (execution_requested_at IS NULL OR resolved_by IS NOT NULL))
);
ALTER TABLE payment_attempts ADD CONSTRAINT ck_payment_attempts_resolution CHECK (
    (resolved_by IS NULL AND resolved_at IS NULL AND resolution_reason IS NULL AND resolution_evidence IS NULL
        AND resolution_evidence_reference IS NULL AND resolution_expected_version IS NULL
        AND resolution_physical_receipt_status IS NULL)
    OR (status = 'RETIRED' AND resolved_by IS NOT NULL AND resolved_by <> created_by AND resolved_at IS NOT NULL
        AND resolution_reason IS NOT NULL AND resolution_reason ~ '[^[:space:]]' AND length(resolution_reason) <= 500
        AND resolution_reason = retired_reason
        AND resolution_evidence IS NOT NULL AND resolution_evidence ~ '[^[:space:]]' AND length(resolution_evidence) <= 1000
        AND (resolution_evidence_reference IS NULL OR (resolution_evidence_reference ~ '[^[:space:]]' AND length(resolution_evidence_reference) <= 200))
        AND resolution_expected_version IS NOT NULL AND resolution_expected_version > 0
        AND resolution_expected_version = row_version - 1
        AND resolution_physical_receipt_status IS NOT NULL AND resolution_physical_receipt_status = 'NOT_RECEIVED')
);

CREATE OR REPLACE FUNCTION protect_payment_attempt_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.id, NEW.account_id, NEW.created_by, NEW.sequence, NEW.previous_attempt_id,
           NEW.amount, NEW.tip_amount, NEW.currency_id, NEW.method, NEW.reference, NEW.register_code,
           NEW.capture_key, NEW.request_hash, NEW.legacy, NEW.request_id, NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.account_id, OLD.created_by, OLD.sequence, OLD.previous_attempt_id,
           OLD.amount, OLD.tip_amount, OLD.currency_id, OLD.method, OLD.reference, OLD.register_code,
           OLD.capture_key, OLD.request_hash, OLD.legacy, OLD.request_id, OLD.created_at)
       OR (OLD.execution_requested_at IS NOT NULL AND NEW.execution_requested_at IS DISTINCT FROM OLD.execution_requested_at)
       OR (NEW.status = 'RETIRED' AND NEW.execution_requested_at IS DISTINCT FROM OLD.execution_requested_at)
       OR NEW.row_version <> OLD.row_version + 1
       OR (NEW.resolved_by IS NOT NULL AND (NEW.resolved_by = NEW.created_by
           OR NEW.transition_actor IS DISTINCT FROM NEW.resolved_by
           OR NEW.resolution_expected_version IS DISTINCT FROM OLD.row_version))
       OR (OLD.resolved_by IS NOT NULL AND ROW(NEW.resolved_by, NEW.resolved_at, NEW.resolution_reason,
           NEW.resolution_evidence, NEW.resolution_evidence_reference, NEW.resolution_expected_version,
           NEW.resolution_physical_receipt_status) IS DISTINCT FROM ROW(OLD.resolved_by, OLD.resolved_at,
           OLD.resolution_reason, OLD.resolution_evidence, OLD.resolution_evidence_reference,
           OLD.resolution_expected_version, OLD.resolution_physical_receipt_status))
       OR NOT ((OLD.status = 'PREPARED' AND NEW.status IN ('PENDING', 'RETIRED'))
            OR (OLD.status = 'PENDING' AND NEW.status IN ('CONFIRMED', 'REJECTED'))
            OR (OLD.status = 'PENDING' AND NEW.status = 'RETIRED' AND NEW.resolved_by IS NOT NULL)) THEN
        RAISE EXCEPTION 'Invalid payment attempt transition';
    END IF;
    RETURN NEW;
END;
$$;

INSERT INTO permissions (code, description)
VALUES ('payments:resolve', 'Resolver intentos presenciales ajenos sin captura y con evidencia')
ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'ADMIN' AND p.code = 'payments:resolve'
ON CONFLICT (role_id, permission_id) DO NOTHING;
