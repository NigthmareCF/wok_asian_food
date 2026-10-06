-- WOK's current printed menu (development catalog seed; safe to run repeatedly).
-- Run manually after Flyway in a disposable development database. This file is
-- not a Flyway migration and creates no recipe quantities, stock, or consumption.
BEGIN;
SET search_path = wok, public;

INSERT INTO item_types (code, name) VALUES ('MENU_PRODUCT', 'Producto de menú')
ON CONFLICT (code) DO NOTHING;
INSERT INTO units (code, name, dimension, factor_to_base) VALUES ('UNIT', 'Unidad', 'COUNT', 1)
ON CONFLICT (code) DO NOTHING;

INSERT INTO menu_categories (name, display_order) VALUES
 ('Sushi', 10), ('Especialidades', 20), ('Bebidas', 30), ('Bebidas +18', 40)
ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order;

-- Reuse area aliases from earlier development seeds by canonicalizing them.
-- If both names already exist, move menu rows to the canonical row and retire
-- the alias rather than adding another active station with the same meaning.
UPDATE menu_items AS item SET preparation_area_id=canonical.id,
  updated_at=now(), row_version=item.row_version+1
FROM preparation_areas AS legacy
JOIN (VALUES
  ('SUSHI_BAR', 'COCINA_FRIA'), ('HOT_KITCHEN', 'COCINA_CALIENTE'), ('BAR', 'BARRA')
) AS area_map(legacy_code, canonical_code) ON legacy.code=area_map.legacy_code
JOIN preparation_areas AS canonical ON canonical.code=area_map.canonical_code
WHERE item.preparation_area_id=legacy.id;

UPDATE preparation_areas AS legacy SET code=area_map.canonical_code,
  name=area_map.display_name, active=true, updated_at=now(), row_version=legacy.row_version+1
FROM (VALUES
  ('SUSHI_BAR', 'COCINA_FRIA', 'Cocina fría'),
  ('HOT_KITCHEN', 'COCINA_CALIENTE', 'Cocina caliente'),
  ('BAR', 'BARRA', 'Barra')
) AS area_map(legacy_code, canonical_code, display_name)
WHERE legacy.code=area_map.legacy_code
  AND NOT EXISTS (SELECT 1 FROM preparation_areas canonical WHERE canonical.code=area_map.canonical_code);

UPDATE preparation_areas AS legacy SET active=false, updated_at=now(), row_version=legacy.row_version+1
FROM preparation_areas AS canonical
JOIN (VALUES
  ('SUSHI_BAR', 'COCINA_FRIA'), ('HOT_KITCHEN', 'COCINA_CALIENTE'), ('BAR', 'BARRA')
) AS area_map(legacy_code, canonical_code) ON canonical.code=area_map.canonical_code
WHERE legacy.code=area_map.legacy_code;

INSERT INTO preparation_areas (code, name) VALUES
 ('COCINA_FRIA', 'Cocina fría'), ('COCINA_CALIENTE', 'Cocina caliente'), ('BARRA', 'Barra')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true,
  updated_at = now(), row_version = preparation_areas.row_version + 1;

CREATE TEMP TABLE seed_menu_products (
  slug TEXT PRIMARY KEY, sku TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL, area TEXT NOT NULL, price NUMERIC(14,2) NOT NULL,
  restricted BOOLEAN NOT NULL DEFAULT false, display_order INTEGER NOT NULL DEFAULT 0
) ON COMMIT DROP;

