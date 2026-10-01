-- Seed minimo para desarrollo (NO ejecutar en produccion).
-- Idempotente: se puede reintentar sin duplicar filas.
SET search_path = wok, public;

-- Identidades demo
INSERT INTO users (id, email, display_name, status, email_verified_at, sessions_valid_after)
VALUES
  ('c9b8f7d9-1f27-4f05-b79a-580fe34165a2', 'operativo@wok.demo', 'Operativo Demo', 'ACTIVE', now(), now()),
  ('a05669cc-7b8c-47ab-bf75-d15ea562a960', 'admin@wok.demo', 'Admin Demo', 'ACTIVE', now(), now())
ON CONFLICT (email) DO NOTHING;

-- Credenciales demo (BCrypt 12). Password: DemoOperativo2026 / DemoAdmin2026
INSERT INTO user_credentials (user_id, password_hash, password_changed_at, must_change_password, credentials_updated_at)
VALUES
  ('c9b8f7d9-1f27-4f05-b79a-580fe34165a2', '$2a$12$89A08caj5mjOGl8VWe5xd.MJb5xIQxBzjtdFlt7PrUz5kqkcmJaoe', now(), false, now()),
  ('a05669cc-7b8c-47ab-bf75-d15ea562a960', '$2a$12$lov30fyuahmyn0m.7/P/0elTBQqnpyU6ZBVdvFYX9b.B8S4nQT3CG', now(), false, now())
ON CONFLICT (user_id) DO NOTHING;

-- Roles operativos y administrativos
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON r.code IN ('OPERATIONAL', 'ADMIN')
WHERE (u.email = 'operativo@wok.demo' AND r.code = 'OPERATIONAL')
   OR (u.email = 'admin@wok.demo' AND r.code = 'ADMIN')
ON CONFLICT DO NOTHING;

-- Perfiles cliente requeridos por constraints
INSERT INTO customer_profiles (user_id, full_name)
VALUES
  ('c9b8f7d9-1f27-4f05-b79a-580fe34165a2', 'Operativo Demo'),
  ('a05669cc-7b8c-47ab-bf75-d15ea562a960', 'Admin Demo')
ON CONFLICT (user_id) DO NOTHING;

-- Mesas iniciales
INSERT INTO dining_tables (name, capacity, zone)
VALUES
  ('Mesa 01', 4, 'PRINCIPAL'),
  ('Mesa 02', 4, 'PRINCIPAL'),
  ('Mesa 03', 6, 'TERRAZA')
ON CONFLICT (name) DO NOTHING;

-- Catalogo minimo: una categoria, una estacion y un plato disponible
INSERT INTO item_types (code, name) VALUES ('PLATO', 'Plato') ON CONFLICT (code) DO NOTHING;
INSERT INTO units (code, name, dimension, factor_to_base) VALUES ('UNID', 'Unidad', 'COUNT', 1.000000)
ON CONFLICT (code) DO NOTHING;
INSERT INTO preparation_areas (code, name) VALUES ('COCINA', 'Cocina Principal') ON CONFLICT (code) DO NOTHING;
INSERT INTO menu_categories (name, display_order) VALUES ('Platos de la casa', 1) ON CONFLICT (name) DO NOTHING;

INSERT INTO items (sku, name, description, item_type_id, base_unit_id)
SELECT 'WOK-001', 'Gyozas de cerdo', '6 piezas', t.id, u.id
FROM item_types t CROSS JOIN units u WHERE t.code = 'PLATO' AND u.code = 'UNID'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO menu_items (item_id, category_id, preparation_area_id, name, price, currency_id,
                        estimated_preparation_seconds)
SELECT i.id, c.id, a.id, 'Gyozas de cerdo', 68.00, cur.id, 300
FROM items i
JOIN menu_categories c ON c.name = 'Platos de la casa'
JOIN preparation_areas a ON a.code = 'COCINA'
JOIN currencies cur ON cur.code = 'GTQ'
WHERE i.sku = 'WOK-001'
  AND NOT EXISTS (SELECT 1 FROM menu_items m WHERE m.item_id = i.id AND m.category_id = c.id);
