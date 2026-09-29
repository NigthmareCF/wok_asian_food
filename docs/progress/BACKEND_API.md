# Progreso de API backend

## 2026-09-29 — Lectura pública del menú

- Se creó `GET /api/v1/public/menu`, que entrega categorías activas y elementos `PUBLIC`/`ACTIVE` cuyo artículo asociado también está activo.
- El contrato incluye nombre, descripción, precio decimal, moneda, referencia de imagen y tiempo de preparación configurado. La consulta no expone datos de inventario ni afirma que un producto esté disponible para pedir.
- La ruta cae bajo `/api/v1/public/**`, permitida sin sesión por la configuración de seguridad que se integra desde `feature/backend-auth`.
- Pruebas unitarias de filtrado y catálogo vacío pasan dentro de la composición. Smoke HTTP/PostgreSQL completado con Spring + Flyway V1–V8: la ruta pública respondió 200 con catálogo vacío y luego devolvió un platillo sintético GTQ; se eliminó el entorno efímero al terminar.
- Dependencias de integración: `feature/backend-foundation` → migraciones `feature/database-migrations` (V8) → auth/security `feature/backend-auth` → este endpoint `feature/backend-api`. El branch de API aún no contiene el `pom.xml`/arranque; compilarlo requiere esa base.
- El catálogo permanece vacío hasta que coordinación entregue las categorías y productos reales.

## 2026-09-29 — Solicitud autenticada de pickup

- `POST /api/v1/client/order-requests` acepta únicamente sesión `CLIENT`, requiere clave `Idempotency-Key` UUID y solicitud de productos publicados con hora futura. El servidor vuelve a leer precios/nombres, valida moneda única y tiempo de preparación, calcula subtotal decimal y guarda instantáneas y evento.
- Responde `202 PENDING_REVIEW`: no crea una orden aceptada, no confirma inventario, no cobra y exige validación operativa antes de aceptar. `GET` devuelve máximo 50 solicitudes del propietario.
- La misma clave y cuerpo devuelve el mismo resultado; cambiar datos bajo la misma clave responde `409`. Productos ocultos/inactivos o solicitud demasiado temprana responden `422`.
- Pruebas Java unitarias y smoke HTTP/PostgreSQL sobre V1–V9 completados: 202 de primera solicitud, retry replay idempotente, conflicto 409 con cuerpo distinto e historial propio de una solicitud. El usuario y menú fueron datos sintéticos en DB desechable.
- Fuera del slice: revisión/aceptación por Operativo (no se puede aceptar con seguridad hasta conectar capacidad/stock), delivery, pago, factura y dirección. La app no presenta esta solicitud como pedido.
