-- Run after financial V26/V27 and the unversioned proposal on a disposable database.
\set ON_ERROR_STOP on
BEGIN;
SET search_path = wok, public;

DO $test$
DECLARE
  actor UUID;
  account UUID;
  register UUID;
  session UUID;
  payment UUID;
  trace UUID := gen_random_uuid();
  duplicate_rejected BOOLEAN := false;
BEGIN
  INSERT INTO users (email, display_name, status)
  VALUES ('cash-traceability@example.invalid', 'Cash Traceability', 'ACTIVE')
  RETURNING id INTO actor;

  INSERT INTO order_accounts (name, status, opened_by)
  VALUES ('Cash traceability account', 'OPEN', actor)
  RETURNING id INTO account;

  SELECT id INTO register FROM cash_registers WHERE code = 'MAIN';
  INSERT INTO cash_sessions (cash_register_id, opened_by)
  VALUES (register, actor)
  RETURNING id INTO session;

  INSERT INTO payments (account_id, cash_session_id, amount, currency_id, method, captured_by, request_id)
  SELECT account, session, 10, id, 'CASH', actor, trace FROM currencies WHERE code = 'GTQ'
  RETURNING id INTO payment;

  INSERT INTO cash_movements
      (cash_session_id, movement_type, amount_delta, payment_id, reason, responsible_user_id, request_id)
  VALUES (session, 'SALE', 10, payment, 'Venta de prueba', actor, trace);
  INSERT INTO cash_movements
      (cash_session_id, movement_type, amount_delta, payment_id, reason, responsible_user_id, request_id)
  VALUES (session, 'INCOME', 2, payment, 'Propina de cuenta', actor, trace);

  BEGIN
    INSERT INTO cash_movements
        (cash_session_id, movement_type, amount_delta, payment_id, reason, responsible_user_id, request_id)
    VALUES (session, 'SALE', 10, payment, 'Venta duplicada', actor, trace);
    RAISE EXCEPTION 'duplicate SALE trace was accepted';
  EXCEPTION WHEN unique_violation THEN
    duplicate_rejected := true;
  END;
  IF NOT duplicate_rejected THEN
    RAISE EXCEPTION 'duplicate SALE trace was not rejected';
  END IF;

  INSERT INTO cash_movements
      (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
  VALUES (session, 'EXPENSE', -1, 'Movimiento manual', actor, trace);

  duplicate_rejected := false;
  BEGIN
    INSERT INTO cash_movements
        (cash_session_id, movement_type, amount_delta, payment_id, reason, responsible_user_id, request_id)
    VALUES (session, 'INCOME', 2, payment, 'Propina duplicada', actor, trace);
    RAISE EXCEPTION 'duplicate TIP trace was accepted';
  EXCEPTION WHEN unique_violation THEN
    duplicate_rejected := true;
  END;
  IF NOT duplicate_rejected THEN
    RAISE EXCEPTION 'duplicate TIP trace was not rejected';
  END IF;

  duplicate_rejected := false;
  BEGIN
    INSERT INTO cash_movements
        (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
    VALUES (session, 'EXPENSE', -1, 'Movimiento manual duplicado', actor, trace);
    RAISE EXCEPTION 'manual request collision was accepted';
  EXCEPTION WHEN unique_violation THEN
    duplicate_rejected := true;
  END;
  IF NOT duplicate_rejected THEN
    RAISE EXCEPTION 'manual request collision was not rejected';
  END IF;
END
$test$;

ROLLBACK;
