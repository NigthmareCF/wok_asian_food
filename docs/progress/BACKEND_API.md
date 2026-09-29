# Progreso de API backend

## 2026-09-29 — Lectura pública del menú

- Se creó `GET /api/v1/public/menu`, que entrega categorías activas y elementos `PUBLIC`/`ACTIVE` cuyo artículo asociado también está activo.
- El contrato incluye nombre, descripción, precio decimal, moneda, referencia de imagen y tiempo de preparación configurado. La consulta no expone datos de inventario ni afirma que un producto esté disponible para pedir.
- La ruta cae bajo `/api/v1/public/**`, permitida sin sesión por la configuración de seguridad que se integra desde `feature/backend-auth`.
- Pruebas unitarias de filtrado del resultado y respuesta vacía pasan dentro de la composición de backend. La suite completa tras este slice pasó sin fallos; el servicio todavía necesita composición con Spring + Flyway V8 para el smoke HTTP/PostgreSQL.
- Dependencias de integración: `feature/backend-foundation` → migraciones `feature/database-migrations` (V8) → auth/security `feature/backend-auth` → este endpoint `feature/backend-api`. El branch de API aún no contiene el `pom.xml`/arranque; compilarlo requiere esa base.
- El catálogo permanece vacío hasta que coordinación entregue las categorías y productos reales.
