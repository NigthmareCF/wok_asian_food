-- Structural verification for V11. Run after Flyway on a disposable database.
SET search_path = wok, public;

DO $$
BEGIN
    IF to_regclass('wok.ux_dining_session_tables_active_table') IS NULL THEN
        RAISE EXCEPTION 'an active dining table must be assignable to only one session';
    END IF;
END $$;
