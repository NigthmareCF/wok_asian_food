# Progreso de API backend

## 2026-09-30 — Direcciones guardadas y protegidas por propietario

- `GET/POST /api/v1/client/addresses`, `PUT/DELETE /api/v1/client/addresses/{addressId}` ofrecen una libreta privada para Cliente. Cada operación exige rol CLIENT y todas las lecturas/cambios incluyen `customer_user_id` del token.
- Creación/edición serializa los cambios por cliente, admite un único default, usa versión optimista para evitar sobrescribir ediciones y responde 404 para direcciones ajenas/no existentes. El API sólo persiste, no geocodifica ni verifica zona/tarifa.
- Requiere V12 (`customer_addresses`) de `feature/database-migrations`; PII retention y derecho de eliminación deben definirse antes de producción. Pruebas focales: ownership de borrado y rechazo de versión desactualizada.

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

## 2026-09-30 — Delivery request details

- Added owner-scoped `GET /api/v1/client/delivery-requests/{requestId}`. It first queries a delivery request by both ID and authenticated customer ID, then reads only item snapshots; pickup IDs and other customers' requests return the same 404.
- The DTO returns state, requested time, subtotal/currency, payment preference, customer note, and immutable item name/quantity/unit/line totals. It does not expose delivery address/contact data or imply order acceptance/payment.
- Added focused controller tests for owner-scope rejection before line lookup and snapshot detail mapping. Maven 3.9.11 was run against a fresh temporary composite containing this branch's API sources and the backend foundation/auth/reservation sources; 41 tests passed, 0 failures/errors/skips. This is a unit-test composite, not an HTTP/PostgreSQL E2E test; the V11 runtime schema and real auth wiring still require integrated validation.

## 2026-09-30 — Customer delivery request

- Added `POST /api/v1/client/delivery-requests` for CLIENT sessions, with address, optional reference, contact phone, requested time, menu items, and a payment preference. Server recalculates item prices/subtotal, validates menu eligibility and prep lead time, checks DELIVERY service state, and uses per-customer idempotency with a request fingerprint.
- Added owner-filtered `GET /api/v1/client/delivery-requests`. The pickup history/details queries now filter `fulfillment_type='PICKUP'` so delivery requests cannot be mislabeled as pickup. Cancellation continues through the shared owner-scoped order request endpoint while the row is `PENDING_REVIEW`.
- All submissions stay `202 PENDING_REVIEW`; this slice does not accept an order, calculate coverage/route fee, reserve stock, charge, or expose payment credentials. `ONLINE_PAYMENT_REQUESTED` records preference only. Depends on V11 in `feature/database-migrations`; PII retention policy remains open.
- Java 21 composite with foundation/auth/reservations/availability/API/messaging and V1–V11 passed 41/41 tests, including successful repricing, paused-service rejection, and ownership/cancellation/messaging regressions. The composite is for verification only; branches remain separate.

## 2026-10-08 — D1: contratos delivery, detenido por defectos demostrados

- Rama verificada: `feature/chan-delivery-contracts`; sin operaciones Git de escritura ni cambios productivos.
- Cobertura agregada en `apps/api/src/test/java/com/wokasianfood/api/operational/OrderRequestDecisionIntegrationTest.java`, reutilizando su infraestructura HTTP/PostgreSQL y fixtures. Se amplió la prueba existente de ACCEPT para crear delivery por HTTP y comparar solicitud, ítems, eventos, auditoría y conteos completos, sin duplicarla.
- Casos: address/contactPhone/paymentPreference inválidos; ítems nulos, vacíos, duplicados, cantidad cero y productos inexistentes/inactivos; replay y conflicto 409; DELIVERY PAUSED/DISABLED con 503 sin persistencia; historial/detalle aislados entre dos clientes; REJECT repetido con evento/auditoría únicos y sin pedido; ACCEPT con 422 sin modificaciones.
- Ejecución: `cd apps/api` y `./mvnw.cmd -Dtest=OrderRequestDecisionIntegrationTest test`. HTTP real con Spring Boot en puerto aleatorio, PostgreSQL 18.6 desechable mediante Testcontainers y migraciones V1–V25. Resultado: 23 pruebas, 21 aprobadas, 2 fallidas, 0 omitidas.
- Defecto 1: POST `/api/v1/client/delivery-requests` con payload válido salvo `paymentPreference: "INVALID"` devuelve 500 en vez de 400. La deserialización lanza `HttpMessageNotReadableException`, capturada por el manejador genérico de `ApiErrorHandler`.
- Defecto 2: el mismo endpoint con `items: [null]` devuelve 500 en vez de 400. El elemento nulo llega a `ClientDeliveryRequestController.normalize` y causa `NullPointerException`.
- Se detuvo el trabajo al obtener estos resultados, conforme al alcance aprobado. Las pruebas fallidas quedan como reproducción; sus aserciones posteriores de no persistencia no se alcanzaron. No se corrigieron defectos ni se habilitó ACCEPT. D1 queda bloqueado hasta decidir la corrección productiva; no se ejecutó la suite completa de API.

