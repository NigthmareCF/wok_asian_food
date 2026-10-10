# Progreso de API backend

## 2026-10-09 — PR35-U2: consolidación de bandeja operativa con contrato canónico de PR39

- `OperationalOrderRequestController.java` y `OperationalOrderRequestQuery`: unificación del DTO en la estructura canónica `OrderRequestSummary` (`requestId`, `status`, `fulfillmentType`, `requestedFor`, `submittedAt`, `customerName`, `customerEmail`, `customerNote`, `subtotal`, `currency`, `orderId`, `orderStatus`, e `items` snapshot). Eliminados los DTOs redundantes (`Summary`, `Details`, `Line`) y campos no expuestos por el contrato canónico.
- Se mantuvieron los filtros `status` y `type` en `GET /api/v1/operational/order-requests` y la consulta del detalle `GET /api/v1/operational/order-requests/{requestId}`, respondiendo con el mismo DTO canónico bajo la autoridad `orders:manage`.
- Pruebas `OrderRequestQueryIntegrationTest` (2 pruebas HTTP/PostgreSQL) actualizadas y verificadas con 0 fallos.

## 2026-10-09 — PR35-U1: cancelación Delivery e idempotencia de huella histórica de pedidos

- `ClientPickupRequestController.java`: se eliminó el filtro `fulfillment_type = 'PICKUP'` de la consulta bloqueada (`FOR UPDATE`) y de la actualización en `cancel(...)`. La cancelación de solicitudes del Cliente (`DELETE /api/v1/client/order-requests/{requestId}`) vuelve a ser compatible con solicitudes de tipo `PICKUP` y `DELIVERY`, manteniendo la validación estricta del propietario (`customer_user_id`), estado cancelable (`PENDING_REVIEW`), respuesta neutral `404` ante recursos no pertenecientes al cliente o inexistentes y `409` para estados no cancelables. Sin rutas HTTP nuevas.
- `OperationalOrderController.java`: la huella de creación de pedidos en cuentas operativas reevalúa tanto la huella moderna (que incluye `accountId`) como la huella legada (sin `accountId`). Para solicitudes históricas sin `accountId` en su fingerprint, los reintentos (replay) se aceptan si coincide el fingerprint legado y la cuenta del pedido coincide con `accountId`. Solicitudes con diferente payload o cuentas en conflicto responden HTTP `409`.
- Pruebas Java unitarias e integraciones HTTP/PostgreSQL: `ClientPickupCancellationIntegrationTest` (4 pruebas), `OperationalFlowIntegrationTest` (8 pruebas) y `OrderServiceTest` (17 pruebas) aprobadas sin errores.

## 2026-10-07 — Smoke operativo tras E1.2

- .github/scripts/operational-flow-smoke.sh conserva el 409 al cerrar una mesa con saldo pendiente, registra el pago CASH mediante los contratos existentes y exige 200 con cuenta PAID y mesa CLEANING al reintentar el cierre.
- Este archivo requiere revisión de Fernando. El smoke conserva el 409 inicial, completa comandas y pedido antes del pago CASH, y verifica cuenta PAID y mesa CLEANING al cierre final.

## 2026-10-07 — E2.3: cola y detalle operativo de solicitudes

- `OperationalOrderRequestController` expone `GET /api/v1/operational/order-requests` y `GET /api/v1/operational/order-requests/{requestId}` con `orders:manage`. El listado admite filtros enum `status` y `type` (`PICKUP`/`DELIVERY`), orden estable por creación descendente y límite fijo de 50; el resumen omite identificador de Cliente, dirección/contacto, fingerprint y clave de idempotencia.
- El detalle devuelve la solicitud y líneas snapshot, con los datos delivery necesarios para revisión y `orderId` sólo cuando ya existe pedido. Solicitud y pedido permanecen separados; no se tocaron decisiones, ACCEPT delivery ni rutas Cliente.
- `OrderRequestQueryIntegrationTest`: 2 pruebas HTTP/PostgreSQL cubren pendientes pickup/delivery, filtros, orden, detalle, líneas, 403, 404 y ausencia de datos indebidos. Validación enfocada: 2 pruebas ejecutadas, 0 fallos, 0 errores y 0 omitidas. Sin migraciones ni cambios de smoke.

