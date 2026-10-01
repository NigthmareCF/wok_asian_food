BEGIN;
SET search_path = wok, public;

INSERT INTO users(email, display_name, status) VALUES ('order-request-test@example.invalid', 'Temporary test', 'ACTIVE');
INSERT INTO item_types(code, name) VALUES ('ORDER_TEST', 'Temporary');
INSERT INTO units(code, name, dimension, factor_to_base) VALUES ('ORDER_TEST_U', 'Temporary', 'COUNT', 1);
INSERT INTO preparation_areas(code, name) VALUES ('ORDER_TEST_AREA', 'Temporary');
INSERT INTO menu_categories(name) VALUES ('Order request test category');
INSERT INTO items(sku, name, item_type_id, base_unit_id)
SELECT 'ORDER-TEST-SKU', 'Snapshot source', t.id, u.id FROM item_types t CROSS JOIN units u
WHERE t.code = 'ORDER_TEST' AND u.code = 'ORDER_TEST_U';
INSERT INTO menu_items(item_id, category_id, preparation_area_id, name, price, currency_id)
SELECT i.id, c.id, a.id, 'Snapshot name', 10.25, cur.id FROM items i CROSS JOIN menu_categories c
CROSS JOIN preparation_areas a CROSS JOIN currencies cur
WHERE i.sku = 'ORDER-TEST-SKU' AND c.name = 'Order request test category'
  AND a.code = 'ORDER_TEST_AREA' AND cur.code = 'GTQ';
INSERT INTO order_requests(customer_user_id, idempotency_key, request_fingerprint, requested_for, subtotal, currency_id)
SELECT u.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('a',64), now() + interval '1 hour', 20.50, c.id
FROM users u CROSS JOIN currencies c WHERE u.email = 'order-request-test@example.invalid' AND c.code = 'GTQ';
INSERT INTO order_request_items(order_request_id, menu_item_id, name_snapshot, quantity, unit_price, currency_id)
SELECT r.id, m.id, m.name, 2, m.price, m.currency_id FROM order_requests r CROSS JOIN menu_items m
WHERE r.idempotency_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND m.name = 'Snapshot name';
INSERT INTO order_request_events(order_request_id, event_type)
SELECT id, 'SUBMITTED' FROM order_requests WHERE idempotency_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

DO $$ BEGIN
  BEGIN
    INSERT INTO order_requests(customer_user_id, idempotency_key, request_fingerprint, requested_for, subtotal, currency_id)
    SELECT u.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('b',64), now() + interval '1 hour', 1, c.id
    FROM users u CROSS JOIN currencies c WHERE u.email = 'order-request-test@example.invalid' AND c.code = 'GTQ';
    RAISE EXCEPTION 'duplicate idempotency key unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO order_request_items(order_request_id, menu_item_id, name_snapshot, quantity, unit_price, currency_id)
    SELECT r.id, m.id, m.name, 0, m.price, m.currency_id FROM order_requests r CROSS JOIN menu_items m
    WHERE r.idempotency_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND m.name = 'Snapshot name';
    RAISE EXCEPTION 'zero quantity unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

ROLLBACK;
