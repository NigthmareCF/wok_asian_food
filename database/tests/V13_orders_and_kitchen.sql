-- Constraints de orders, order_accounts, order_items y comandas de cocina.
-- Patron: prepara datos, verifica CHECKs/UNIQUE dentro de DO $$ y revierte con ROLLBACK.
BEGIN;
SET search_path = wok, public;

INSERT INTO users(email, display_name, status) VALUES ('orders-test@example.invalid', 'Temporary test', 'ACTIVE');
INSERT INTO preparation_areas(code, name) VALUES ('ORDERS_TEST_AREA', 'Temporary');
INSERT INTO menu_categories(name) VALUES ('Orders test category');
INSERT INTO item_types(code, name) VALUES ('ORDERS_TEST', 'Temporary');
INSERT INTO units(code, name, dimension, factor_to_base) VALUES ('ORDERS_TEST_U', 'Temporary', 'COUNT', 1);
INSERT INTO items(sku, name, item_type_id, base_unit_id)
SELECT 'ORDERS-TEST-SKU', 'Test dish', t.id, u.id FROM item_types t CROSS JOIN units u
WHERE t.code = 'ORDERS_TEST' AND u.code = 'ORDERS_TEST_U';
INSERT INTO menu_items(item_id, category_id, preparation_area_id, name, price, currency_id, estimated_preparation_seconds)
SELECT i.id, c.id, a.id, 'Test dish', 25.00, cur.id, 420 FROM items i CROSS JOIN menu_categories c
CROSS JOIN preparation_areas a CROSS JOIN currencies cur
WHERE i.sku = 'ORDERS-TEST-SKU' AND c.name = 'Orders test category'
  AND a.code = 'ORDERS_TEST_AREA' AND cur.code = 'GTQ';

INSERT INTO dining_tables(name, capacity, zone) VALUES ('Mesa Test 14', 4, 'PRINCIPAL');
INSERT INTO order_accounts(dining_table_id, name, opened_by)
SELECT t.id, 'Cuenta 1', u.id FROM dining_tables t CROSS JOIN users u
WHERE t.name = 'Mesa Test 14' AND u.email = 'orders-test@example.invalid';

INSERT INTO orders(code, account_id, dining_table_id, channel, currency_id, guest_count, opened_by, idempotency_key, request_fingerprint)
SELECT 'ORD-TEST-0001', a.id, a.dining_table_id, 'DINE_IN', cur.id, 2, u.id,
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', repeat('a', 64)
FROM order_accounts a CROSS JOIN currencies cur CROSS JOIN users u
WHERE a.name = 'Cuenta 1' AND cur.code = 'GTQ' AND u.email = 'orders-test@example.invalid';

INSERT INTO order_items(order_id, menu_item_id, name_snapshot, quantity, unit_price, preparation_area_id)
SELECT o.id, m.id, m.name, 2, m.price, m.preparation_area_id
FROM orders o CROSS JOIN menu_items m WHERE o.code = 'ORD-TEST-0001' AND m.name = 'Test dish';

-- El total se calcula en SQL: line_total es generado y subtotal/total se recalculan por agregacion.
UPDATE orders o
SET subtotal = (SELECT COALESCE(sum(line_total), 0) FROM order_items WHERE order_id = o.id),
    total = (SELECT COALESCE(sum(line_total), 0) FROM order_items WHERE order_id = o.id)
WHERE o.code = 'ORD-TEST-0001';

DO $$ DECLARE
    calculated NUMERIC;
BEGIN
    SELECT total INTO calculated FROM orders WHERE code = 'ORD-TEST-0001';
    IF calculated <> 50.00 THEN
        RAISE EXCEPTION 'expected order total 50.00 but got %', calculated;
    END IF;
END $$;

INSERT INTO kitchen_tickets(order_id, sequence_no, station_id)
SELECT o.id, 1, m.preparation_area_id FROM orders o CROSS JOIN menu_items m
WHERE o.code = 'ORD-TEST-0001' AND m.name = 'Test dish';
INSERT INTO kitchen_ticket_items(ticket_id, order_item_id, quantity)
SELECT t.id, i.id, i.quantity FROM kitchen_tickets t JOIN orders o ON o.id = t.order_id
JOIN order_items i ON i.order_id = o.id WHERE o.code = 'ORD-TEST-0001';

DO $$ BEGIN
    BEGIN
        INSERT INTO order_accounts(dining_table_id, name, opened_by)
        SELECT t.id, 'Cuenta 1', u.id FROM dining_tables t CROSS JOIN users u
        WHERE t.name = 'Mesa Test 14' AND u.email = 'orders-test@example.invalid';
        RAISE EXCEPTION 'duplicate account name unexpectedly accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO orders(code, account_id, currency_id, opened_by)
        SELECT 'ORD-TEST-0001', a.id, cur.id, u.id FROM order_accounts a CROSS JOIN currencies cur CROSS JOIN users u
        WHERE a.name = 'Cuenta 1' AND cur.code = 'GTQ' AND u.email = 'orders-test@example.invalid';
        RAISE EXCEPTION 'duplicate order code unexpectedly accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO orders(code, account_id, currency_id, opened_by, idempotency_key)
        SELECT 'ORD-TEST-KEY', a.id, cur.id, u.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        FROM order_accounts a CROSS JOIN currencies cur CROSS JOIN users u
        WHERE a.name = 'Cuenta 1' AND cur.code = 'GTQ' AND u.email = 'orders-test@example.invalid';
        RAISE EXCEPTION 'reused idempotency key unexpectedly accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO order_items(order_id, menu_item_id, name_snapshot, quantity, unit_price, preparation_area_id)
        SELECT o.id, m.id, m.name, 0, m.price, m.preparation_area_id
        FROM orders o CROSS JOIN menu_items m WHERE o.code = 'ORD-TEST-0001' AND m.name = 'Test dish';
        RAISE EXCEPTION 'zero quantity unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO order_items(order_id, menu_item_id, name_snapshot, quantity, unit_price, preparation_area_id, fulfillment)
        SELECT o.id, m.id, m.name, 1, m.price, m.preparation_area_id, 'BARRIL'
        FROM orders o CROSS JOIN menu_items m WHERE o.code = 'ORD-TEST-0001' AND m.name = 'Test dish';
        RAISE EXCEPTION 'unknown fulfillment unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE orders SET status = 'VOLADOR' WHERE code = 'ORD-TEST-0001';
        RAISE EXCEPTION 'unknown order status unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE orders SET discount = 999 WHERE code = 'ORD-TEST-0001';
        RAISE EXCEPTION 'discount greater than subtotal unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO kitchen_tickets(order_id, sequence_no, station_id)
        SELECT o.id, 1, m.preparation_area_id FROM orders o CROSS JOIN menu_items m
        WHERE o.code = 'ORD-TEST-0001' AND m.name = 'Test dish';
        RAISE EXCEPTION 'duplicate ticket sequence unexpectedly accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO kitchen_tickets(order_id, sequence_no, station_id, status, ready_at)
        SELECT o.id, 2, m.preparation_area_id, 'READY', NULL FROM orders o CROSS JOIN menu_items m
        WHERE o.code = 'ORD-TEST-0001' AND m.name = 'Test dish';
        RAISE EXCEPTION 'ready ticket without ready_at unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO kitchen_ticket_items(ticket_id, order_item_id, quantity, action)
        SELECT t.id, i.id, 1, 'INVENTADO' FROM kitchen_tickets t
        JOIN order_items i ON i.order_id = t.order_id LIMIT 1;
        RAISE EXCEPTION 'unknown ticket action unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

ROLLBACK;