## 2026-10-07 — E3.3: regresiones HTTP/PostgreSQL de reservas

- `ReservationWorkflowIntegrationTest.java` cubre envío exitoso y replay con la misma `Idempotency-Key`, conflicto 409 por cambio de contenido o cliente, historial aislado por Cliente, cola pendiente para `OPERATIONAL`/`ADMIN` y 403 para `CLIENT`, versión obsoleta 409 sin mutación, y decisiones concurrentes `CONFIRM`/`REJECT` con una sola transición, historial y auditoría.
- La batería enfocada ejecutó 5 pruebas y la batería de reservas (incluyendo E3.1/E3.2 y regresiones existentes) ejecutó 19: 0 fallos, 0 errores y 0 omitidas. No hubo cambios de código productivo; la corrección aplicada fue únicamente una aserción del fixture para comparar el `reservationId` de la cola con su campo `id`.
- E1.1–E1.3 se conservan. Sin cambios de contratos, rutas, DTO, migraciones, frontend/BFF ni reglas financieras. Sin commit, push, merge ni cambio de rama.

## 2026-10-07 — E3.2: confirmación de reservas vencidas

- `ReservationReviewService.decide` carga `reservation_at` bajo el bloqueo de fila y rechaza `CONFIRM` cuando la hora ya ocurrió con `409`, antes de actualizar la reserva, historial o auditoría. `REJECT` conserva la transición para limpiar solicitudes vencidas; las confirmaciones futuras siguen permitidas.
- `ReservationDecisionIntegrationTest`: tres integraciones HTTP/PostgreSQL verifican confirmación vencida sin cambios, rechazo vencido con versión 2 e historial/auditoría, y confirmación futura. No se cambiaron cola, horarios, DTO ni asignaciones de mesas.
- Suite de reservas: 14 pruebas aprobadas con PostgreSQL/Docker, 0 fallos, errores u omisiones. El primer intento falló solo por el fixture usando `Instant` sin tipo JDBC explícito; se corrigió la prueba con `Timestamp`, sin cambios adicionales de producción. Sin commit, push, merge ni cambio de rama.

## 2026-10-07 — E3.1: capacidad de reservas al enviar

- `ReservationRequestService.submit` consulta la capacidad efectiva `RESERVATIONS` antes de evaluar o persistir. `ENABLED` es el estado habilitado equivalente al «activo» persistido; `PAUSED`, `DISABLED` o una capacidad ausente responden 503 con la semántica ya usada por delivery.
- `ReservationCapabilityIntegrationTest`: tres recorridos HTTP/PostgreSQL comprueban envío habilitado con evaluación, reserva `REQUESTED` e historial; `PAUSED` y `DISABLED` rechazan sin crear evaluación, reserva ni historial. La evaluación pública, DTO, rutas, horarios y capacidad no cambiaron.
- Verificación enfocada: 6 pruebas (3 integraciones PostgreSQL/Docker y 3 unitarias de capacidad), 0 fallos, errores u omisiones. Sin cambios de contrato ni otras reglas. Sin commit, push, merge ni cambio de rama.

## 2026-10-07 — E2.2: decisiones concurrentes de pickup

