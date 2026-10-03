-- Granular operational permissions. Replaces coarse role checks on tables, orders and kitchen.
SET search_path = wok, public;

INSERT INTO permissions (code, description)
VALUES
  ('tables:manage', 'Gestionar mesas y su estado'),
  ('orders:manage', 'Crear y avanzar pedidos del salón'),
  ('kitchen:manage', 'Gestionar comandas de cocina'),
  ('accounts:manage', 'Abrir y cerrar cuentas de mesa')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('OPERATIONAL', 'ADMIN')
  AND p.code IN ('tables:manage', 'orders:manage', 'kitchen:manage', 'accounts:manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;
