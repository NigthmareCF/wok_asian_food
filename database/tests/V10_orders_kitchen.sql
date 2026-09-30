-- Structural verification for V10. Run after Flyway on a disposable database.
SET search_path = wok, public;

DO $$
DECLARE
    required_tables TEXT[] := ARRAY[
        'orders', 'order_items', 'order_item_modifiers', 'order_status_history',
        'order_item_status_history', 'kitchen_tickets', 'kitchen_ticket_items',
        'bills', 'bill_orders', 'bill_items'
    ];
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY required_tables LOOP
        IF to_regclass('wok.' || table_name) IS NULL THEN
            RAISE EXCEPTION 'missing required table wok.%', table_name;
        END IF;
    END LOOP;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_orders_dine_in_context' AND conrelid = 'wok.orders'::regclass
    ) THEN
        RAISE EXCEPTION 'orders must require a dining session for DINE_IN orders';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_kitchen_tickets_sequence' AND conrelid = 'wok.kitchen_tickets'::regclass
    ) THEN
        RAISE EXCEPTION 'kitchen ticket sequence constraint is missing';
    END IF;
END $$;
