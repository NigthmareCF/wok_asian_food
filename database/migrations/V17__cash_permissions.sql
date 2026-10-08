-- Permisos granulares de caja. El esquema de caja ya existe en V6; aqui se habilita su gestion operativa.
SET search_path = wok, public;

INSERT INTO permissions (code, description)
VALUES ('cash:manage', 'Abrir, mover y cerrar la caja')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('OPERATIONAL', 'ADMIN')
  AND p.code = 'cash:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;
