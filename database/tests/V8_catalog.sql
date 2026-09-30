BEGIN;
SET search_path = wok, public;

INSERT INTO currencies(code, name, minor_units) VALUES ('GTQ', 'Quetzal guatemalteco', 2)
ON CONFLICT (code) DO NOTHING;
INSERT INTO item_types(code, name) VALUES ('TEST_TYPE', 'Temporal de prueba');
INSERT INTO units(code, name, dimension, factor_to_base) VALUES ('TEST_U', 'Unidad de prueba', 'COUNT', 1);
INSERT INTO preparation_areas(code, name) VALUES ('TEST_AREA', 'Área de prueba');
INSERT INTO menu_categories(name) VALUES ('Categoría de prueba');
INSERT INTO modifier_groups(name, min_selection, max_selection, required) VALUES ('Grupo de prueba', 0, 2, false);
INSERT INTO modifiers(group_id, name, price_delta)
SELECT id, 'Opción de prueba', 2.50 FROM modifier_groups WHERE name = 'Grupo de prueba';
INSERT INTO items(sku, name, item_type_id, base_unit_id)
SELECT 'TEST-SKU', 'Artículo de prueba', it.id, u.id FROM item_types it CROSS JOIN units u
WHERE it.code = 'TEST_TYPE' AND u.code = 'TEST_U';
INSERT INTO menu_items(item_id, category_id, preparation_area_id, name, price, currency_id)
SELECT i.id, c.id, a.id, 'Oferta de prueba', 25.00, cur.id FROM items i
CROSS JOIN menu_categories c CROSS JOIN preparation_areas a CROSS JOIN currencies cur
WHERE i.sku = 'TEST-SKU' AND c.name = 'Categoría de prueba' AND a.code = 'TEST_AREA' AND cur.code = 'GTQ';

DO $$ BEGIN
  BEGIN
    INSERT INTO menu_items(item_id, category_id, preparation_area_id, name, price, currency_id)
    SELECT i.id, c.id, a.id, 'Precio negativo', -1, cur.id FROM items i
    CROSS JOIN menu_categories c CROSS JOIN preparation_areas a CROSS JOIN currencies cur
    WHERE i.sku = 'TEST-SKU' AND c.name = 'Categoría de prueba' AND a.code = 'TEST_AREA' AND cur.code = 'GTQ';
    RAISE EXCEPTION 'negative menu price unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO modifier_groups(name, min_selection, max_selection, required) VALUES ('Grupo inválido', 2, 1, true);
    RAISE EXCEPTION 'invalid modifier selection limits unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

ROLLBACK;
