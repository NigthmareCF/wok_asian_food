BEGIN;
SET search_path = wok, public;

INSERT INTO users(email, display_name, status)
VALUES ('messaging-test@example.invalid', 'Messaging test', 'ACTIVE');
INSERT INTO customer_profiles(user_id, full_name)
SELECT id, 'Messaging test' FROM users WHERE email = 'messaging-test@example.invalid';
INSERT INTO conversations(customer_id, channel, status, handling_mode, created_by)
SELECT id, 'APP', 'WAITING', 'HUMAN', user_id FROM customer_profiles
WHERE user_id = (SELECT id FROM users WHERE email = 'messaging-test@example.invalid');
INSERT INTO messages(conversation_id, sender_type, sender_user_id, direction, body, idempotency_key)
SELECT c.id, 'CUSTOMER', u.id, 'INBOUND', 'Necesito ayuda con una reserva',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
FROM conversations c CROSS JOIN users u
WHERE u.email = 'messaging-test@example.invalid' AND c.channel = 'APP';

DO $$ BEGIN
  BEGIN
    INSERT INTO conversations(customer_id, channel, status, handling_mode)
    SELECT id, 'APP', 'OPEN', 'HUMAN' FROM customer_profiles
    WHERE user_id = (SELECT id FROM users WHERE email = 'messaging-test@example.invalid');
    RAISE EXCEPTION 'second active APP conversation unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO messages(conversation_id, sender_type, sender_user_id, direction, body, idempotency_key)
    SELECT c.id, 'CUSTOMER', u.id, 'INBOUND', 'Duplicado', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    FROM conversations c CROSS JOIN users u
    WHERE u.email = 'messaging-test@example.invalid' AND c.channel = 'APP';
    RAISE EXCEPTION 'duplicate app message idempotency key unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO messages(conversation_id, sender_type, sender_user_id, direction, body)
    SELECT c.id, 'CUSTOMER', u.id, 'OUTBOUND', 'Invalid direction'
    FROM conversations c CROSS JOIN users u
    WHERE u.email = 'messaging-test@example.invalid' AND c.channel = 'APP';
    RAISE EXCEPTION 'customer outbound message unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

ROLLBACK;