INSERT INTO seed_menu_products VALUES
 ('maki-atun','MENU_MAKI_ATUN','Maki Atún','Atún fresco, pepino, zanahoria, queso especiado y mayonesa de jalapeño.','Sushi','COCINA_FRIA',70,false,10),
 ('maki-camaron','MENU_MAKI_CAMARON','Maki Camarón','Camarón pochado, pepino, zanahoria, queso especiado y mayonesa de jalapeño.','Sushi','COCINA_FRIA',65,false,20),
 ('uramaki-aguacate','MENU_URAMAKI_AGUACATE','Uramaki Aguacate','Surimi, zanahoria, pepino, queso especiado y mayonesa de jalapeño, con un top de aguacate fresco.','Sushi','COCINA_FRIA',65,false,30),
 ('uramaki-atun','MENU_URAMAKI_ATUN','Uramaki Atún','Pepino, zanahoria, queso especiado y aguacate con un top de atún fresco.','Sushi','COCINA_FRIA',70,false,40),
 ('uramaki-salmon','MENU_URAMAKI_SALMON','Uramaki Salmón','Surimi, aguacate y queso especiado con un top de salmón fresco y hojuelas de jalapeño.','Sushi','COCINA_FRIA',85,false,50),
 ('gamba-roll','MENU_GAMBA_ROLL','Gamba Roll','Camarón frito en panko con queso especiado y aguacate, bañado en salsa agridulce de la casa.','Sushi','COCINA_FRIA',75,false,60),
 ('camaron-crunchy','MENU_CAMARON_CRUNCHY','Camarón Crunchy','Camarón pochado, cebollín y queso especiado, frito en panko y bañado con mayonesa chipotle y praliné de sésamo.','Sushi','COCINA_FRIA',75,false,70),
 ('panko','MENU_PANKO','Panko','Cubos de arroz rellenos de queso especiado fritos en panko, con aguacate fresco, atún y ensalada de surimi semipicante. 6 cubos por porción.','Sushi','COCINA_FRIA',70,false,80),
 ('onigiris','MENU_ONIGIRIS','Onigiris','Porción de 3 unidades. Elige relleno y preparación.','Sushi','COCINA_FRIA',40,false,90),
 ('pollo-naranja','MENU_POLLO_NARANJA','Pollo a la naranja','Trozos de pollo fritos en panko bañados en salsa de naranja, acompañados de la base de su elección.','Especialidades','COCINA_CALIENTE',65,false,10),
 ('pollo-teriyaki','MENU_POLLO_TERIYAKI','Pollo teriyaki','Trozos de pollo fritos en panko bañados en salsa teriyaki de la casa, acompañados de la base de su elección.','Especialidades','COCINA_CALIENTE',65,false,20),
 ('pollo-agridulce','MENU_POLLO_AGRIDULCE','Pollo agridulce','Trozos de pollo fritos en panko bañados en salsa agridulce con elotitos dulces, acompañados de la base de su elección.','Especialidades','COCINA_CALIENTE',65,false,30),
 ('cerdo-agridulce','MENU_CERDO_AGRIDULCE','Cerdo agridulce','Medallones de lomo de cerdo salteados bañados en salsa agridulce o agridulce picante, acompañados de la base de su elección.','Especialidades','COCINA_CALIENTE',70,false,40),
 ('miso-ramen','MENU_MISO_RAMEN','Miso Ramen','Sopa caliente elaborada con fideos de harina, huevo, brotes, fideo de zanahoria, maíz dulce, lascas de cerdo marinado y fondo de cocción prolongada.','Especialidades','COCINA_CALIENTE',70,false,50),
 ('carbonatada','MENU_CARBONATADA','Carbonatada','Bebida carbonatada. Elige sabor.','Bebidas','BARRA',20,false,10),
 ('gaseosa-coca-cola','MENU_GASEOSA_COCA_COLA','Gaseosa Coca-Cola','Gaseosa Coca-Cola.','Bebidas','BARRA',15,false,20),
 ('gaseosa-sprite','MENU_GASEOSA_SPRITE','Gaseosa Sprite','Gaseosa Sprite.','Bebidas','BARRA',15,false,30),
 ('gaseosa-fanta-naranja','MENU_GASEOSA_FANTA_NARANJA','Gaseosa Fanta Naranja','Gaseosa Fanta Naranja.','Bebidas','BARRA',15,false,40),
 ('soda-coreana','MENU_SODA_COREANA','Soda coreana','Sabores sujetos a disponibilidad.','Bebidas','BARRA',20,false,50),
 ('ice-tea-japones','MENU_ICE_TEA_JAPONES','Ice Tea Japonés','Sabores sujetos a disponibilidad.','Bebidas','BARRA',25,false,60),
 ('agua-pura','MENU_AGUA_PURA','Agua pura','Agua pura.','Bebidas','BARRA',10,false,70),
 ('cafe','MENU_CAFE','Café','Café.','Bebidas','BARRA',15,false,80),
 ('te','MENU_TE','Té','Variedades sujetas a disponibilidad.','Bebidas','BARRA',10,false,90),
 ('matcha-latte','MENU_MATCHA_LATTE','Matcha Latte','Matcha verde tradicional con leche.','Bebidas','BARRA',30,false,100),
 ('matcha-maracuya','MENU_MATCHA_MARACUYA','Matcha Maracuyá','Matcha verde tradicional con sabor a maracuyá.','Bebidas','BARRA',35,false,110),
 ('matcha-kiwi','MENU_MATCHA_KIWI','Matcha Kiwi','Matcha verde tradicional con sabor a kiwi.','Bebidas','BARRA',35,false,120),
 ('blue-matcha','MENU_BLUE_MATCHA','Blue Matcha','Preparado con matcha azul.','Bebidas','BARRA',35,false,130),
 ('cerveza-nacional','MENU_CERVEZA_NACIONAL','Cerveza nacional · Gallo','Cerveza nacional marca Gallo.','Bebidas +18','BARRA',20,true,10),
 ('cerveza-tsingtao','MENU_CERVEZA_TSINGTAO','Cerveza importada · Tsingtao','Cerveza importada. Sujeta a disponibilidad.','Bebidas +18','BARRA',35,true,20),
 ('cerveza-sapporo','MENU_CERVEZA_SAPPORO','Cerveza importada · Sapporo','Cerveza importada. Sujeta a disponibilidad.','Bebidas +18','BARRA',35,true,30),
 ('soju','MENU_SOJU','Soju','Sabores sujetos a disponibilidad.','Bebidas +18','BARRA',45,true,40);

