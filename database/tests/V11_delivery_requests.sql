BEGIN;
SET search_path = wok, public;

INSERT INTO users(email, display_name, status)
VALUES ('delivery-test@example.invalid', 'Delivery test', 'ACTIVE');

INSERT INTO order_requests(customer_user_id, fulfillment_type, idempotency_key, request_fingerprint,
                           requested_for, subtotal, currency_id, delivery_address, delivery_reference,
                           contact_phone, payment_preference)
SELECT u.id, 'DELIVERY', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', repeat('b', 64), now() + interval '1 hour',
       10.00, c.id, 'Zona 10, Ciudad de Guatemala', 'Casa con portón negro', '+502 5555-1234', 'CASH_ON_DELIVERY'
FROM users u CROSS JOIN currencies c
WHERE u.email = 'delivery-test@example.invalid' AND c.code = 'GTQ';

DO $$ BEGIN
  BEGIN
    INSERT INTO order_requests(customer_user_id, fulfillment_type, idempotency_key, request_fingerprint,
                               requested_for, subtotal, currency_id)
    SELECT id, 'DELIVERY', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', repeat('c', 64), now() + interval '1 hour',
           10.00, (SELECT id FROM currencies WHERE code = 'GTQ')
    FROM users WHERE email = 'delivery-test@example.invalid';
    RAISE EXCEPTION 'delivery without contact/address/payment preference unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO order_requests(customer_user_id, fulfillment_type, idempotency_key, request_fingerprint,
                               requested_for, subtotal, currency_id, delivery_address, contact_phone)
    SELECT id, 'DELIVERY', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', repeat('e', 64), now() + interval '1 hour',
           10.00, (SELECT id FROM currencies WHERE code = 'GTQ'), 'Zona 10, Ciudad de Guatemala', '+502 5555-1234'
    FROM users WHERE email = 'delivery-test@example.invalid';
    RAISE EXCEPTION 'delivery without payment preference unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO order_requests(customer_user_id, fulfillment_type, idempotency_key, request_fingerprint,
                               requested_for, subtotal, currency_id, delivery_address, delivery_reference,
                               contact_phone, payment_preference)
    SELECT id, 'PICKUP', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', repeat('d', 64), now() + interval '1 hour',
           10.00, (SELECT id FROM currencies WHERE code = 'GTQ'), 'Unexpected address', NULL, '+502 5555-1234',
           'CASH_ON_DELIVERY'
    FROM users WHERE email = 'delivery-test@example.invalid';
    RAISE EXCEPTION 'pickup with delivery details unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

ROLLBACK;
