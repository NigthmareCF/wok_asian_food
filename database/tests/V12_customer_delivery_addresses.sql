BEGIN;
SET search_path = wok, public;

INSERT INTO users(email, display_name, status)
VALUES ('address-test@example.invalid', 'Address test', 'ACTIVE');

INSERT INTO customer_addresses(customer_user_id, label, address, contact_phone, is_default)
SELECT id, 'Casa', 'Zona 10, Ciudad de Guatemala', '+502 5555-1234', true
FROM users WHERE email = 'address-test@example.invalid';

DO $$ BEGIN
  BEGIN
    INSERT INTO customer_addresses(customer_user_id, label, address, contact_phone, is_default)
    SELECT id, 'Trabajo', 'Zona 4, Ciudad de Guatemala', '+502 5555-1234', true
    FROM users WHERE email = 'address-test@example.invalid';
    RAISE EXCEPTION 'second default address unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO customer_addresses(customer_user_id, label, address, contact_phone)
    SELECT id, 'Casa', 'Zona 1, Ciudad de Guatemala', '+502 5555-4321'
    FROM users WHERE email = 'address-test@example.invalid';
    RAISE EXCEPTION 'duplicate customer address label unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO customer_addresses(customer_user_id, label, address, contact_phone)
    SELECT id, 'Invalid', 'Zona 1, Ciudad de Guatemala', 'abc'
    FROM users WHERE email = 'address-test@example.invalid';
    RAISE EXCEPTION 'invalid contact phone unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

ROLLBACK;