- `OrderRequestDecisionIntegrationTest`: dos regresiones HTTP/PostgreSQL para ACCEPT/ACCEPT y ACCEPT/REJECT sobre la misma solicitud. Un bloqueo de prueba retiene la fila hasta observar ambas transacciones HTTP esperando en PostgreSQL; luego permite que compitan.
- ACCEPT/ACCEPT exige dos respuestas 200, una efectiva y otra replay con el mismo pedido. ACCEPT/REJECT admite cualquiera de los ganadores y exige 200/409, una sola transición, cero o un pedido según el resultado y un único evento y auditoría de decisión coherentes con estado, motivo, actor y correlación ganadores.
- Suite enfocada: 7 integraciones ejecutadas con Docker/PostgreSQL, 0 fallos, errores u omisiones. `git diff --check` de los archivos modificados en esta etapa sin errores. No se demostró un defecto productivo ni se cambió código productivo o contratos; E2.1 y los avances E1 se conservan. Sin commit, push, merge ni cambio de rama.

## 2026-10-07 — E2.1: rechazo de delivery desde el recorrido real

- `OrderRequestDecisionIntegrationTest`: nueva integración HTTP/PostgreSQL crea solicitudes delivery de dos clientes mediante POST, rechaza una por Operativo y consulta ambos historiales. Verifica `REJECTED`, motivo y actor persistidos, evento único y replay sin modificaciones, ausencia de `orderId` y de nuevos pedidos, aislamiento de historiales y 404 en detalles ajenos.
- El mismo recorrido comprueba que `ACCEPT` delivery sigue respondiendo 422 sin modificar la solicitud ni sus eventos. Sin cambios de código productivo, contratos o migraciones; E1.1–E1.3 conservadas y E1.4 bloqueada.
- Verificación enfocada: 12 pruebas aprobadas (8 integraciones HTTP/PostgreSQL con Docker y 4 unitarias), 0 fallos, errores u omisiones. `git diff --check` de los archivos de esta etapa sin errores; el chequeo global conserva los espacios finales preexistentes en `docker-compose.yml`. Sin commit, push, merge ni cambio de rama.

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

## 2026-10-07 — E1.4: trazabilidad de propina en efectivo corregida

- V28 conserva las columnas existentes y reemplaza los índices únicos individuales por restricciones parciales únicas mínimas: `(payment_id, movement_type)` evita repetir SALE o propina, y `(request_id, tipo de traza)` permite el par venta/propina mientras mantiene la colisión de solicitudes para movimientos manuales, después de las migraciones financieras V26/V27.
- El movimiento `INCOME` de propina guarda el `payment_id` creado y el mismo `X-Request-Id` usado por el pago y el movimiento `SALE`; importes, signos, saldo y comportamiento financiero permanecen iguales.
- `PaymentIntegrationTest` y `database/tests/V28_cash_movement_traceability.sql`: PostgreSQL verifica ambos vínculos, rechaza SALE/TIP duplicados y conserva la colisión manual de `request_id`; el replay de la misma clave no duplica pago, venta ni propina. Prueba enfocada: 10 ejecutadas, 0 fallos, 0 errores y 0 omitidas; SQL directo aprobado desde V1–V28 en base limpia. E1.1–E1.3 conservadas; sin cambios de smoke, GET operativos, DTO ni rutas.

## 2026-10-06 — E1.3: cancelación exclusiva de pickup

- `ClientPickupRequestController.java`: la consulta bloqueada y la actualización de cancelación exigen propietario y `fulfillment_type = 'PICKUP'`. Delivery propio, solicitudes ajenas e inexistentes responden 404 sin modificaciones ni eventos; pickup conserva cancelación e idempotencia.
- `ClientPickupCancellationIntegrationTest.java`: tres regresiones HTTP/PostgreSQL verifican cancelación/replay, aislamiento de delivery y ocultación de solicitudes ajenas o inexistentes, comparando filas y eventos antes/después.
- Verificación enfocada: 7 pruebas unitarias existentes y 3 integraciones aprobadas, sin fallos, errores u omisiones; `git diff --check` sin errores. E1.1 y E1.2 conservados; sin cambios de endpoints, DTO, migraciones, frontend/BFF ni reglas de delivery. Esta corrección sustituye la nota histórica que describía la cancelación como compartida entre tipos.

## 2026-10-06 — E1.2: bloqueo de cierre de mesa con saldo pendiente

