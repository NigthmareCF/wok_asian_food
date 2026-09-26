-- Run after V1 -> V5 on a disposable PostgreSQL database.
BEGIN;
SET search_path = wok, public;

DO $test$
DECLARE
  test_user UUID;
  request_key UUID := gen_random_uuid();
BEGIN
  INSERT INTO users (email, display_name, status)
  VALUES ('reservation-idempotency@example.invalid', 'Reservation Idempotency', 'ACTIVE')
  RETURNING id INTO test_user;

  INSERT INTO reservation_evaluations
    (requester_user_id, request_id, request_payload_hash, decision, reason_codes, estimated_occupancy_minutes,
     minimum_occupancy_minutes, public_message, policy_version)
  VALUES (test_user, request_key, repeat('a', 64), 'REQUIRES_HUMAN_APPROVAL', '[]'::jsonb, 120, 90,
          'Revisaremos tu solicitud.', 'capacity-v1');

  BEGIN
    INSERT INTO reservation_evaluations
      (requester_user_id, request_id, request_payload_hash, decision, reason_codes, estimated_occupancy_minutes,
       minimum_occupancy_minutes, public_message, policy_version)
    VALUES (test_user, request_key, repeat('a', 64), 'REQUIRES_HUMAN_APPROVAL', '[]'::jsonb, 120, 90,
            'Revisaremos tu solicitud.', 'capacity-v1');
    RAISE EXCEPTION 'duplicate reservation idempotency key was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO reservation_evaluations
      (requester_user_id, request_id, request_payload_hash, decision, reason_codes, estimated_occupancy_minutes,
       minimum_occupancy_minutes, public_message, policy_version)
    VALUES (test_user, gen_random_uuid(), repeat('b', 64), 'REQUIRES_HUMAN_APPROVAL', '[]'::jsonb, 90, 120,
            'Revisaremos tu solicitud.', 'capacity-v1');
    RAISE EXCEPTION 'minimum occupancy greater than maximum was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$test$;

ROLLBACK;
