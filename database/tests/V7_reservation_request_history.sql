\set ON_ERROR_STOP on
BEGIN;
SET search_path = wok, public;

DO $$
DECLARE
    request_key UUID := gen_random_uuid();
    saved_at TIMESTAMPTZ := now() + interval '2 days';
    saved_size INTEGER := 3;
    invalid_party_size_rejected BOOLEAN := false;
    missing_snapshot_rejected BOOLEAN := false;
BEGIN
    INSERT INTO reservation_evaluations (
        request_id, decision, reason_codes, estimated_occupancy_minutes,
        minimum_occupancy_minutes, public_message, policy_version,
        requested_for_at, party_size
    ) VALUES (
        request_key, 'REJECT', '[]'::jsonb, 90, 75, 'Prueba de historial', 'capacity-v1',
        saved_at, saved_size
    );

    IF NOT EXISTS (
        SELECT 1 FROM reservation_evaluations
        WHERE request_id = request_key
          AND requested_for_at = saved_at
          AND party_size = saved_size
    ) THEN
        RAISE EXCEPTION 'Request history snapshot was not persisted';
    END IF;

    BEGIN
        INSERT INTO reservation_evaluations (
            request_id, decision, reason_codes, estimated_occupancy_minutes,
            minimum_occupancy_minutes, public_message, policy_version, party_size
        ) VALUES (
            gen_random_uuid(), 'REJECT', '[]'::jsonb, 90, 75, 'Invalid test', 'capacity-v1', 0
        );
    EXCEPTION WHEN check_violation THEN
        invalid_party_size_rejected := true;
    END;
    IF NOT invalid_party_size_rejected THEN
        RAISE EXCEPTION 'Invalid reservation party size was accepted';
    END IF;

    BEGIN
        INSERT INTO reservation_evaluations (
            request_id, decision, reason_codes, estimated_occupancy_minutes,
            minimum_occupancy_minutes, public_message, policy_version,
            request_payload_hash, party_size
        ) VALUES (
            gen_random_uuid(), 'REJECT', '[]'::jsonb, 90, 75, 'Missing snapshot test', 'capacity-v1', repeat('c', 64), 2
        );
    EXCEPTION WHEN check_violation THEN
        missing_snapshot_rejected := true;
    END;
    IF NOT missing_snapshot_rejected THEN
        RAISE EXCEPTION 'Idempotent request without history snapshot was accepted';
    END IF;
END $$;

ROLLBACK;