- `OperationalTableController.java`: valida cada cuenta vinculada bajo bloqueo transaccional antes de cerrar cuentas o mesa. Usa la regla financiera existente sobre datos persistidos: total de pedidos no cancelados menos pagos `CAPTURED`, sin descontar propinas. Un saldo positivo responde 409; se conserva el bloqueo por pedidos abiertos.
- Regresiones en `TableServiceTest`, `PaymentIntegrationTest` y `OperationalFlowIntegrationTest`: cuenta pendiente bloquea sin cambios parciales incluso junto a otra pagada; pago completo permite cerrar; pedido abierto sigue bloqueado. El flujo antiguo registra el pago antes del cierre.
- Verificación enfocada: 9 pruebas unitarias y 5 de integración HTTP/PostgreSQL aprobadas; 0 fallos, errores u omisiones. `git diff --check` sin errores. Cambios E1.1 conservados; sin cambios de contratos, migraciones ni frontend/BFF.

## 2026-10-06 — E1.1: idempotencia de creación de pedidos por cuenta

- `OperationalOrderController.java`: la huella de creación incluye `accountId`; la misma clave y contenido con otra cuenta responde 409, mientras que un reintento idéntico conserva el replay.
- `OrderServiceTest.java` y `OperationalFlowIntegrationTest.java`: regresión unitaria y HTTP/PostgreSQL para cambio exclusivo de cuenta, sin reutilizar el pedido previo ni crear otro pedido.
- Verificación enfocada: 14 pruebas unitarias y 1 de integración aprobadas, sin fallos, errores ni omisiones; `git diff --check` sin errores. Maven 3.9.11 local y Java 23 (compilación release 21); el wrapper no inició por un error de PowerShell. No hay formateador Java configurado.
- Sin cambios de DTO, rutas, migraciones, frontend/BFF ni otras reglas. Sin commit, push, merge ni cambio de rama.

## 2026-09-30 — Delivery request details

- Added owner-scoped `GET /api/v1/client/delivery-requests/{requestId}`. It first queries a delivery request by both ID and authenticated customer ID, then reads only item snapshots; pickup IDs and other customers' requests return the same 404.
- The DTO returns state, requested time, subtotal/currency, payment preference, customer note, and immutable item name/quantity/unit/line totals. It does not expose delivery address/contact data or imply order acceptance/payment.
- Added focused controller tests for owner-scope rejection before line lookup and snapshot detail mapping. Maven 3.9.11 was run against a fresh temporary composite containing this branch's API sources and the backend foundation/auth/reservation sources; 41 tests passed, 0 failures/errors/skips. This is a unit-test composite, not an HTTP/PostgreSQL E2E test; the V11 runtime schema and real auth wiring still require integrated validation.

## 2026-09-30 — Customer delivery request

- Added `POST /api/v1/client/delivery-requests` for CLIENT sessions, with address, optional reference, contact phone, requested time, menu items, and a payment preference. Server recalculates item prices/subtotal, validates menu eligibility and prep lead time, checks DELIVERY service state, and uses per-customer idempotency with a request fingerprint.
- Added owner-filtered `GET /api/v1/client/delivery-requests`. The pickup history/details queries now filter `fulfillment_type='PICKUP'` so delivery requests cannot be mislabeled as pickup. Cancellation continues through the shared owner-scoped order request endpoint while the row is `PENDING_REVIEW`.
- All submissions stay `202 PENDING_REVIEW`; this slice does not accept an order, calculate coverage/route fee, reserve stock, charge, or expose payment credentials. `ONLINE_PAYMENT_REQUESTED` records preference only. Depends on V11 in `feature/database-migrations`; PII retention policy remains open.
- Java 21 composite with foundation/auth/reservations/availability/API/messaging and V1–V11 passed 41/41 tests, including successful repricing, paused-service rejection, and ownership/cancellation/messaging regressions. The composite is for verification only; branches remain separate.
