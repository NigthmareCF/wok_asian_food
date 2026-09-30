# Progreso de API backend

## 2026-09-29 — Detalle propio de solicitudes pickup

- `GET /api/v1/client/order-requests/{requestId}` devuelve la solicitud sólo si pertenece al CLIENT autenticado, junto con comentario y líneas basadas en snapshots del nombre, cantidad, precio unitario y total. Un id ajeno/no existente responde 404; no consulta las líneas hasta verificar ownership.
- Pruebas compuestas de API + auth + reservas: 30 pruebas, 0 fallos/errores. Incluye propiedad y snapshot de productos.

## 2026-09-29 — Cancelación de solicitudes pickup

- `DELETE /api/v1/client/order-requests/{requestId}` deja que el Cliente cancele sólo su propia solicitud `PENDING_REVIEW`. La fila se bloquea durante la decisión; recursos inexistentes o ajenos responden 404, estados que ya avanzaron responden 409.
- La transición a `CANCELLED` registra actor, hora, motivo y evento transaccional. Repetir una cancelación ya completada devuelve el estado sin duplicar el evento; no se altera inventario ni pago.
- Pruebas Maven del compuesto API + auth + reservas: 28 pruebas, 0 fallos, 0 errores. La validación fue sobre la composición temporal de ramas, no un merge publicado.

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
# Backend API progress

## 2026-09-30 — Customer delivery request

- Added `POST /api/v1/client/delivery-requests` for CLIENT sessions, with address, optional reference, contact phone, requested time, menu items, and a payment preference. Server recalculates item prices/subtotal, validates menu eligibility and prep lead time, checks DELIVERY service state, and uses per-customer idempotency with a request fingerprint.
- Added owner-filtered `GET /api/v1/client/delivery-requests`. The pickup history/details queries now filter `fulfillment_type='PICKUP'` so delivery requests cannot be mislabeled as pickup. Cancellation continues through the shared owner-scoped order request endpoint while the row is `PENDING_REVIEW`.
- All submissions stay `202 PENDING_REVIEW`; this slice does not accept an order, calculate coverage/route fee, reserve stock, charge, or expose payment credentials. `ONLINE_PAYMENT_REQUESTED` records preference only. Depends on V11 in `feature/database-migrations`; PII retention policy remains open.
- Java 21 composite with foundation/auth/reservations/availability/API/messaging and V1–V11 passed 41/41 tests, including successful repricing, paused-service rejection, and ownership/cancellation/messaging regressions. The composite is for verification only; branches remain separate.
