\set ON_ERROR_STOP on
BEGIN;
SET search_path = wok, public;
DO $$
DECLARE
    staff_id UUID := gen_random_uuid();
    register_id UUID;
    session_id UUID;
    duplicate_failed BOOLEAN := false;
    difference_value NUMERIC(14,2);
BEGIN
    INSERT INTO users (id, email, display_name, status)
    VALUES (staff_id, 'cash-v6-test@example.invalid', 'Cash test', 'ACTIVE');
    SELECT id INTO register_id FROM cash_registers WHERE code = 'MAIN' AND active;
    IF register_id IS NULL THEN RAISE EXCEPTION 'Main register seed is missing'; END IF;

    INSERT INTO cash_sessions (cash_register_id, opened_by, created_by)
    VALUES (register_id, staff_id, staff_id)
    RETURNING id INTO session_id;
    INSERT INTO cash_movements (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
    VALUES (session_id, 'OPENING', 200.00, 'Fondo de apertura', staff_id, gen_random_uuid());
    INSERT INTO cash_movements (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
    VALUES (session_id, 'INCOME', 50.00, 'Fondo adicional', staff_id, gen_random_uuid());
    INSERT INTO cash_movements (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
    VALUES (session_id, 'EXPENSE', -12.50, 'Compra de hielo', staff_id, gen_random_uuid());

    IF (SELECT SUM(amount_delta) FROM cash_movements WHERE cash_session_id = session_id) <> 237.50 THEN
        RAISE EXCEPTION 'Expected cash ledger calculation is incorrect';
    END IF;

    BEGIN
        INSERT INTO cash_sessions (cash_register_id, opened_by, created_by)
        VALUES (register_id, staff_id, staff_id);
    EXCEPTION WHEN unique_violation THEN
        duplicate_failed := true;
    END;
    IF NOT duplicate_failed THEN RAISE EXCEPTION 'Second open session for one register was accepted'; END IF;

    INSERT INTO cash_reconciliations (cash_session_id, expected_cash, counted_cash, counted_by, is_final)
    VALUES (session_id, 237.50, 230.00, staff_id, true)
    RETURNING difference INTO difference_value;
    IF difference_value <> -7.50 THEN RAISE EXCEPTION 'Reconciliation difference is incorrect'; END IF;
END $$;
ROLLBACK;