INSERT INTO items (sku, name, description, item_type_id, base_unit_id, track_inventory)
SELECT p.sku, p.name, p.description, t.id, u.id, false
FROM seed_menu_products p
CROSS JOIN item_types t CROSS JOIN units u
WHERE t.code='MENU_PRODUCT' AND u.code='UNIT'
ON CONFLICT (sku) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, track_inventory=false, active=true;

INSERT INTO menu_items (item_id, category_id, preparation_area_id, name, description, price, currency_id,
                        visibility, status, display_order, estimated_preparation_seconds, slug, age_restricted, recipe_status)
SELECT i.id, c.id, a.id, p.name, p.description, p.price, cur.id, 'PUBLIC', 'ACTIVE', p.display_order, 0,
       p.slug, p.restricted, 'PENDING_DATA'
FROM seed_menu_products p
JOIN items i ON i.sku=p.sku
JOIN menu_categories c ON c.name=p.category
JOIN preparation_areas a ON a.code=p.area
JOIN currencies cur ON cur.code='GTQ'
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  item_id=EXCLUDED.item_id, category_id=EXCLUDED.category_id, preparation_area_id=EXCLUDED.preparation_area_id,
  name=EXCLUDED.name, description=EXCLUDED.description, price=EXCLUDED.price, currency_id=EXCLUDED.currency_id,
  visibility=EXCLUDED.visibility, status=EXCLUDED.status, display_order=EXCLUDED.display_order,
  age_restricted=EXCLUDED.age_restricted, recipe_status='PENDING_DATA', updated_at=now();

CREATE TEMP TABLE seed_modifier_groups (code TEXT PRIMARY KEY, display_name TEXT UNIQUE NOT NULL,
  min_selection INTEGER, max_selection INTEGER, required BOOLEAN) ON COMMIT DROP;
INSERT INTO seed_modifier_groups VALUES
 ('PANKO_VARIANT','Presentación',1,1,true), ('ONIGIRI_FILLING','Relleno',1,1,true),
 ('ONIGIRI_PREPARATION','Preparación',1,1,true), ('SUSHI_EXTRAS','Extras',0,4,false),
 ('SPECIALTY_BASE','Base incluida',1,1,true), ('CERDO_SAUCE','Salsa',1,1,true),
 ('SPICE_LEVEL','Nivel de picante',0,1,false), ('CARBONATED_FLAVOR','Sabor',1,1,true),
 ('KOREAN_SODA_FLAVOR','Sabor de soda coreana',1,1,true),
 ('JAPANESE_ICE_TEA_FLAVOR','Sabor de Ice Tea Japonés',1,1,true),
 ('TEA_VARIETY','Variedad de té',1,1,true), ('SOJU_FLAVOR','Sabor de soju',1,1,true);
INSERT INTO modifier_groups (name,min_selection,max_selection,required)
SELECT display_name,min_selection,max_selection,required FROM seed_modifier_groups
ON CONFLICT (name) DO UPDATE SET min_selection=EXCLUDED.min_selection,max_selection=EXCLUDED.max_selection,required=EXCLUDED.required;

