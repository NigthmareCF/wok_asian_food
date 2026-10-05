BEGIN;
SET search_path = wok, public;

INSERT INTO users (email, display_name, status)
VALUES ('reservation-preorder-test@example.invalid', 'Temporary reservation test', 'ACTIVE');
INSERT INTO item_types (code, name) VALUES ('RES_PREORDER_TEST', 'Temporary');
INSERT INTO units (code, name, dimension, factor_to_base) VALUES ('RES_PREORDER_UNIT', 'Temporary', 'COUNT', 1);
INSERT INTO preparation_areas (code, name) VALUES ('RES_PREORDER_AREA', 'Temporary');
INSERT INTO menu_categories (name) VALUES ('Reservation pre-order test');
INSERT INTO modifier_groups (name, min_selection, max_selection, required) VALUES ('Pre-order size', 1, 1, true);
INSERT INTO modifiers (group_id, name, price_delta)
SELECT id, 'Large', 3.00 FROM modifier_groups WHERE name = 'Pre-order size';
INSERT INTO items (sku, name, item_type_id, base_unit_id, track_inventory)
SELECT 'RES-PREORDER-SKU', 'Dish', t.id, u.id, false FROM item_types t CROSS JOIN units u
WHERE t.code = 'RES_PREORDER_TEST' AND u.code = 'RES_PREORDER_UNIT';
INSERT INTO menu_items (item_id, category_id, preparation_area_id, name, price, currency_id, visibility, status)
SELECT i.id, c.id, a.id, 'Snapshot dish', 20.00, cur.id, 'PUBLIC', 'ACTIVE'
FROM items i CROSS JOIN menu_categories c CROSS JOIN preparation_areas a CROSS JOIN currencies cur
WHERE i.sku = 'RES-PREORDER-SKU' AND c.name = 'Reservation pre-order test'
  AND a.code = 'RES_PREORDER_AREA' AND cur.code = 'GTQ';
INSERT INTO reservation_evaluations
    (request_id, requester_user_id, request_payload_hash, decision, reason_codes, estimated_occupancy_minutes,
     minimum_occupancy_minutes, public_message, policy_version, requested_for_at, party_size)
SELECT 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', u.id, repeat('a', 64), 'REQUIRES_HUMAN_APPROVAL', '[]',
       105, 75, 'Pending staff review', 'capacity-v1', now() + interval '1 day', 2
FROM users u WHERE u.email = 'reservation-preorder-test@example.invalid';
INSERT INTO reservation_request_items (request_id, menu_item_id, name_snapshot, quantity, unit_price, currency_id)
SELECT e.request_id, m.id, m.name, 2, 23.00, m.currency_id FROM reservation_evaluations e CROSS JOIN menu_items m
WHERE e.request_id = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND m.name = 'Snapshot dish';
INSERT INTO reservation_request_item_modifiers
    (reservation_request_item_id, modifier_id, group_name_snapshot, modifier_name_snapshot, price_delta)
SELECT i.id, m.id, g.name, m.name, m.price_delta
FROM reservation_request_items i CROSS JOIN modifiers m CROSS JOIN modifier_groups g
WHERE i.request_id = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND m.name = 'Large' AND g.name = 'Pre-order size';

DO $$ BEGIN
  IF (SELECT line_total FROM reservation_request_items WHERE request_id = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1') <> 46.00 THEN
    RAISE EXCEPTION 'generated pre-order line total is incorrect';
  END IF;
  BEGIN
    INSERT INTO reservation_request_items (request_id, menu_item_id, name_snapshot, quantity, unit_price, currency_id)
    SELECT i.request_id, i.menu_item_id, i.name_snapshot, 0, i.unit_price, i.currency_id
    FROM reservation_request_items i WHERE i.request_id = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    RAISE EXCEPTION 'zero pre-order quantity unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO reservation_request_items (request_id, menu_item_id, name_snapshot, quantity, unit_price, currency_id)
    SELECT i.request_id, i.menu_item_id, i.name_snapshot, 1, i.unit_price, i.currency_id
    FROM reservation_request_items i WHERE i.request_id = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    RAISE EXCEPTION 'duplicate product line unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

ROLLBACK;