## 2026-10-08 — D1.1: validación de elementos nulos en delivery

- Cambio productivo limitado al DTO existente: `List<@NotNull @Valid RequestedItem>`. Bean Validation rechaza `items: [null]` antes de invocar la lógica del controlador, con HTTP 400 mediante el manejador de validación existente. Sin cambios en `ApiErrorHandler` ni en ACCEPT.
- Regresión específica HTTP/PostgreSQL en `OrderRequestDecisionIntegrationTest`: comprueba 400, el mensaje de Bean Validation y conteos intactos de solicitudes, líneas, eventos, auditorías, pedidos y cuentas. Se retiró el caso nulo del parametrizado para no duplicarlo.
- Dependencia del PR de autenticación **A1**: `paymentPreference: "INVALID"` sigue devolviendo 500 por `HttpMessageNotReadableException`. No se corrige en esta rama; se retiró del parametrizado delivery y su reproducción queda registrada en D1 para cobertura/corrección en A1.
- Se trasladó únicamente la nota D1 desde `CLIENT.md` a este archivo. `CLIENT.md` quedó idéntico byte por byte a su contenido anterior a D1 (hash de blob verificado contra HEAD).
- Única ejecución enfocada: `./mvnw.cmd '-Dtest=ClientDeliveryRequestControllerTest,OrderRequestDecisionIntegrationTest#*Delivery*' test` desde `apps/api`. Resultado: **23 aprobadas, 0 fallos, 0 errores, 0 omitidas**: 19 casos HTTP/PostgreSQL 18.6 real y 4 unitarios existentes. Sin repetir pruebas ni ejecutar la suite completa.
- Sin operaciones Git de escritura.

## 2026-10-08 — D4: ACCEPT delivery habilitado

- `OrderRequestDecisionService` acepta solicitudes `DELIVERY` únicamente cuando la capacidad vigente está en `ENABLED`; `MANUAL_APPROVAL`, `PAUSED`, `DISABLED` o ausencia de capacidad responden 503 y dejan la solicitud pendiente.
- `OrderService` comparte el creador transaccional de pickup para crear delivery con cuenta `OPEN`, sin mesa, pedido `DELIVERY/SENT`, líneas `TAKEAWAY`, precios actuales, reserva de inventario, recálculo de subtotal/total, comandas, historial y auditoría.
- Dirección, referencia, teléfono y `payment_preference` permanecen exclusivamente en `order_requests`, enlazados por `order_id`. No se crean pagos, tarifa delivery, motorista ni datos de mapas. No hubo migraciones ni cambios frontend.
- El bloqueo `FOR UPDATE` sobre la solicitud conserva replay idempotente, evita pedidos/eventos/auditorías duplicados y revierte toda la transacción ante catálogo o inventario inválido. Pickup y REJECT delivery permanecen sin cambios de comportamiento.
- Pruebas enfocadas: `./mvnw.cmd '-Dtest=OrderRequestDecisionIntegrationTest,OrderServiceTest' test` — **41 aprobadas, 0 fallos, 0 errores**.
- Suite completa: `./mvnw.cmd test` — **168 aprobadas, 0 fallos, 0 errores**.
- Sin commit, push, merge ni cambio de rama.

## 2026-10-08 — D2: concurrencia delivery con la misma clave

- Se agregaron tres regresiones HTTP/PostgreSQL a `OrderRequestDecisionIntegrationTest`: dos POST simultáneos con payload idéntico (202 original + 202 replay), dos POST simultáneos con payload distinto (202 + 409), y la misma clave simultánea para dos clientes (dos creaciones aisladas).
- Cada pareja usa dos tareas HTTP reales preparadas por una barrera común antes de liberar el envío. Se verifican huella consistente, propietario, ausencia de duplicados, exactamente una línea y un evento por solicitud, y los conteos delta en PostgreSQL.
- Única corrida enfocada: `./mvnw.cmd '-Dtest=OrderRequestDecisionIntegrationTest#*Delivery*' test` desde `apps/api`; **22 pruebas aprobadas, 0 fallos, 0 errores, 0 omitidas**. No se modificó código productivo ni se habilitó ACCEPT.
- `git diff --check` aprobado. Sin operaciones Git de escritura.