CREATE TEMP TABLE seed_modifier_options (group_name TEXT, name TEXT, price_delta NUMERIC(14,2), PRIMARY KEY(group_name,name)) ON COMMIT DROP;
INSERT INTO seed_modifier_options VALUES
 ('PANKO_VARIANT','Presentación estándar',0),('PANKO_VARIANT','Solo atún',5),('PANKO_VARIANT','Solo surimi',0),
 ('ONIGIRI_FILLING','Ensalada de surimi',0),('ONIGIRI_FILLING','Atún chipotle',5),
 ('ONIGIRI_PREPARATION','Normal',0),('ONIGIRI_PREPARATION','Frito en panko',5),
 ('SUSHI_EXTRAS','Aguacate',5),('SUSHI_EXTRAS','Mayonesa chipotle',5),('SUSHI_EXTRAS','Mayonesa jalapeño',5),('SUSHI_EXTRAS','Salsa de anguila',5),
 ('SPECIALTY_BASE','Arroz frito',0),('SPECIALTY_BASE','Chow mein',0),('SPECIALTY_BASE','Vegetales salteados',0),
 ('CERDO_SAUCE','Agridulce',0),('CERDO_SAUCE','Agridulce picante',0),
 ('SPICE_LEVEL','Poco',0),('SPICE_LEVEL','Medio',0),('SPICE_LEVEL','Muy picante',0),
 ('CARBONATED_FLAVOR','Kiwi',0),('CARBONATED_FLAVOR','Maracuyá',0),
 ('KOREAN_SODA_FLAVOR','Según disponibilidad',0),('JAPANESE_ICE_TEA_FLAVOR','Según disponibilidad',0),
 ('TEA_VARIETY','Según disponibilidad',0),('SOJU_FLAVOR','Según disponibilidad',0);
INSERT INTO modifiers (group_id,name,price_delta,active)
SELECT g.id,o.name,o.price_delta,true FROM seed_modifier_options o
JOIN seed_modifier_groups sg ON sg.code=o.group_name JOIN modifier_groups g ON g.name=sg.display_name
ON CONFLICT (group_id,name) DO UPDATE SET price_delta=EXCLUDED.price_delta,active=true;

CREATE TEMP TABLE seed_product_groups (slug TEXT, group_name TEXT, display_order INTEGER, PRIMARY KEY(slug,group_name)) ON COMMIT DROP;
INSERT INTO seed_product_groups VALUES
 ('maki-atun','SUSHI_EXTRAS',1),('maki-camaron','SUSHI_EXTRAS',1),
 ('uramaki-aguacate','SUSHI_EXTRAS',1),('uramaki-atun','SUSHI_EXTRAS',1),
 ('uramaki-salmon','SUSHI_EXTRAS',1),('gamba-roll','SUSHI_EXTRAS',1),
 ('camaron-crunchy','SUSHI_EXTRAS',1),('panko','SUSHI_EXTRAS',2),('onigiris','SUSHI_EXTRAS',3),
 ('panko','PANKO_VARIANT',1),('onigiris','ONIGIRI_FILLING',1),('onigiris','ONIGIRI_PREPARATION',2),
 ('pollo-naranja','SPECIALTY_BASE',1),('pollo-teriyaki','SPECIALTY_BASE',1),('pollo-agridulce','SPECIALTY_BASE',1),
 ('cerdo-agridulce','SPECIALTY_BASE',1),('cerdo-agridulce','CERDO_SAUCE',2),('cerdo-agridulce','SPICE_LEVEL',3),
 ('carbonatada','CARBONATED_FLAVOR',1),('soda-coreana','KOREAN_SODA_FLAVOR',1),('ice-tea-japones','JAPANESE_ICE_TEA_FLAVOR',1),
 ('te','TEA_VARIETY',1),('soju','SOJU_FLAVOR',1);
DELETE FROM menu_item_modifier_groups link
USING menu_items mi, modifier_groups g
WHERE link.menu_item_id=mi.id AND link.group_id=g.id
  AND mi.slug IN (SELECT slug FROM seed_menu_products)
  AND g.name IN (SELECT display_name FROM seed_modifier_groups);
INSERT INTO menu_item_modifier_groups (menu_item_id,group_id,display_order)
SELECT mi.id,g.id,pg.display_order FROM seed_product_groups pg
JOIN menu_items mi ON mi.slug=pg.slug
JOIN seed_modifier_groups sg ON sg.code=pg.group_name
JOIN modifier_groups g ON g.name=sg.display_name
ON CONFLICT (menu_item_id,group_id) DO UPDATE SET display_order=EXCLUDED.display_order;

-- The current Sushi menu is configured to allow these four add-ons. Admin may
-- adjust product compatibility later; these links do not imply stock impact.
-- Manual availability until recipes and verified inventory are delivered.
-- Ingredient hints stay documentation-only; no modifier_item_impacts are seeded.
COMMIT;
