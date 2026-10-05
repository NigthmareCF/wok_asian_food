-- Keep one editable schedule row per service and weekday.
SET search_path = wok, public;

CREATE UNIQUE INDEX uq_business_hours_service_weekday
    ON business_hours (service_type, weekday);

INSERT INTO permissions (code, description)
VALUES ('hours:manage', 'Consultar y mantener los horarios de servicio')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'ADMIN' AND p.code = 'hours:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;
