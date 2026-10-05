-- Administrative read/update access to configured public menu items.
SET search_path = wok, public;

INSERT INTO permissions (code, description)
VALUES ('catalog:manage', 'Consultar y mantener el catálogo del menú')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'ADMIN' AND p.code = 'catalog:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;
