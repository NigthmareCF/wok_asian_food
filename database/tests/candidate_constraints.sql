-- Candidate-only checks, run on a disposable DB after schema/postgresql.sql.
BEGIN;
SET search_path = wok, public;

DO $test$
DECLARE
  currency_id UUID;
  bill_id UUID;
  invoice_id UUID;
  user_id UUID;
  customer_id UUID;
  reservation_id UUID;
  table_id UUID;
BEGIN
  INSERT INTO currencies (code, name) VALUES ('GTQ', 'Quetzal') RETURNING id INTO currency_id;
  INSERT INTO bills (currency_id) VALUES (currency_id) RETURNING id INTO bill_id;
  INSERT INTO invoices (bill_id, document_type, status, issuer_snapshot,
                        customer_name_snapshot, currency_id, subtotal, tax_total, total)
  VALUES (bill_id, 'INVOICE', 'DRAFT', '{}'::jsonb,
          'Consumidor final', currency_id, 0, 0, 0)
  RETURNING id INTO invoice_id;
  IF (SELECT series IS NULL AND document_number IS NULL FROM invoices WHERE id = invoice_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'draft numbering should be optional';
  END IF;
  BEGIN
    UPDATE invoices SET status = 'CERTIFIED' WHERE id = invoice_id;
    RAISE EXCEPTION 'uncertified document was accepted as certified';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO users (email, display_name, status)
  VALUES ('candidate-review@example.invalid', 'Candidate Review', 'ACTIVE')
  RETURNING id INTO user_id;
  INSERT INTO customer_profiles (user_id, full_name)
  VALUES (user_id, 'Candidate Review') RETURNING id INTO customer_id;
  INSERT INTO dining_tables (name, capacity, zone)
  VALUES ('review-only', 4, 'review') RETURNING id INTO table_id;
  INSERT INTO reservations (customer_id, party_size, reservation_at, ends_at)
  VALUES (customer_id, 2, now() + interval '1 day', now() + interval '1 day 2 hours')
  RETURNING id INTO reservation_id;
  INSERT INTO reservation_table_assignments
    (reservation_id, table_id, occupied_period, assigned_by)
  VALUES (reservation_id, table_id,
          tstzrange(now() + interval '1 day', now() + interval '1 day 2 hours', '[)'), user_id);
  BEGIN
    INSERT INTO reservation_table_assignments
      (reservation_id, table_id, occupied_period, assigned_by)
    VALUES (reservation_id, table_id,
            tstzrange(now() + interval '1 day 1 hour', now() + interval '1 day 3 hours', '[)'), user_id);
    RAISE EXCEPTION 'overlapping table assignment was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
END
$test$;
ROLLBACK;
