BEGIN;
SET search_path = wok, public;

DO $$ BEGIN
  IF to_regclass('wok.payment_evidence') IS NULL OR to_regclass('wok.payment_evidence_events') IS NULL THEN
    RAISE EXCEPTION 'payment evidence tables are missing';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'wok' AND indexname = 'ux_payment_evidence_content_sha256'
  ) THEN
    RAISE EXCEPTION 'global duplicate-content protection is missing';
  END IF;
END $$;

INSERT INTO users(email, display_name, status) VALUES ('payment-evidence-test@example.invalid', 'Temporary test', 'ACTIVE');
INSERT INTO order_requests(customer_user_id, idempotency_key, request_fingerprint, requested_for, subtotal, currency_id,
                           fulfillment_type, payment_preference)
SELECT u.id, 'b1b11111-1111-4111-8111-111111111111', repeat('b',64), now() + interval '1 hour', 10,
       c.id, 'PICKUP', 'TRANSFER_AT_PICKUP'
FROM users u CROSS JOIN currencies c
WHERE u.email = 'payment-evidence-test@example.invalid' AND c.code = 'GTQ';
INSERT INTO payment_evidence(order_request_id, customer_user_id, idempotency_key, content_sha256, content_type, byte_size)
SELECT r.id, r.customer_user_id, 'b2b22222-2222-4222-8222-222222222222', repeat('c',64), 'image/png', 100
FROM order_requests r WHERE r.idempotency_key = 'b1b11111-1111-4111-8111-111111111111';

DO $$ BEGIN
  BEGIN
    INSERT INTO payment_evidence(order_request_id, customer_user_id, idempotency_key, content_sha256, content_type, byte_size)
    SELECT r.id, r.customer_user_id, 'b3b33333-3333-4333-8333-333333333333', repeat('c',64), 'image/jpeg', 100
    FROM order_requests r WHERE r.idempotency_key = 'b1b11111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'duplicate receipt content unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO payment_evidence(order_request_id, customer_user_id, idempotency_key, content_sha256, content_type, byte_size)
    SELECT r.id, r.customer_user_id, 'b4b44444-4444-4444-8444-444444444444', repeat('d',64), 'image/svg+xml', 100
    FROM order_requests r WHERE r.idempotency_key = 'b1b11111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'unsupported image content type unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO payment_evidence(order_request_id, customer_user_id, idempotency_key, content_sha256, content_type, byte_size)
    SELECT r.id, r.customer_user_id, 'b5b55555-5555-4555-8555-555555555555', repeat('e',64), 'image/png', 8388609
    FROM order_requests r WHERE r.idempotency_key = 'b1b11111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'oversized receipt unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

ROLLBACK;
