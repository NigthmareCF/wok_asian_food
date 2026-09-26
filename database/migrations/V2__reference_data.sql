-- Reference data only. No fabricated menu, recipe, physical table or account.
SET search_path = wok, public;

INSERT INTO roles (code, name, description)
VALUES
  ('CLIENT', 'Cliente', 'Cuenta pública verificada'),
  ('OPERATIONAL', 'Operativo', 'Personal del restaurante'),
  ('ADMIN', 'Administrativo', 'Administración del restaurante')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, description)
VALUES
  ('profile:read', 'Consultar el perfil propio'),
  ('profile:update', 'Actualizar el perfil propio'),
  ('service:read', 'Consultar estado público de servicios'),
  ('service:manage', 'Gestionar capacidades operativas'),
  ('users:manage', 'Gestionar usuarios y roles'),
  ('audit:read', 'Consultar auditoría autorizada')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE (r.code = 'CLIENT' AND p.code IN ('profile:read', 'profile:update', 'service:read'))
   OR (r.code = 'OPERATIONAL' AND p.code IN ('service:read', 'service:manage'))
   OR (r.code = 'ADMIN' AND p.code IN ('profile:read', 'profile:update', 'service:read', 'service:manage', 'users:manage', 'audit:read'))
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO currencies (code, name, minor_units)
VALUES ('GTQ', 'Quetzal guatemalteco', 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO service_capabilities (code, status, reason)
VALUES
  ('LOCAL', 'ENABLED', 'Operación local inicial'),
  ('RESERVATIONS', 'MANUAL_APPROVAL', 'Evaluación de capacidad requerida'),
  ('DINE_IN_ONLINE', 'MANUAL_APPROVAL', 'Evaluación de capacidad requerida'),
  ('PICKUP', 'MANUAL_APPROVAL', 'Revalidar disponibilidad y ETA'),
  ('DELIVERY', 'MANUAL_APPROVAL', 'Revalidar cobertura y capacidad'),
  ('ONLINE_ORDERS', 'MANUAL_APPROVAL', 'Revalidar antes de aceptar'),
  ('MESSAGING', 'ENABLED', 'Atención humana disponible'),
  ('ONLINE_PAYMENTS', 'DISABLED', 'Sin proveedor contratado'),
  ('PRODUCTION', 'ENABLED', 'Operación interna local')
ON CONFLICT (code) DO NOTHING;
