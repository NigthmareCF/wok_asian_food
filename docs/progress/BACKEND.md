# Progreso de planificación backend

## 2026-10-08 — Suite backend completa tras cancelación parcial y pool FEL

- Reejecuté la suite completa del HEAD `1eb6797` con Java 21, PostgreSQL 18/Testcontainers y Flyway V1–V50: 273/273 pruebas, cero fallos, errores u omitidas. Incluye la comprobación de que el draft de factura después de cancelar una línea conserva sólo el consumo activo.
- La rama `feature/backend-capacity-order-lifecycle` estaba alineada con su remoto antes de esta verificación; no cambió código backend en esta corrida. No se hizo merge a `development`.

## 2026-10-07 — Cancelación auditable de líneas y merma tras inicio de cocina

- `POST /api/v1/operational/orders/{orderId}/items/{orderItemId}/cancellations` permite cancelar una línea individual idempotentemente sólo mientras el pedido siga `SENT`, la comanda permanezca `QUEUED`, la línea conserve snapshot de recursos y no existan pagos cobrados, intents pendientes ni facturas preparadas. Requiere versiones esperadas de pedido y línea, motivo e `Idempotency-Key`.
- V50 guarda estado/cancelación de la línea, reservas por línea calculadas al aceptar y evento auditable con impacto GTQ, actor, motivo, recursos y snapshot de cocina. Al cancelar libera sólo la reserva correspondiente, marca la línea de histórico y recalcula totales desde líneas activas. Detalles conservan líneas canceladas; conteos de operativa y pool de facturación excluyen líneas canceladas.
- La cancelación completa posterior al inicio de cocina registra los recursos reservados como movimiento `WASTE` y descuenta existencia; antes del inicio sigue liberando la reserva. Pedidos históricos sin snapshots no admiten ajuste parcial automático y requieren revisión humana. Reembolsos/ajustes de líneas ya cobradas siguen pendientes.
- `InventoryOrderIntegrationTest`: 6/6 aprobadas con PostgreSQL 18/Testcontainers, Flyway V1–V50; verifica release por línea, historial, replay, conflicto al reutilizar la clave con otro motivo, rechazo al cancelar la última línea, pool FEL sólo con consumo activo y merma al cancelar el pedido después de iniciar cocina. Suite completa antes de estas aserciones: 273/273; focal actual: 6/6, sin fallos ni omitidas.

## 2026-10-07 — Modificadores en pedidos operativos y detalle útil para KDS

- Los pedidos de salón y los productos agregados a una cuenta aceptan `modifierIds`; backend valida compatibilidad y selecciones obligatorias contra catálogo vigente, calcula el precio unitario, persiste snapshots en `order_item_modifiers` y devuelve opciones estructuradas en los detalles del pedido. Las opciones también forman parte del fingerprint idempotente.
- El KDS entrega líneas concretas de la comanda con cantidad, servicio, notas y modificadores; las acciones de ticket devuelven la misma carga. El flujo pickup/delivery reutiliza las opciones ya guardadas en la solicitud, evitando duplicar snapshots al aceptar.
- Modificadores con impactos de inventario se agregan a la reserva del pedido sobre las líneas recién insertadas; opciones remotas continúan aplicando su snapshot tras la aceptación. No se añadió migración porque V35 ya persiste snapshots de modificadores.
- `OperationalFlowIntegrationTest`, `OrderRequestDecisionIntegrationTest` y `OrderServiceTest`: 41/41 aprobadas con PostgreSQL 18/Testcontainers y Flyway V1–V49. Suite backend completa: 270/270, cero fallos/errores/omitidas.

## 2026-10-08 — Jarabe simple registrado como componente preliminar de matcha

- El seed de desarrollo añade `ING_SIMPLE_SYRUP` en ML y 2 oz líquidas por cada bebida matcha y carbonatada. La unidad se convierte a 59.14706 ml; las pulpas de carbonatada se mantienen asociadas al sabor sin activar consumo.
- La receta de producción de `JARABE_SIMPLE` sigue pendiente porque el rendimiento final de la tanda 1:1 por peso no se ha medido. Los productos siguen `PENDING_DATA` y no se generan reservas ni consumos automáticos.
- `RealMenuSeedIntegrationTest`: 1/1 aprobada con PostgreSQL 18 y migraciones V1–V49; valida 20 componentes preliminares, cinco consumos de jarabe y ausencia de receta activa/saldo.

## 2026-10-08 — Rechazo de importes de pago fuera de precisión GTQ

- Capturar pagos ahora normaliza/rechaza montos de principal y propina con más de dos decimales antes de reclamar idempotencia o escribir datos; también rechaza magnitudes fuera de NUMERIC(14,2). Así no se reporta un importe distinto del persistido por redondeo implícito de PostgreSQL.
- El helper monetario compartido también protege los reembolsos contra desbordamiento numérico, además de ya rechazar precisión fraccionaria excesiva.
- `PaymentIntegrationTest.rejectsPaymentAndTipAmountsThatPostgresWouldRoundOrCannotRepresent` cubre principal Q1.005, propina Q0.001 y monto demasiado grande, comprobando 422 y ausencia de pagos persistidos. Focal: 13/13; suite completa: 269/269, cero fallos/errores/omitidas, PostgreSQL 18/Testcontainers y Flyway V1–V49.

## 2026-10-07 — Holds temporales de carga para pedidos remotos

- V48 persiste holds por solicitud y distribución de preparación por estación con expiración configurable (12 minutos por defecto). El consumo del quote y el hold ocurren en la misma transacción; la cancelación/rechazo libera, aceptación convierte antes de crear tickets, y el worker expira holds vencidos sin aceptar automáticamente la solicitud.
- Las cotizaciones sólo suman holds activos anteriores/iguales del mismo día Guatemala; los pedidos internos sin horario no quedan detrás de solicitudes remotas. Stock sigue sin reservarse y la revisión operativa conserva la última palabra.
- Pruebas focalizadas: `ClientOrderQuoteIntegrationTest` 6/6 y `KitchenQueueEstimatorTest` 1/1, PostgreSQL 18/Testcontainers, Flyway V1–V48 desde cero. Incluyen quote→hold, liberación, conversión, expiración y estado PENDING_REVIEW.
- Suite backend completa: 260/260, cero fallos/errores/omitidas. Móvil en su rama especializada: 59/59 Vitest, ESLint, TypeScript y export Android.

## 2026-10-07 — Seed del menú al iniciar entorno de desarrollo

- La API ejecuta `database/seeds/menu_real_dev.sql` después de Flyway sólo cuando `WOK_CATALOG_SEED_ENABLED=true`; el archivo es configurable. Compose monta el seed sin incluirlo en las migraciones, y `.env.example` de desarrollo lo habilita. El SQL es idempotente y conserva `PENDING_DATA`, sin inventar BOM ni activar consumo de inventario.
- `RealMenuSeedIntegrationTest` inicia con la opción habilitada y prueba desde PostgreSQL limpio que 31 productos aparecen antes de ejecutar el seed manual repetido; las verificaciones existentes confirman precios, extras, áreas, +18, stock y lectura pública. Focal: 1/1, Flyway V1–V48.

## 2026-10-07 — Grupos grandes de reserva pasan a revisión humana

- Retiré los límites fijos de 50 personas de evaluación pública, envío Cliente y snapshot persistido (`V44__allow_large_reservation_groups.sql`). Grupos desde 13 reciben `REQUIRES_HUMAN_APPROVAL`; no se convierten en aceptación automática. La estancia usa el rango especial actual 180–240 minutos, todavía sujeto a calibración con datos reales.
- La prueba de reserva ahora envía un grupo de 60, guarda party size y preorden de 51, y confirma que la evaluación pide revisión humana; no descuenta inventario ni crea un pedido. Prueba focal 1/1 con PostgreSQL 18/Testcontainers y Flyway V1–V44. Suite completa: 248/248, sin fallos/errores/omitidas.


## 2026-10-07 — Cantidades bulk sujetas a capacidad, no a un tope fijo

- La disponibilidad pública ya no limita cada SKU a 50 unidades. `V43__allow_bulk_order_line_quantities.sql` sustituye los checks `1..50` de solicitudes pickup/delivery y snapshots de preorden por `quantity > 0`; la capa HTTP de preorden también admite cantidades mayores. El snapshot de reserva sigue siendo intención: no reserva inventario.
- Pruebas PostgreSQL aceptan un pedido de 51 unidades cuando hay 60 en stock y la ETA cabe; además, el caso anterior confirma que 2 SKU de seis unidades que comparten un insumo de stock 10 quedan no disponibles y no se aceptan. La prueba de reserva conserva 51 unidades en snapshot sin consumir ni reservar inventario. Suite completa: 248/248, sin fallos/errores/omitidas, PostgreSQL 18/Testcontainers y Flyway V1–V43.


## 2026-10-07 — Prueba adversarial de inventario compartido entre SKU

- Se agregó una prueba de integración que prepara dos productos, cada uno con un modificador que consume el mismo recurso. Cada SKU pasa por separado con cantidad 6 y stock 10; el carrito combinado requiere 12 y el endpoint de disponibilidad lo marca no disponible.
- Aunque la solicitud quede pendiente para revisión humana, la aceptación vuelve a aplicar la reserva agregada; el caso devuelve 409 y verifica rollback de pedido, estado y reservas. Validación focal con PostgreSQL 18/Testcontainers y Flyway V1–V42: 1/1. Suite completa: 247/247, sin fallos/errores/omitidas.


## 2026-10-07 — Efectivo de delivery en custodia del repartidor

- Los pagos en efectivo contra entrega pueden registrar el cobro contra el repartidor asignado al despacho activo. La cuenta del cliente queda pagada, pero no se crea movimiento de caja hasta que el efectivo llegue físicamente al restaurante.
- `GET /api/v1/operational/courier-cash/pending` lista la cartera pendiente para `cash:manage`; `POST /api/v1/operational/courier-cash/{collectionId}/settle` la deposita en una sesión abierta con idempotencia y auditoría. Venta y propina se registran en movimientos separados.
- `V42__courier_cash_collections.sql` agrega la custodia y el permiso. La prueba de integración verifica rechazo de un courier no asignado, saldo de caja sin variación antes de liquidar, depósito exacto de venta/propina e idempotencia. Suite completa: 246/246, sin fallos/errores/omitidas, PostgreSQL 18/Testcontainers y Flyway V1–V42.


## 2026-10-07 — Excepciones del calendario aplicadas a reservas

- `JdbcOperatingHoursProvider` prioriza el override activo de `DINE_IN`, luego el de `RESTAURANT`, y sólo si no hay ninguno consulta el calendario semanal. Una excepción cerrada gana sobre el horario semanal, tanto en evaluación pública como en la revisión operativa.
- `CONFIRM` vuelve a validar anticipación y calendario efectivo bajo locks advisory por fecha/semana y locks compartidos de las filas de horario existentes. Admin toma las mismas llaves al insertar/actualizar semana u override; una modificación concurrente no puede cerrarse entre la validación y la confirmación.
- Pruebas PostgreSQL nuevas cubren cierre diario en evaluación pública y bloqueo de confirmación por cierre excepcional. Suite completa: 243/243, 0 fallos/errores/omitidas, PostgreSQL 18/Testcontainers, Flyway V1–V41.

## 2026-10-07 — Calendario pickup/delivery y excepciones diarias

- `V40__pickup_delivery_service_hours.sql` provisiona pickup martes–domingo 14:00–21:30 y delivery 14:00–21:00 en `America/Guatemala`, usando las referencias operativas vigentes. `ServiceHoursPolicy` valida el slot en el endpoint Cliente y lo vuelve a validar bajo lock en aceptación, junto con la cola de cocina.
- `V41__business_hours_daily_overrides.sql` agrega excepciones fechadas, cierre excepcional, motivo, actor, versión optimista y expiración a medianoche local. Admin puede listarlas/crearlas/actualizarlas con `hours:manage` y auditoría; `GET /api/v1/public/service-hours` entrega hasta 31 días para web/app. Excepciones activas sustituyen la ventana semanal; al expirar, aplica la semana normal.
- La aceptación toma lock transaccional por servicio/fecha para serializarse también con la creación concurrente de una excepción, además del lock compartido sobre filas efectivas. Esto cubre el caso sin fila de override, donde un `FOR SHARE` por sí solo no bloquearía inserciones concurrentes.
- Las pruebas legacy de ciclo de pedido/cobro fijan explícitamente un horario amplio para que sus fixtures no dependan de la hora real; restauran el horario de negocio al terminar. Las pruebas de calendario verifican por separado los límites reales.
- Pruebas PostgreSQL focales: 35/35, 0 fallos/errores/omitidas. Suite backend completa: 241/241, 0 fallos/errores/omitidas; Testcontainers PostgreSQL 18 aplicó Flyway V1–V41 desde esquema vacío.

## 2026-10-07 — Pausa de servicio aplicada a solicitudes pickup

- Pickup ahora consulta su capability persistida antes de crear una solicitud; `PAUSED`, `DISABLED` o ausencia de estado responde 503. `ENABLED` y `MANUAL_APPROVAL` siguen aceptando solicitudes para revisión humana. Igual que delivery, la consulta toma `FOR SHARE` hasta terminar la transacción, por lo que un cambio concurrente de Admin se serializa antes o después del envío.
- El replay idempotente existente se resuelve antes del gate: una pausa no vuelve imposible recuperar la respuesta de una solicitud que ya fue aceptada. Delivery mantiene la misma semántica y ahora también retiene el lock compartido hasta commit.
- `OrderRequestDecisionIntegrationTest` prueba pausa, no persistencia de solicitud nueva y replay del original; las pruebas focales de solicitudes y controladores suman 27/27 con PostgreSQL 18/Testcontainers y Flyway V1–V39.
- Suite backend completa: `bash ./mvnw -q test`, 236/236 pruebas, 0 fallos, 0 errores y 0 omitidas; PostgreSQL 18/Testcontainers con Flyway V1–V39.

## 2026-10-07 — Aceptación de solicitudes contra cola activa de cocina

- `KitchenQueueEstimator` estima el tiempo por estación como la cola activa (máxima hora estimada de los tickets `QUEUED`/`PREPARING`) más el trabajo nuevo agregado y ponderado por cantidad. Al asignar trabajo bloquea las áreas de preparación en orden estable para serializar aceptaciones concurrentes y evitar que ambas reserven el mismo intervalo de capacidad.
- La aceptación Operativa de pickup/delivery vuelve a validar el ETA contra el horario pedido en el punto común de encolado, después de reservar inventario y bajo el mismo lock de estación. Esto conserva el orden de locks de todos los flujos; si la hora ya no cabe, devuelve 422 y la transacción revierte también pedido y reservas. La creación de tickets usa la misma estimación para fijar `estimated_ready_at`.
- `OrderServiceTest` verifica el ETA nuevo; `OrderRequestDecisionIntegrationTest` comprueba el rechazo PostgreSQL real cuando un pedido previo en la misma estación desplaza la cola más allá de la hora solicitada. Pruebas focales: 25 ejecutadas, 0 fallos/errores/omitidas con PostgreSQL 18/Testcontainers y Flyway V1–V39.
- `bash ./mvnw -q test`: 235/235 pruebas, 0 fallos, 0 errores y 0 omitidas con Testcontainers activo, PostgreSQL 18 y Flyway V1–V39 desde esquema vacío.

## 2026-10-06 — Áreas de preparación canónicas del menú

- El seed real del menú ahora usa `COCINA_FRIA` para Sushi, `COCINA_CALIENTE` para Especialidades y `BARRA` para Bebidas y Bebidas +18, conforme al cierre de alcance vigente.
- El seed reconcilia los alias anteriores (`SUSHI_BAR`, `HOT_KITCHEN`, `BAR`) de forma idempotente: renombra el alias si no existe el área canónica; si ambas existen, mueve las referencias de menú y desactiva el alias. No modifica migraciones ya publicadas ni cambia recetas/stock.
- `RealMenuSeedIntegrationTest` también crea deliberadamente el caso de alias duplicado y verifica las 31 asignaciones, la consolidación y la repetición del seed.
- Validación con PostgreSQL 18/Testcontainers y Flyway V1–V39: `RealMenuSeedIntegrationTest` 1/1, 0 fallos, 0 errores, 0 omitidas.
- Se retiraron las cámaras del backlog LATER actual; `DEFERRED_CAMERA_INTEGRATION` queda como nota futura no bloqueante en el plan. El proveedor IA, gateway bancario, certificador FEL, proveedor email y dominio continúan como decisiones externas pendientes, no como motivo para detener slices independientes.

## 2026-10-05 — Reporte diario administrativo de ventas

- Se añadió `GET /api/v1/admin/reports/sales/daily?from={date}&to={date}`, exclusivo de ADMIN y limitado a 31 días. Agrupa por día local `America/Guatemala` y moneda, sin sumar monedas distintas; separa venta capturada, reembolso, neto, propina y devolución de propina. Los reembolsos aparecen el día en que se registraron y los pagos voided no cuentan como ventas.
- Reutiliza pagos/reembolsos persistidos existentes; no agrega tablas ni migración. `AdminSalesReportIntegrationTest` cubre día de negocio alrededor de medianoche GT, netos, período inválido y denegación a Operativo.
- Verificado contra PostgreSQL 18/Testcontainers y Flyway V1–V38: `AdminSalesReportIntegrationTest` 2/2, incluida autorización ADMIN-only y cruce de medianoche Guatemala. Al compartir la base efímera entre clases, los datos del caso se fijan en fecha histórica para aislar el agregado de transacciones de la fecha actual. En el mismo proceso, `ClientOrderChangeRequestIntegrationTest` 3/3 valida replay idempotente. Suite completa: 227/227, 0 fallos/errores/omitidas, con Testcontainers activo.
- El rango también rechaza fechas futuras y extremos de fecha inválidos antes de convertir zona horaria; prueba focal PostgreSQL vuelve a pasar 2/2.

## 2026-10-05 — Decisión Operativa idempotente para solicitudes de cancelación

- `PATCH /api/v1/operational/order-change-requests/{changeRequestId}` ahora requiere `Idempotency-Key`. El hash contempla la solicitud, decisión, versión esperada y motivo: reutilizar la clave con otro contenido produce conflicto; reintentar la misma decisión devuelve el recibo ya persistido y no vuelve a cancelar ni duplica eventos.
- La clave se reclama y completa dentro de la misma transacción que la decisión y su auditoría; cualquier validación fallida revierte también el claim, permitiendo corregir y reintentar.
- Se amplió `ClientOrderChangeRequestIntegrationTest` para cubrir replay tras aprobación, estado final/versionado y ausencia de una segunda transición de pedido. Compatibilidad de prueba se mantiene con un helper de PATCH que admite headers.
- `bash ./mvnw -q -DargLine='-javaagent:/home/fer-cachy/.m2/repository/net/bytebuddy/byte-buddy-agent/1.18.11/byte-buddy-agent-1.18.11.jar' test`: 225 pruebas, 0 fallos, 0 errores, 96 omitidas por falta de acceso al socket de Docker en este entorno (Testcontainers/PostgreSQL, incluida la nueva prueba de integración). El primer intento sin javaagent falló al autoinyectar Mockito; el comando documentado con javaagent pasa.

## 2026-10-05 — Preorden real en solicitudes de reserva

- `POST /api/v1/client/reservations` acepta hasta 20 productos publicados, cantidad y modificadores; valida nuevamente estado, visibilidad y reglas de opciones en servidor, y calcula el precio unitario autoritativo.
- V38 conserva snapshots de producto/opciones asociados a la evaluación idempotente. Cliente los consulta en su historial y Operativo en `GET /api/v1/operational/reservations/schedule` para solicitudes que crearon reserva pendiente.
- Son solicitudes para revisión: no crean pedidos ni reservan inventario. Los reintentos conservan snapshots originales incluso si el catálogo cambia; cambiar el payload con la misma clave responde 409.
- `ConfiguredReservationHoursIntegrationTest` cubre monto, modificadores, consulta operativa, replay, rechazo de clave con payload diferente y ausencia de pedido/stock reservado. Suite completa: 225/225, 0 fallos/errores/omitidas; PostgreSQL 18 + Flyway V1–V38 desde esquema vacío.

## 2026-10-05 — Agenda Operativa de reservas con mesas

- `GET /api/v1/operational/reservations/schedule?from={instant}&to={instant}&status={REQUESTED|CONFIRMED|ARRIVED}` devuelve reservas del intervalo, ordenadas por hora, con datos de contacto para atención Operativa y las asignaciones activas (nombre, zona, capacidad e intervalo ocupado). Requiere rol OPERATIONAL o ADMIN; limita la ventana a 31 días y no incluye estados terminales.
- Permite que el equipo encuentre reservas confirmadas y vea sus mesas tras las operaciones de asignación/liberación (`383447b`, `f0d083e`). No añade migración ni altera los estados de reserva.
- `ReservationTableAssignmentIntegrationTest`: 5/5 con PostgreSQL 18/Testcontainers, incluyendo agenda agrupada, asignaciones múltiples, autorización CLIENT denegada y rango invertido. Suite completa: 219/219, 0 fallos, 0 errores, 0 omitidas; Flyway V1–V37 desde esquema vacío.
- El endpoint enlaza `Instant` como `Timestamp` JDBC para evitar que PostgreSQL reciba objetos `Instant` sin tipo SQL inferible. No se modificó la política existente de registro de excepciones.

## 2026-10-05 — Asignación operativa de mesas para reservas

- `POST /api/v1/operational/reservations/{reservationId}/table-assignments` permite al personal con `tables:manage` asignar una o varias mesas a una reserva confirmada o que ya llegó. Requiere `Idempotency-Key`, motivo y `expectedVersion`; bloquea reserva y mesas en orden estable, valida zona/estado/capacidad y registra auditoría.
- `POST /api/v1/operational/reservations/{reservationId}/table-assignments/release` libera todas las mesas de una reserva confirmada antes de su hora. También exige clave idempotente, versión y motivo; incrementa versión, audita IDs/actor/instante y permite reutilizar la mesa en el periodo liberado.
- La ocupación se toma del intervalo estimado de la reserva más 20 minutos de tolerancia. La exclusión GiST existente impide solapamientos de mesa en PostgreSQL; conflictos producen 409 y la transacción no deja asignaciones parciales. Reintentos idénticos devuelven el recibo sin duplicar filas ni auditoría.
- `ReservationTableAssignmentIntegrationTest`: 4/4 con PostgreSQL 18/Testcontainers; cubre asignación múltiple y replay, capacidad insuficiente, conflicto de horario/rollback, liberación idempotente y reutilización posterior. Suite completa: 218 pruebas, 0 fallos, 0 errores, 0 omitidas; Flyway V1–V37 desde esquema vacío. Comando: `bash ./mvnw -q -DargLine='-javaagent:/home/fer-cachy/.m2/repository/net/bytebuddy/byte-buddy-agent/1.18.11/byte-buddy-agent-1.18.11.jar' test`.
- La consulta de auditoría tipa explícitamente los valores de timestamp e integer dentro de `jsonb_build_object`, requerido por PostgreSQL para inferir los parámetros JDBC.
- Límite actual: liberación sólo para reservas confirmadas que aún no comenzaron. La gestión de ocupación de reservas en curso continúa en la vista operativa de mesas.

## 2026-10-05 — Estimación pública de disponibilidad de menú

- `POST /api/v1/public/menu/availability` estima disponibilidad por carrito (máximo 20 productos, 50 unidades por producto), usando receta, impactos de opciones elegidas y reservas activas dentro de una transacción `REPEATABLE_READ`. La respuesta distingue `AVAILABLE_ESTIMATE`, `UNAVAILABLE_ESTIMATE` y `NOT_TRACKED`, no revela cantidades internas y nunca crea/libera reservas.
- Sólo esta ruta POST queda pública; las selecciones vuelven a validarse contra el catálogo y productos no publicados se rechazan. La aceptación de pickup/delivery sigue comprobando stock bajo locks.
- `PublicMenuAvailabilityIntegrationTest` 1/1 y suite completa PostgreSQL 18/Testcontainers + Flyway V1–V35 201/201 aprobadas, sin fallos, errores ni omitidas. Cubre recetas, reserva activa previa, impacto positivo/negativo, producto sin seguimiento, opciones inválidas, no filtración de cantidades y ausencia de escrituras de reserva.

## 2026-10-05 — Impactos de inventario para modificadores

- ADMIN reemplaza atómicamente los impactos por opción (`PUT .../inventory-impacts`), con permiso, versión optimista, motivo/auditoría, bloqueo del grupo/opción/insumos y validación de insumo activo con tracking, unicidad y delta no cero. La consulta administrativa devuelve el detalle configurado.
- Pruebas PostgreSQL verifican persistencia/versionado/auditoría y que el impacto positivo (0.25 × cantidad 2) crea una reserva de inventario 0.5 al aceptar la solicitud. Sin stock suficiente, la aceptación devuelve 409, no crea orden y mantiene la solicitud pendiente. `AdminCatalogIntegrationTest` 3/3, `OrderRequestDecisionIntegrationTest` 10/10; suite completa 200/200, Flyway V1–V35.
- Sin migración nueva: utiliza `modifier_item_impacts` existente. Falta reflejar disponibilidad vigente al consultar el catálogo público.

## 2026-10-05 — Administración segura de grupos y opciones del catálogo

- `/api/v1/admin/catalog/modifier-groups` permite consultar, crear y versionar grupos. Sus opciones se pueden crear/actualizar (incluyendo desactivación lógica) y los grupos se pueden vincular/reemplazar por producto usando versión optimista.
- Todas las rutas exigen `catalog:manage`, validan nombres/precios/límites, escriben auditoría con motivo y bloquean filas relevantes. No se puede desactivar la última opción activa que satisface un grupo requerido ni vincular un grupo requerido sin opciones suficientes. Las relaciones anteriores se sustituyen atómicamente.
- `AdminCatalogIntegrationTest` pasa 3/3 en PostgreSQL 18/Testcontainers, Flyway V1–V35, incluyendo lectura pública después del vínculo, 403 por rol, conflicto por versión obsoleta, auditoría y protección del mínimo requerido. Suite completa: 200 pruebas, 0 fallos, 0 errores, 0 omitidas. Falta completar CRUD de impactos de inventario y altas de menú/categorías.

## 2026-10-05 — Selección de opciones en solicitudes pickup/delivery

- `GET /api/v1/public/menu` publica los grupos de modificadores y opciones activas por platillo en una consulta agrupada. `ModifierSelectionService` valida en el servidor scope, unicidad, actividad y mínimos/máximos; el mismo servicio vuelve a validar al aceptar la solicitud.
- V35 agrega snapshots por renglón en solicitud y pedido. Pickup/delivery agregan deltas al precio autoritativo, incluyen opciones en fingerprint idempotente y exponen detalle propio con grupo/nombre/precio. Operaciones puede revisar la selección; al aceptar, se copia a `order_items`, el KDS recibe nombres en notas y se recalcula el total de la orden. Los impactos de disponibilidad configurados se suman/restan a reservas de receta bajo locks de balance ordenados.
- Prueba de integración PostgreSQL cubre menú público, selección obligatoria, precio, replay/conflicto idempotente, detalles Cliente/Operativo, copia al pedido y total recalculado. Flyway V1–V35 aplicó desde un esquema vacío; `OrderRequestDecisionIntegrationTest` pasa y la suite completa suma 199 pruebas, 0 fallos, 0 errores y 0 omitidas con Testcontainers/PostgreSQL 18 y Byte Buddy agent explícito.
- Pendiente de catálogo: CRUD administrativo de grupos/opciones, disponibilidad en la vista de selección, impacto complejo por recetas y menú real; no se inventaron datos productivos.

## 2026-10-04 — Validación server-side de teléfonos Guatemala

- Los contratos Cliente para perfil, dirección y solicitud delivery ahora aceptan sólo teléfonos GT con ocho dígitos agrupados en dos bloques de cuatro (`5555 0101`, con prefijo `+502` opcional). La validación ocurre al recibir la API antes de persistir; los valores guardados previamente no se reescriben.
- `GuatemalaPhoneValidationIntegrationTest` confirma rechazo de números incompletos/no agrupados, ausencia de persistencia y aceptación del formato válido en dirección; `GuatemalaPhoneTest` cubre variantes. Suite focal contra PostgreSQL 18/Testcontainers: 13/13 sin fallos.
- Suite backend completa tras el cambio: 192 pruebas, 0 fallos, 0 errores, 0 omitidas; Flyway V1–V33 aplicado a PostgreSQL 18/Testcontainers.
- Las constraints SQL preexistentes son históricamente más permisivas y no se migraron en este slice para evitar invalidar registros antiguos durante operaciones de otros estados.

## 2026-10-04 — Consulta del intento de pago online delivery

- `GET /api/v1/client/delivery-requests/{requestId}/payment-intents/current` permite recuperar el intento más reciente desde el backend. Comprueba ownership antes de responder; solicitud ajena da 404 y una solicitud propia sin intento da 204. No crea intentos ni pagos y nunca da el pedido por cobrado.
- La app Cliente usa esta lectura al actualizar su historial, así conserva el estado del cobro después de salir/entrar o reiniciar. Los datos de cada cliente siguen limitados por su sesión. El adaptador de pago continúa MOCK y PENDING.
- Verificación focal backend: `ClientPaymentIntentIntegrationTest` 2/2 contra PostgreSQL 18/Testcontainers + Flyway V1–V33; incluye recuperación, ausencia y aislamiento de propietario. Tras el cambio, la suite completa conserva 188/188 con 0 fallos/errores/omitidas. Validación móvil: Vitest 10/10, ESLint, TypeScript `--noEmit` y exports Expo Android/Web aprobados.

# 2026-10-04 — IA — gateway aislado con mock

- Se integró selectivamente la base de `origin/feature/ai` y se fortalecieron sus contratos: el broker sólo expone `getOpeningHours`/`getCurrentServiceStatus` en DTOs tipados; no acepta SQL ni recursos de clientes. Respuestas deterministas se calculan dentro del backend antes de llamar al proveedor.
- `/internal/ai/chat` y `/internal/ai/tools` requieren `X-WOK-AI-TOKEN` con secreto de 32+ caracteres; falta de configuración cierra con 503 y token inválido con 401. Nginx no reenvía `/internal`, y Docker Compose no publica el puerto API al host. `WOK_AI_MODE` queda en `disabled` por defecto; `mock` no representa runtime productivo.
- Se registra `AI_TOOL_EXECUTED` por invocación exitosa, con sólo nombre de herramienta y etiqueta del servicio. La guarda léxica bloquea consultas ajenas e intentos comunes de inyección en inglés/español; sigue siendo una protección inicial y requiere evaluación adversarial antes de activar un modelo real.
- Verificación focal con Java 21, Docker y PostgreSQL 18/Testcontainers: `AiGatewayTest` 4/4, `InternalAiControllerTest` 3/3, `AiToolBrokerIntegrationTest` 2/2; Flyway V1–V33 aplicado desde base vacía. Suite completa limpia: 188 pruebas, 0 fallos, 0 errores, 0 omitidas. La documentación de límites y trabajo productivo está en `docs/ai/ARCHITECTURE.md`.

## 2026-10-04 — Devoluciones manuales y reapertura de saldo

- Flyway V28 añade payment_refunds, conserva el cobro original y amplía los estados de pago a PARTIALLY_REFUNDED/REFUNDED. Se registra motivo, responsable, referencia, importes de venta/propina, sesión de caja y solicitud idempotente.
- POST /api/v1/operational/accounts/{accountId}/payments/{paymentId}/refunds valida ownership de cuenta-pago, saldo reembolsable, modalidad y referencia. Los reembolsos externos se etiquetan RECORDED_MANUALLY: no se simula una pasarela ni se afirma que ésta haya procesado la devolución.
- En efectivo, el movimiento REFUND reduce el esperado de caja y se refleja en desglose; cuenta ya pagada vuelve a OPEN cuando se genera saldo. Detalle de cuenta expone devoluciones netas de venta y propina. No se elimina ni reescribe el pago original.
- Verificación: PaymentIntegrationTest 11/11; bash mvnw -q clean test con PostgreSQL 18/Testcontainers y Flyway V1–V28: 158 pruebas, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-04 — Ciclo operativo de despacho delivery

- Flyway V27 añade `delivery_dispatches` y su historial de eventos, con constraints para estados, asignación de repartidor, salida, entrega e incidencias.
- Al aceptar una solicitud delivery se crea despacho `AWAITING_KITCHEN`; cuando todas las comandas están listas, cocina lo avanza a `READY_FOR_DISPATCH`. Operaciones puede asignar una cuenta activa operativa/admin, despachar, marcar entrega, registrar fallo con motivo y devolverlo a la cola para reintento. Cada transición usa `expectedVersion`, evento y auditoría; entregar también marca la orden `SERVED`.
- Cancelar la orden cancela el despacho abierto y registra su transición. El historial Cliente propio incluye estado/horas de despacho, sin exponer motivo interno ni datos de otros clientes.
- Verificación: `KitchenServiceTest`, `OrderServiceTest` y `OrderRequestDecisionIntegrationTest` pasan (32 pruebas; Testcontainers valida Flyway V1–V27, aceptación, cancelación, ownership y ciclo asignar/despachar/fallar/reintentar/entregar). `sh mvnw clean test`: 156 pruebas, 0 fallos/errores/omitidas.

## 2026-10-04 — Preferencias de pago y factura en solicitudes Cliente

- Migración Flyway `V25__order_request_payment_and_invoice_preferences.sql`: añade a `wok.order_requests` la solicitud de factura y su snapshot (`invoice_name`, `invoice_tax_id`), y permite registrar para pickup efectivo/tarjeta/transferencia al recoger. No crea pagos ni facturas FEL.
- Pickup y delivery aceptan los datos de facturación solicitados, los normalizan, incorporan al fingerprint idempotente y los devuelven sólo en recursos propios del Cliente. Los datos fiscales se limitan a nombre (150) y NIT (32), en línea con la entidad de factura existente.
- La cola Operativa (`orders:manage`) sólo ve `invoiceRequested`; endpoint separado `GET /api/v1/operational/order-requests/{id}/invoice-request` requiere `invoices:manage` para revelar nombre/NIT.
- Límites preservados: `ONLINE_PAYMENT_REQUESTED` sólo expresa preferencia; la solicitud permanece pendiente de revisión, no cobra ni emite FEL. Delivery aún no se puede aceptar como pedido desde el flujo Operativo.
- Verificación: Testcontainers PostgreSQL 18 aplicó V1–V25 desde esquema vacío. Suite completa `sh mvnw -q test`: 147 pruebas, 0 fallos, 0 errores, 0 omitidas. Integración prueba persistencia pickup/delivery, que no se crea factura al solicitarla, prefill de un borrador desde pickup aceptado y separación de permisos entre `orders:manage`/`invoices:manage`.

## 2026-10-04 — Prefill fiscal del borrador FEL desde pickup aceptado

- Al crear un borrador de factura para una cuenta con pickup aceptado, el backend completa los campos vacíos de nombre/NIT desde la solicitud Cliente marcada para facturar. Un valor enviado por el personal prevalece. Si la cuenta agrupa solicitudes con datos fiscales distintos, responde 409 para revisión manual.
- Sigue siendo un borrador `DRAFT`; no se emite factura automáticamente. La ruta requiere `invoices:manage` y no expone estos datos en otros detalles Operativos.
- Prueba de integración Testcontainers verifica request aceptado → pedido/cuenta → borrador con datos fiscales. Suite completa 147/147 pasa con PostgreSQL 18.

## 2026-10-04 — Consulta Cliente de facturas emitidas

- `GET /api/v1/client/invoices` y `GET /api/v1/client/invoices/{invoiceId}` muestran únicamente facturas emitidas vinculadas a pickup aceptado del Cliente autenticado. El filtro exige que todos los pedidos de la cuenta pertenezcan a solicitudes aceptadas de esa persona; si la cuenta mezcla pedidos sin ownership demostrado, no se revela el documento.
- Devuelve resumen y líneas/datos fiscales mínimos. Documentos del `MockFiscalProvider` se marcan `testDocument`; no existe todavía descarga de PDF/XML. La autorización productiva depende de una integración FEL real.
- Prueba integrada cubre emisión mock, lectura propia, aislamiento entre clientes y rol no permitido. Suite backend completa 148/148 contra PostgreSQL 18/Testcontainers; V1–V25 aplican desde cero.

## 2026-10-02 — Fase 5 Facturación electrónica mock y outbox (rama de tarea)

- Rama `feature/invoices-outbox`, apilada sobre `feature/mixed-payments-tips` para conservar pagos/propina/caja y Testcontainers. Cierra `FEL-01` (`NEXT-2`) sin certificador real: el adaptador SAT queda `BLOCKED`, por lo que se define un puerto `FiscalProvider` con sólo el adaptador `MockFiscalProvider` (`wok.fiscal.mode=mock`).
- Commit `6cce3e6b` — `V23__invoices_and_outbox.sql` agrega el permiso `invoices:manage` (OPERATIONAL/ADMIN), las tablas `invoices` (borrador con estado `DRAFT`/`QUEUED`/`ISSUED`/`FAILED`, base gravable + IVA + total, datos de receptor y número de autorización/DTE) e `invoice_items` (instantánea de `order_items`, con `line_total` generado). Endpoints: `POST`/`GET /api/v1/operational/accounts/{accountId}/invoices` (pool de borradores por atención, se permiten varios por cuenta) y `GET /api/v1/operational/invoices/{invoiceId}`. Los precios se asumen con IVA incluido (12% configurable, `wok.fiscal.tax-rate`): total = suma de consumos no cancelados, base = total/1.12 y el IVA es la diferencia, redondeado a dos decimales.
- Commit `3dd6c92b` — `FiscalProvider` (puerto) + `MockFiscalProvider` (número `MOCK-…` y DTE reproducible) y `POST /api/v1/operational/invoices/{invoiceId}/issue` idempotente (`Idempotency-Key`, operación `INVOICE_ISSUANCE_REQUESTED`): el borrador pasa a `QUEUED` y se encola un evento en `wok.outbox_events` en la misma transacción. El `InvoiceIssuanceWorker` (programado, lote de hasta 25 por ciclo) reclama el evento con `FOR UPDATE SKIP LOCKED`, certifica con el proveedor y guarda número/DTE/`issued_at` (`issued_by`, `authorization_number`, `dte_uuid` únicos), publicando el evento y auditando `INVOICE_QUEUED` e `INVOICE_ISSUED`. Ante fallo reintenta hasta 5 intentos y marca la factura `FAILED`.
- Pruebas PostgreSQL: `InvoiceIntegrationTest` (4) cubre varios borradores por cuenta con desglose de IVA, rechazo de cuentas sin consumo, 404/403, emisión por outbox hasta `ISSUED`, replay idempotente y rechazo de reemisión/anulación inexistente. Suite completa: 134 tests, 0 fallos/errores/skips con `mvnw test` en `apps/api`.
- Límite: la factura no se genera desde un pago (se arma desde el consumo), no hay notas de crédito/anulación, ni correlativo tributario real, ni impuestos por línea, ni envío por correo al cliente; el worker es de un solo proceso. No incluye frontend. Cambios en rama de tarea; push/PR pendientes.

## 2026-10-02 — Fase 4 Pagos mixtos, propina y conciliación (rama de tarea)

- Rama `feature/mixed-payments-tips`, apilada sobre `feature/inventory-production` para conservar inventario/producción y Testcontainers. Continúa `NEXT-2` (cuenta/pagos/caja) sin simular pasarela: `CARD_EXTERNAL`/`TRANSFER` siguen siendo registro verificado por personal, conforme a BE-09.
- Commit `499de66` — `POST /api/v1/operational/accounts/{accountId}/payments` acepta `amount` opcional: si se omite cobra el saldo pendiente; si se envía, valida que no exceda el saldo (`422`) y admite varios métodos por cuenta. La cuenta pasa a `PAID` sólo cuando el saldo llega a cero; con pagos parciales permanece `OPEN`. La respuesta incluye `balance` y el movimiento `SALE` en caja usa el importe cobrado (no el total).
- Commit `31f0aa9` — `V22__payment_tips.sql` agrega `payments.tip_amount` (≥0). La propina no reduce el saldo de la cuenta; en efectivo entra a caja como movimiento `INCOME` "Propina de cuenta" (el `SALE` conserva sólo la venta), mientras que en tarjeta/transferencia se registra sin movimiento de caja. El detalle de cuenta expone `tips` y `tipAmount` por pago.
- Commit `3e2287e` — la caja incluye `breakdown` (`opening`, `sales`, `tips`, `otherIncome`, `expenses`, `withdrawals`, `expectedCash`) y la lista de `reconciliations`. Nuevo `POST /api/v1/operational/cash-sessions/{sessionId}/reconciliations` registra un arqueo intermedio (`is_final=false`) con auditoría `CASH_RECONCILED`; el cierre sigue generando el arqueo final.
- Pruebas PostgreSQL: `PaymentIntegrationTest` (9) suma pagos parciales/mixtos hasta saldar, rechazo de sobrepago, propina en efectivo (venta+propina en caja y desglose) y propina con tarjeta sin movimiento; `CashSessionIntegrationTest` (5) suma arqueo intermedio, desglose del esperado y rechazo tras cierre o sin permiso. Suite completa: 130 tests, 0 fallos/errores/skips con `mvnw test` en `apps/api`.
- Límite: sin divisiones de cuenta, propina sugerida, devoluciones/anulaciones ni pasarela real; el arqueo intermedio no bloquea el cierre y no hay conciliación bancaria. No incluye frontend ni delivery. Cambios en rama de tarea; push/PR pendientes.

## 2026-10-02 — Fase 3 Inventario y producción (rama de tarea)

- Rama `feature/inventory-production`, apilada sobre `feature/cash-simple-closing` para conservar Testcontainers y el flujo operativo completo. Se reutiliza `wok.items`/`wok.units` de `V8__catalog_foundation.sql`; todo el trabajo es aditivo por migraciones nuevas (`V19`–`V21`), sin editar migraciones aplicadas.
- Commit `a90e39e` — `V19__inventory_foundation.sql` agrega el permiso `inventory:manage` (OPERATIONAL/ADMIN), `items.minimum_stock` y las tablas `wok.inventory_balances` (saldo físico por item, `row_version`) y `wok.inventory_movements` (libro `ENTRY`/`ADJUSTMENT`/`WASTE`/`CONSUMPTION` con delta distinto de cero). `InventoryController`/`InventoryService` exponen `GET /api/v1/operational/inventory/items` (estado `OK`/`LOW`/`OUT`/`UNTRACKED`), `GET .../items/{itemId}` y `POST .../items/{itemId}/movements` con `Idempotency-Key` (`INVENTORY_MOVEMENT_RECORDED`), motivo obligatorio en ajustes/mermas y auditoría.
- Commit `fd3a916` — `V20__recipes_and_reservations.sql` agrega `wok.item_recipe_components` (receta item→item, sin autorreferencia ni duplicados) y `wok.inventory_reservations` (estado `ACTIVE`/`RELEASED`/`CONSUMED`, único activo por pedido+item). `InventoryReservationService` reserva, libera y consume de forma atómica (bloqueo de saldos por `item_id`, sin stock negativo → `409`, consumo idempotente). `OrderService` reserva al abrir/agregar líneas, libera al cancelar y consume al servir; se bloquea agregar líneas a pedidos `SERVED`. `InventoryController` suma `GET`/`PUT .../items/{itemId}/recipe` y calcula `quantityReserved`/`quantityAvailable`.
- Commit `2878a67` — `V21__production_batches.sql` agrega `production:manage` (OPERATIONAL/ADMIN), `wok.production_batches` (cantidad planificada, rendimiento real, estado, responsable, `request_id`), `wok.production_batch_items` (insumos consumidos) y `inventory_movements.production_batch_id`. `ProductionController`/`ProductionService` exponen `POST /api/v1/operational/production/batches` (con `Idempotency-Key`, `PRODUCTION_BATCH_REGISTERED`), `GET .../batches` y `GET .../batches/{batchId}`: toma la receta del item producido, escala por cantidad, valida stock disponible (descontando reservas activas), consume insumos y da de alta el rendimiento del item producido, con auditoría `PRODUCTION_BATCH_REGISTERED`. Modelo de dos niveles: la producción fabrica semielaborados que luego entran como componentes de otras recetas; vender un platillo consume sus componentes (no los insumos de un semielaborado ya producido).
- Pruebas PostgreSQL: `InventoryIntegrationTest` (3) cubre entradas/ajustes/mermas, umbrales de stock y permisos; `InventoryOrderIntegrationTest` (2) cubre el ciclo reserva→consume→release, rechazo por falta de stock sin persistir el pedido, validación de recetas y permisos; `ProductionIntegrationTest` (2) cubre consumo por receta con rendimiento real, replay idempotente, listado/detalle, receta ausente, stock insuficiente, insumo sin control de inventario y permisos. `OrderServiceTest` (13) se actualizó al nuevo constructor con `InventoryReservationService`. Suite completa: 126 tests, 0 fallos/errores/skips con `mvnw test` en `apps/api`.
- Límite: producción de un solo paso (no hay estados pendiente/en reposo ni cancelación de lote), sin costos, lotes por vencimiento, compras ni reportes. No incluye frontend ni delivery. Cambios en rama de tarea; push/PR pendientes.

## 2026-10-02 — Fase 2 Cobro simple y caja (rama de tarea)

- Rama `feature/cash-simple-closing`, apilada sobre la rama de Fase 1 para conservar la infraestructura de pruebas PostgreSQL. Se reutiliza el esquema de caja de `V6__cash_sessions_and_movements.sql`; no se tomó el `CashSessionController` sin mergear de `origin/feature/payments`, para mantener los patrones endurecidos (`IdempotencyStore`, `AuthException`, permisos granulares, tests reales).
- Commit `586d4e8` — `V17__cash_permissions.sql` agrega `cash:manage` (OPERATIONAL/ADMIN). Endpoints en `/api/v1/operational/cash-sessions`: abrir con fondo (`Idempotency-Key`), consultar la caja actual, registrar `INCOME`/`EXPENSE`/`WITHDRAWAL`, y cerrar con arqueo final (`countedCash` + `expectedVersion`). La idempotencia usa `IdempotencyStore` (`CASH_SESSION_OPENED`, `CASH_MOVEMENT_RECORDED`), hay bloqueo `FOR UPDATE` y auditoría (`CASH_SESSION_OPENED`, `CASH_MOVEMENT_RECORDED`, `CASH_SESSION_CLOSED`).
- Commit `8489a4e` — `V18__account_payments.sql` agrega `payments:manage`, la tabla `wok.payments` (método `CASH`/`CARD_EXTERNAL`/`TRANSFER`, estado `CAPTURED`) y la FK `cash_movements.payment_id`. `POST /api/v1/operational/accounts/{accountId}/payments` calcula el importe en el servidor (consumo no cancelado menos pagos previos), es un cobro único idempotente por cuenta (doble clic no duplica), exige caja abierta para efectivo (movimiento `SALE` enlazado) y deja la cuenta en `PAID`. El cierre de mesa ahora admite cuentas `PAID`.
- Commit `8328f70` — `GET /api/v1/operational/accounts/{accountId}` incluye `paid`, `balance` y la lista de pagos, para cerrar el ciclo cuenta → cobro → cierre.
- Pruebas PostgreSQL: `CashSessionIntegrationTest` (4) cubre apertura/movimientos/arqueo/cierre, replay y conflicto idempotente, segunda apertura, registro inexistente y rol no autorizado; `PaymentIntegrationTest` (6) cubre cobro en efectivo con movimiento de caja, cobros externos, doble cobro, pedidos abiertos, permiso y cierre de mesa tras el pago. Suite completa: 119 tests, 0 fallos/errores/skips con `mvnw test` en `apps/api`.
- Límite: cobro único sin pagos parciales, sin devoluciones/anulaciones ni pasarela en línea; no incluye frontend, inventario, producción ni delivery. Cambios en rama de tarea; push/PR pendientes.

## 2026-10-02 — Fase 1 Operativa: agregar ítems, detalle de cuenta y decisión de solicitudes (rama de tarea)

- Continuación en `feature/operational-flow-tables-orders-kitchen`. `OrderService` ahora inyecta `IdempotencyStore` (`platform/IdempotencyStore.java`), que reclama y completa registros en `wok.idempotency_keys` dentro de la misma transacción del caso de uso (replay con `resource_id`, `409` por hash distinto y `409` mientras está en proceso). Se unificó el alta de líneas en `insertLine` (con `RETURNING id`) y se refactorizó `enqueueTickets` para recibir líneas nuevas explícitas, continuar `sequence_no` con `COALESCE(max)+1` y crear `kitchen_ticket_items` por `order_item_id` (en lugar de reconsultar por `menu_item_id`).
- Commit `cb3dcd3` — `POST /api/v1/operational/orders/{orderId}/items` con `Idempotency-Key` (`orders:manage`): admite pedidos en SENT/PREPARING/READY/SERVED con cuenta `OPEN`, valida productos activos y moneda única, recalcula totales, re-encola comandas y registra auditoría `ORDER_ITEMS_ADDED`.
- Commit `345e8be` — `GET /api/v1/operational/accounts/{accountId}` (`accounts:manage`, nuevo `OperationalAccountController`/`AccountService`): cuenta con nombre de mesa, pedidos y total excluyendo CANCELLED.
- Commit `7b1dd45` — `V16__order_request_decision_link.sql` agrega `order_requests.order_id` con índice único parcial, y `POST /api/v1/operational/order-requests/{requestId}/decision` (`orders:manage`) acepta o rechaza solicitudes del Cliente. REJECT exige motivo; ACCEPT revalida disponibilidad, moneda y `requested_for` contra el tiempo de preparación, crea cuenta pickup (`dining_table_id NULL`) y pedido `channel PICKUP` con líneas `TAKEAWAY`, enlaza `order_id` y es idempotente por transición de estado. Se registran eventos y auditoría (`ORDER_REQUEST_ACCEPTED`/`ORDER_REQUEST_REJECTED`).
- Pruebas PostgreSQL: `OrderRequestDecisionIntegrationTest` (3) cubre aceptación con creación de pedido, replay de la decisión, rechazo con/sin motivo y producto que deja de estar disponible; `OperationalFlowIntegrationTest` (7) y `OrderServiceTest` (13) actualizados al nuevo encolado. Suite completa: 109 tests, 0 fallos/errores/skips con `mvnw test` en `apps/api`.
- Límite: Fase 1 sigue siendo backend Operativo; no incluye pagos, caja, inventario, producción ni delivery. Sin cambios de frontend, sin push ni merge.

## 2026-10-02 — Flujo Operativo verificable y permisos granulares (rama de tarea)

- Rama `feature/operational-flow-tables-orders-kitchen` (desde `development`). Se incorporaron Testcontainers y una base reutilizable `PostgresIntegrationTest` con contenedor singleton PostgreSQL 18 y Flyway aplicando V1–V15. El cherry-pick de la cobertura de sesión y la corrección del issuer quedan en commits propios (`16b05862`, `71811402`, `28395c8d`, `4d93b40a`, `65268ab6`).
- `OperationalFlowIntegrationTest` (`c69527c8`) cubre el flujo Mesas → cuenta → pedido → cocina → servicio → cierre contra PostgreSQL real: apertura de mesa/cuenta, alta de pedido con `Idempotency-Key` (replay idempotente y `409` por payload distinto), generación de comanda por estación, claim, cambio de estado, liberación del pedido a `READY`, cierre bloqueado con pedido abierto y rollback `422` sin persistencia.
- `RoleAuthorizationIntegrationTest` (`3ec29c9`) verifica `401` anónimo, `403` entre contextos (Cliente fuera de Operativo/Admin; Operativo fuera de Cliente/Admin; Admin sí accede a Operativo), endpoints públicos y rechazo de sesión expirada o revocada.
- Migración `V15__granular_operational_permissions.sql` añade `tables:manage`, `orders:manage`, `kitchen:manage`, `accounts:manage` y las asigna a OPERATIONAL/ADMIN. Los controladores de mesas, pedidos y cocina pasan de `hasAnyRole` a `hasAuthority`; abrir/cerrar cuenta exige `accounts:manage`. `PermissionAuthorizationIntegrationTest` demuestra que un rol con solo `tables:manage` accede a mesas pero no a pedidos/cocina ni a abrir cuenta.
- Suite completa: 103 tests, 0 fallos/errores/skips con `mvnw test` en `apps/api`.
- Límite: es un slice Operativo; no incluye pagos, caja, inventario, producción, delivery ni resolución de `order_requests`. Sin cambios de frontend, sin push ni merge.

## 2026-10-02 — Flujo HTTP completo de autenticación con PostgreSQL

- La prueba `SecurityCompositionIntegrationTest` amplía el smoke de composición a un ciclo real con PostgreSQL 18/Testcontainers: registra un Cliente, procesa la verificación mediante `MockEmailProvider` y `EmailOutboxWorker`, verifica la cuenta, inicia sesión móvil, consulta sesiones, confirma `403` en una ruta Admin para token Cliente, rota el refresh y comprueba `401` al reutilizar el token anterior y revocación del access token asociado.
- Validación final de `mvn -q test`: 47 tests, 0 fallos, 0 errores, 0 skips; Testcontainers ejecutó la integración y Flyway aplicó V1–V12. Hubo un primer `401` intermitente en el acceso a sesiones; la prueba aislada y la suite completa pasaron al repetirla. Mantener observación en CI/repeticiones futuras antes de considerar la cobertura estable.
- Cambio en rama especializada `fix/backend-security-composition`; commits previos `6a487a7` (corrección de filtros duplicados) y `af0390c` (smoke automatizado) ya estaban publicados. Este avance de cobertura queda pendiente de commit/push.
- Límite: es cobertura de auth sobre la API integrada, no prueba exhaustiva de ownership entre clientes ni despliegue productivo de email/OIDC. Sin merge ni cambios en frontend web.

## 2026-10-02 — Composición de seguridad Spring en integración

- Rama de corrección backend: `fix/backend-security-composition`, basada en `integration/backend-bootstrap` para corregir únicamente el conflicto de configuración encontrado al componer las ramas.
- Se retiró `BootstrapSecurityConfig`, una cadena temporal catch-all `denyAll` que coexistía con `identity.SecurityConfig` (JWT y reglas públicas/privadas). Spring abortaba con `UnreachableFilterChainException` por dos filtros `anyRequest()`; la configuración JWT queda como única cadena general.
- Maven Java 21: 45 pruebas, 0 fallos/errores/skips. PostgreSQL 18 nuevo: Flyway aplicó V1–V12 con `success=true`. Backend levantó en puerto temporal; HTTP health 200, OpenAPI 200, menú público 200 y cola Operativa privada 401 sin token.
- Sigue pendiente revisar las divergencias del modelo candidato respecto de V1–V12 y validar roles/ownership de todos los endpoints; este cambio sólo prueba el arranque y las rutas smoke citadas. No merge.

### Regresión automatizada de seguridad y startup

- Se añadieron dependencias test-scope de Testcontainers PostgreSQL/JUnit y `SecurityCompositionIntegrationTest`. El test crea una PostgreSQL18 aislada, arranca el contexto real (incluyendo Flyway) y verifica health/OpenAPI/menú público 200 y cola Operativa 401 sin token.
- `mvn test`: 46/46 pruebas; integration test ejecutó (no skip) con Testcontainers/Docker. Esto convierte el smoke del conflicto de filtros en una regresión automatizada. No cubre todavía login/ownership A-vs-B ni todos los permisos.

## 2026-09-26 — Reparto en ramas del backend

- Los worktrees `feature/backend-foundation`, `feature/backend-auth`, `feature/backend-api`, `feature/reservations`, `feature/availability`, `feature/ai` y `feature/payments` están sobre `3bbd0ed`; los paquetes se distribuyeron sin duplicar la aplicación Maven en ramas de dominio.
- El reparto inicial se committed/pushed por rama. Foundation contiene Maven/Spring/config/Compose/Nginx; auth identity/email; reservations/availability sus slices; AI y payments/FEL tienen puertos, mocks y tests.
- Después se añadieron localmente el registro de perfil Cliente, compatibilidad JDBC para timestamp JWT, solicitud/revisión de reserva y gestión auditada de capacidades. Maven verify combinado pasó 12/12; V1–V5 se aplicaron en PostgreSQL 18 efímero y el smoke HTTP/DB pasó. Estos cambios siguen sin commit en sus ramas; dependen de foundation + migraciones para integración.
- Ver [handoff](../project/BRANCH_HANDOFF.md) desde el worktree `feature/project-foundation` para el estado branch por branch y dependencias.

## 2026-09-25 — Primer core Spring verificable

- Se incorporó `apps/api`: Java 21/Spring Boot, endpoints de auth inicial, JWT de sesión WOK, challenge HMAC, refresh rotativo, Google verifier deshabilitado, evaluation preliminar de capacidad, service capabilities, puertos mock de Payment/FEL/AI y outbox email.
- Suite Maven: 12/12 JUnit. Imagen backend compiló; Spring arrancó con DB vacía Postgres 16 y Flyway validó/aplicó V1–V4. Health, OpenAPI y capabilities respondieron HTTP 200. Smoke de register respondió 202 y persistió user `PENDING_VERIFICATION`, rol `CLIENT` y email en outbox; código/verify y login todavía no se probaron end-to-end.
- Ajuste: SMTP requiere `wok.email.mode=smtp` y host; el modo por defecto es mock. Compose mantiene secretos requeridos y el perfil dev puede apuntar a Mailpit.
- Límite: auth no tiene pruebas HTTP/DB exhaustivas; faltan rate-limit por IP, RBAC completo/ownership por caso de uso, verificación Google real, reserva transaccional, catálogo/pedido/finanzas y seguridad CSRF/cookie web.
- Siguiente: seguir [backlog](../backend/BACKLOG.md) y [handoff](../project/BRANCH_HANDOFF.md); separar tareas bajo ramas acordadas con el equipo y abrir PRs a `development` tras actualizarlo.

## 2026-09-15 — Ajuste a Spring, rotación y bloque final protegido

- Base actual: el PM informa experiencia Java/Spring e indicación del ingeniero de usarlos; plan orientado a Spring Boot, Maven, Spring Security, JPA y Flyway con PostgreSQL. Versiones pendientes de revisar contra backend ya iniciado.
- Organización: Edgar sigue PM, SM rotativo; 3 web + 2 backend + 1 app iniciales. Una persona compartida backend/app no se cuenta como dos; transición a 2/2/2 requiere liberar frontend.
- Plazo: últimas 2–3 de las 5–6 semanas reservadas para seguridad, integración y ajustes. Plan incluye congelamiento al final de semana 2 o 3 según escenario; controles básicos desde semana 1.
- Corrección: el PM confirma que no ha habido fallos de React Native; las dudas son preventivas. Esta aclaración sustituye la interpretación pendiente de la entrada anterior.
- Entregables: plan backend/backlog revisados y [plan independiente de app Cliente](../mobile/CLIENT_APP_PLAN.md), con trazabilidad de vistas y estimación separada.
- Viabilidad: la carga anterior no se declara compatible con dos personas parciales y 2–3 semanas de construcción. Horas y avance implementado pendientes; requiere recorte/reestimación verificable.
- Estado observado: no se encontraron archivos Java/Maven/Gradle en esta rama; no se infiere ausencia de backend en otras ramas o repositorios.
- Verificación: revisión documental de calendario, stack, enlaces, estimaciones y formato. Sin instalación, cambios de aplicación ni operaciones Git de publicación.

## 2026-09-15 — Plan para seis integrantes y entrega en cinco o seis semanas

- Resultado: propuesta de arquitectura modular, corte P0 académico, calendario semanal, responsabilidades, backlog estimado, criterios de aceptación y comparación React Native/Expo/Flutter.
- Archivos: [entrada](../backend/README.md), [plan](../backend/DEVELOPMENT_PLAN.md), [backlog](../backend/BACKLOG.md).
- Contexto confirmado: seis integrantes y fecha prevista dentro de cinco o seis semanas; horas semanales, rúbrica y fallos móviles concretos pendientes.
- Fuentes: requisitos e historias externos, guías/código frontend, decisiones registradas, notas pertinentes del vault y documentación de diseño PostgreSQL localizada en la carpeta académica de Desarrollo Web.
- Límite: el diseño externo documenta 109 tablas sin ejecución en servidor; posteriores errores de E/S impidieron completar inspección directa de diagramas/DDL. Revisar antes de adoptar migraciones.
- Decisiones: tecnologías, asignación nominal y recortes son propuestas. Recomendación móvil: React Native con Expo, sujeta a prueba temprana Android/iPhone y revisión de cualquier implementación Flutter existente.
- Implementación: ninguna API, DB, proveedor o app conectada; sólo documentación. No se modificaron frontend ni registros previos de otros canales.
- Git: archivos nuevos preparados con rama local `feature/frontend-admin` y cambios previos presentes. Sin cambio de rama, commit, push, merge ni PR; publicación documental pendiente mediante rama de tarea desde `development`.
- Verificación: revisión de coherencia del plazo, capacidad y prioridades; comprobación de formato/enlaces al cerrar la preparación. No se ejecutan pruebas de aplicación por esta entrega documental.
- Siguiente paso: confirmar horas y rúbrica, resolver decisiones de los primeros dos días y refinar paquetes P0. La adopción técnica no se considera aprobada por existir el plan.

## 2026-09-28 — Configuración del issuer JWT

- Se configuró `WOK_AUTH_ISSUER` por ambiente y se fijó una URI reservada `.invalid` para desarrollo local. El valor anterior `wok-asian-food` no era un URL válido para `JwtClaimAccessor` y la validación de issuer de Spring Security.
- Docker Compose reenvía el ajuste al contenedor API. Producción debe definir el URL HTTPS canónico de identidad antes de emitir tokens; el placeholder no es una identidad productiva.
- Validación con las pruebas de identidad en una composición desechable de `feature/backend-foundation` y `feature/backend-auth` (Java 21, Maven; 5/5 pruebas unitarias aprobadas).
# Progreso de desarrollo backend

## 2026-10-04 — Administración básica de items de menú

- Nueva migración V34 agrega `catalog:manage` sólo a ADMIN. `GET /api/v1/admin/catalog/menu-items` lista items configurados con categoría, precio/moneda, visibilidad, estado y señales de item base/área de preparación activa.
- `PUT /api/v1/admin/catalog/menu-items/{id}` actualiza campos de presentación/precio con `expectedVersion`; audita snapshots estructurados before/after y motivo. Responde 404 para item inexistente y 409 para versión obsoleta. No crea datos ficticios ni recetas.
- Validado con PostgreSQL 18 en Testcontainers: Flyway aplicó desde cero V1–V34; `AdminCatalogIntegrationTest` cubre listado/actualización, snapshots de auditoría, conflicto por versión obsoleta y denegación para CLIENT/OPERATIONAL (2 pruebas). Se corrigió la consulta de moneda para el esquema real (`currencies` no tiene bandera `active`) y se tiparon explícitamente los valores posiblemente nulos en `jsonb_build_object` para evitar parámetros SQL sin tipo inferible.
- Suite completa backend: `sh mvnw -q test` — 194 tests, 0 fallos, 0 errores, 0 omitidos. El catálogo completo sigue parcial: faltan creación de recursos/categorías, modificadores validados en pedidos, reglas de disponibilidad y menú real.

## 2026-10-04 — Cancelación Cliente de solicitudes delivery

- `DELETE /api/v1/client/delivery-requests/{requestId}` permite cancelar sólo solicitudes DELIVERY propias en `PENDING_REVIEW`; bloquea la fila, reintentos de una cancelación ya realizada son idempotentes y se registra un evento único `CANCELLED`. Solicitudes aceptadas dan 409 y solicitudes ajenas/no delivery dan 404.
- La ruta pickup también filtra explícitamente `fulfillment_type = 'PICKUP'`, evitando que una URL de otro flujo cruce y cancele una solicitud delivery.
- `ClientDeliveryCancellationIntegrationTest` cubre cancelación + retry, ownership, estado aceptado y aislamiento de rutas (4 pruebas). Suite completa PostgreSQL 18/Testcontainers y Flyway V1–V34: 198/198, sin fallos, errores ni skips.

## 2026-10-04 — Recuperación idempotente del cierre de caja

- `POST /api/v1/operational/cash-sessions/{sessionId}/close` requiere `Idempotency-Key`; un reintento idéntico devuelve el estado cerrado actual sin insertar otro arqueo final ni duplicar auditoría. Reusar la clave con otro monto/versión devuelve 409.
- La clave se reclama y completa dentro de la misma transacción que el arqueo final, cierre y auditoría. No cambia el cálculo de efectivo ni trata el fondo inicial como venta.
- Verificación PostgreSQL 18/Testcontainers: `CashSessionIntegrationTest` 5/5 confirma replay, rechazo de payload distinto y un único arqueo final/auditoría; suite completa 192/192, 0 fallos/errores/omitidas. Flyway V1–V33 se aplicó desde esquema vacío.

## 2026-10-04 — Asignación fiscal dividida por atención

- La creación de borradores de factura acepta un importe explícito y calcula el saldo fiscal aún no asignado a documentos `DRAFT`, `QUEUED` o `ISSUED`. Si se omite el importe, asigna el saldo completo restante.
- El bloqueo transaccional existente de la cuenta serializa asignaciones concurrentes. Se permite emitir varios DTE por cuenta y V29 reemplaza el índice único anterior por un índice de consulta de asignaciones.
- Las asignaciones parciales se representan actualmente como una línea agregada “Consumo asignado de la atención”; la primera factura completa mantiene el detalle original de los productos. El reparto detallado de líneas entre varios DTE queda como refinamiento fiscal pendiente.
- Las pruebas focales `InvoiceIntegrationTest` pasaron 7/7 en PostgreSQL 18/Testcontainers, incluida migración Flyway V1–V29, dos DTE parciales y rechazo de sobreasignación.

## 2026-10-04 — Seguimiento de pickup aceptado para Cliente

- En `feature/backend-capacity-order-lifecycle` se añadió `GET /api/v1/client/orders/tracking`, protegido para rol `CLIENT`. La consulta devuelve como máximo 50 solicitudes pickup aceptadas con pedido asociado y filtra siempre por el UUID del usuario autenticado; no acepta identificadores de cliente suministrados por el navegador.
- La respuesta expone código y estado del pedido, horario solicitado, última actualización y ETA máxima de los tickets activos sólo cuando el pedido está `SENT` o `PREPARING`. Los estados finales no publican ETA. No requiere migración: reutiliza `order_requests.order_id`, `orders` y `kitchen_tickets` de V9, V13 y V16.
- Prueba unitaria del controlador valida el filtro de ownership, el estado aceptado y la proyección del ETA. `sh mvnw -q -DargLine=-javaagent:... -Dtest=ClientOrderTrackingControllerTest test` pasó (2 pruebas). Suite backend completa: 139 pruebas, 0 fallos/errores, 49 omitidas porque Docker no está accesible para Testcontainers.
- Dependencia externa/red: el fetch SSH falla por permisos de `/etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`; el fetch HTTPS dentro del sandbox no resuelve `github.com`. Con acceso de red elevado se actualizó `origin/*`; `feature/backend-capacity-order-lifecycle` es local y parte de `origin/development`, que no presentó commits nuevos respecto a su base. Esta rama aún no se ha publicado.
- Límites: el backend sólo permite aceptar solicitudes pickup en el flujo operativo actual; el seguimiento no convierte solicitudes delivery en pedidos ni marca pagos. Falta prueba integrada contra PostgreSQL y prueba HTTP con autenticación real.

## 2026-10-04 — Evaluación Flyway/Liquibase

- Se documentó en `docs/database/MIGRATION_TOOL_ASSESSMENT.md` la compatibilidad, diferencias funcionales, estrategia de baseline, riesgos, pasos de validación y estimación orientativa. Con PostgreSQL único y 25 migraciones SQL activas, recomendación actual: conservar Flyway. Evaluación únicamente; no se cambió Maven, configuración ni el historial de ninguna base.

## 2026-10-04 — Perfiles fiscales Cliente

- Se añadió Flyway V26 `customer_tax_profiles` con identidad fiscal guardada por cliente, etiquetas únicas por cuenta, versión optimista y máximo un perfil predeterminado por cliente.
- `GET/POST /api/v1/client/tax-profiles`, `PUT/DELETE /{profileId}` requiere rol CLIENT. Consultas y mutaciones siempre limitan por el `sub` autenticado; se serializan cambios por cliente y la edición exige `expectedVersion`. La API limita la respuesta a 20 perfiles y no expone columnas internas/auditoría.
- Las pruebas HTTP con PostgreSQL 18 cubren migración desde cero, propiedad cruzada, permiso de rol, exclusividad del predeterminado, cambios/versiones, eliminación y validación. Suite completa: 151 pruebas, 0 fallos, 0 errores, 0 omitidas.
- No es un módulo de facturación ni conserva/autoriza pagos: estos perfiles sólo son datos guardados que Cliente puede reutilizar al solicitar una factura.

## 2026-10-04 — Historial de conversaciones Cliente

- `GET /api/v1/client/conversations` ya incluye el texto/fecha del último mensaje mediante una subconsulta lateral, junto con el estado y fecha de actividad. Mantiene el límite de 20 hilos y la selección por perfil Cliente del subject autenticado.
- La prueba PostgreSQL abre una conversación cerrada, agrega respuesta humana y verifica que el historial propio incluya esa última respuesta. No se exponen conversaciones ajenas.
- Suite completa con PostgreSQL 18 y Flyway V1–V26: 151 pruebas, 0 fallos, 0 errores, 0 omitidas (`clean test`, conteo limpio).

## 2026-10-04 — Verificación de capacidad y anticipación

- Se añadieron pruebas puras de `OperationalCapacityService`: rechaza una solicitud un segundo antes de cumplir las 3 horas, permite evaluar justo en el límite pero requiere revisión humana, y no acepta automáticamente ni grupos de 2 ni grupos de 20 a las 21:15. Mensajes públicos no indican hora obligatoria de salida.
- `sh mvnw -q clean test` en PostgreSQL 18/Testcontainers y migraciones V1–V26 pasó 154 pruebas, 0 fallos, 0 errores, 0 omitidas. El conteo se verificó en los reportes Surefire recién generados.

## 2026-10-04 — Aceptación operativa de delivery

- Operaciones puede aceptar una solicitud DELIVERY pendiente y crear un pedido del canal `DELIVERY`, con cuenta sin mesa, líneas TAKEAWAY, reservas de inventario, comanda de cocina, auditoría e idempotencia en la decisión. La solicitud conserva dirección, referencia y contacto; solicitudes pickup usan el mismo constructor con su canal original.
- Antes de aceptar se revalidan disponibilidad de productos, moneda, precio exacto contra el snapshot de solicitud y tiempo de preparación. Si cambió el precio, devuelve conflicto y deja la solicitud pendiente; no genera un pedido con total inesperado.
- Historial Cliente delivery expone, con ownership por usuario, código/estado del pedido y ETA de cocina cuando está disponible; incluye motivo de decisión para rechazos. Suite limpia PostgreSQL 18/Testcontainers + Flyway V1–V26: 155 pruebas, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-04 — Cola Operativa para solicitudes pickup/delivery

- `GET /api/v1/operational/order-requests` lista hasta 100 solicitudes y permite filtrar `status` y `fulfillmentType`; sin filtros muestra primero las pendientes. `GET /api/v1/operational/order-requests/{requestId}` devuelve snapshot de cliente/modalidad/contacto/horario/importe/notas y líneas guardadas, incluyendo dirección y referencia para delivery.
- Ambos endpoints exigen `orders:manage`, validan filtros contra listas permitidas y no reciben IDs de usuario para ampliar alcance. Se añadió prueba HTTP/PostgreSQL para filtro, detalle delivery, items, rol Cliente prohibido y filtro inválido.
- La rama contiene explícitamente el límite previo: aceptar una solicitud DELIVERY sigue respondiendo 422; consulta del Operativo no equivale a soporte de reparto, autorización contra entrega o cobro externo.
- PostgreSQL 18 aplicó Flyway V1–V24 en la prueba efímera. Clase focal: 5/5 pruebas; suite completa: 140 pruebas, 0 fallos, 0 errores, 0 omitidas. Docker/Testcontainers disponible en la corrida con acceso elevado.

## 2026-10-04 — Google OIDC y nonces remotos

- Se integraron los commits remotos de verificación OIDC y nonces de un solo uso. Migraciones V30/V31 mantienen intacta la secuencia local V1–V29. Google continúa apagado si falta el client ID; JWT externo validado por JWKS, issuer, audience, vigencia, subject, email verificado y nonce WOK de vida corta/hash-only.
- Verificación focal con PostgreSQL 18/Testcontainers y Byte Buddy agent explícito: 18 pruebas de los grupos auth/OIDC, 0 fallos y 0 errores. Suite completa previa al hardening QA: 171/171.

## 2026-10-04 — Puerto remoto de intents de pago mock

- Integrados `PaymentGateway` y `MockPaymentGateway`: crear intents idempotentes, con montos/moneda validados y estados de proveedor explícitos. El mock devuelve `PENDING` y nunca afirma que un pago se capturó; no reemplaza el flujo de caja ni se presenta como integración de pasarela productiva.
- Suite completa PostgreSQL 18/Testcontainers + Flyway V1–V31: 171 pruebas, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-04 — Motivo de rechazo pickup visible al cliente

- Tras revisar también `origin/feature/backend-api`, se completó en pickup la proyección del motivo guardado por Operaciones al rechazar una solicitud, con mensaje público por estado. Sólo se expone la razón cuando el estado es `REJECTED`; no se filtran notas ni códigos internos de cancelación.
- La prueba PostgreSQL confirma que Cliente ve `decisionReason` y el mensaje de rechazo en su historial propio. Pruebas focales pickup/delivery/decisiones: 23/23, sin fallos.

## 2026-10-04 — Hallazgos de QA remoto: auth, errores y demo local

- Integrado límite de login por IP, manteniendo el tope por cuenta existente. La IP se toma de `X-Real-IP` cuando parece una dirección válida establecida por Nginx; se ignora `X-Forwarded-For`. Flyway V32 añade `LOGIN` al conjunto permitido de acciones.
- Errores `ResponseStatusException` conservan estado/mensaje público; denegaciones entregan 403 JSON genérico y errores inesperados se registran sin volcar mensajes/stack al log y responden con texto sanitizado.
- Se corrigieron hashes bcrypt de las cuentas demo documentadas y se añadió una prueba que los compara con `DemoOperativo2026` y `DemoAdmin2026`. CI usa `actions/setup-java@v5`.
- Focales: auth hardening 8/8, error handler 3/3, hashes demo 1/1. Suite completa limpia con PostgreSQL 18/Testcontainers y Flyway V1–V32: 177 pruebas, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-04 — Intento de pago online para delivery Cliente

- Flyway V33 agrega `wok.payment_intents` con restricción de un solo intento activo por pedido, estados explícitos y referencia del proveedor. `POST /api/v1/client/delivery-requests/{requestId}/payment-intents` exige rol Cliente, ownership, solicitud aceptada de delivery y preferencia `ONLINE_PAYMENT_REQUESTED`; calcula el saldo usando el total persistido del pedido y pagos/reembolsos existentes, no importes enviados por la app.
- El endpoint usa `PaymentGateway` con adaptador `MOCK`, permite recuperar el mismo intento al repetirlo incluso con clave nueva, registra auditoría y responde `PENDING`. No inserta `wok.payments`, no cierra la cuenta y no declara fondos capturados. Falta proveedor real, checkout/3DS, webhook firmado y conciliación; reemplazar el mock debe usar un worker/outbox antes de llamadas de red.
- Pruebas PostgreSQL 18: ownership ajeno responde 404, preferencia no online se rechaza, replay retorna el mismo intento y el cobro queda sin registrar. `bash mvnw -q clean test`: 179 pruebas, 0 fallos, 0 errores, 0 omitidas; Flyway V1–V33 aplicado desde esquema vacío.

## 2026-10-05 — Solicitud de cancelación de pedido aceptado

- Flyway V36 añade solicitudes/eventos de cambio con historial, versión optimista, ownership del Cliente y como tipo inicial `CANCEL_ORDER`. `POST /api/v1/client/order-requests/{requestId}/change-requests` sólo admite pedidos pickup/delivery aceptados que aún puedan cancelarse; usa `Idempotency-Key`, guarda motivo y deja intacto el pedido mientras espera revisión.
- Cliente consulta sus solicitudes con `GET /api/v1/client/order-requests/change-requests` o la actual de un pedido. Operaciones con `orders:manage` lista solicitudes y decide con `expectedVersion`; aprobar delega en la transición existente de `OrderService`, cancela comandas/reservas/despacho y rechaza estados obsoletos. Si la cuenta tiene cobro neto pendiente, la aprobación devuelve 409 hasta registrar el reembolso manual.
- `ClientOrderChangeRequestIntegrationTest` verifica creación, replay sin duplicar eventos, aislamiento entre clientes, aprobación Operativa, protección ante saldo capturado, rechazo sin motivo y conflicto si la orden avanza durante la revisión. La suite completa limpia pasó contra PostgreSQL 18/Testcontainers y Flyway V1–V36: 204 pruebas, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-05 — Horario de reservas gobernado por base de datos

- `OperationalCapacityService` consulta `business_hours`: prioriza horario activo `DINE_IN`, recurre al `RESTAURANT` del mismo día y su zona horaria, y sugiere otra fecha si no existe una ventana activa. Respeta apertura/cierre configurados y el último ingreso normal de 21:15. No acepta reservas automáticamente mientras no estén integradas capacidad real de mesas, personal, cocina, carga, producción y reservas.
- Se corrigió Spring Security para permitir anónimamente `POST /api/v1/public/reservations/evaluate`, que ya estaba presentado como endpoint público. La app Cliente ahora puede evaluar horario y estancia estimada antes de enviar; se aclara que la solicitud se evalúa de nuevo y no queda confirmada.
- Verificación: prueba HTTP/PostgreSQL sobre override `DINE_IN`, 7 pruebas unitarias de capacidad y suite completa limpia con PostgreSQL 18/Testcontainers/Flyway V1–V36: 207 pruebas, 0 fallos, 0 errores, 0 omitidas.
- La evaluación sugiere hasta tres fechas/horas posteriores que respetan apertura y mínimo de 3 h. Esas alternativas se persisten en `reservation_evaluations.alternatives`, aparecen en el historial Cliente y se conservan en un replay idempotente. Prueba HTTP confirma persistencia/replay y orden elegible; suite completa tras ampliar cobertura: 209 pruebas, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-05 — Administración versionada de horarios

- Flyway V37 crea unicidad por servicio/día y agrega `hours:manage`, asignado inicialmente sólo a ADMIN. `GET /api/v1/admin/business-hours` lista la agenda; `PUT /api/v1/admin/business-hours/{serviceType}/{weekday}` crea o actualiza una ventana, permite cerrarla con `active=false`, valida horas y zona IANA, exige motivo y `expectedVersion`, y registra auditoría.
- Se separó este permiso de `service:manage`, que también tiene Operativo, para evitar que el personal operativo cambie política de horarios. El evaluador de reservaciones ya consume esta misma tabla.
- Pruebas de integración en PostgreSQL 18/Testcontainers: creación/actualización/auditoría, conflicto de versión, validación de horas/zona y acceso exclusivo de Admin: 3/3. Se ajustó el fixture del broker IA para respetar la unicidad del horario semillado. Suite completa limpia con Flyway V1–V37: 212 pruebas, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-05 — Revalidación al confirmar reservas

- La decisión Operativa de confirmar vuelve a comprobar bajo bloqueo de la reserva que la hora siga al menos a tres horas y dentro del horario activo/último ingreso configurado. Si la agenda cambió mientras estaba pendiente, responde `409`, mantiene el estado `REQUESTED` y deja al personal coordinar/rechazar sin aceptar bajo reglas obsoletas. La decisión de rechazo sigue disponible.
- Pruebas PostgreSQL 18/Testcontainers: confirmación en ventana válida y conflicto tras cambiar el horario, 2/2. Suite limpia completa con Flyway V1–V37: 214 pruebas, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-05 — Preórdenes visibles en la cola de revisión

- La cola `GET /api/v1/operational/reservations/pending` ahora incluye `preorderItems` con nombre, cantidad, precio/currency y modificadores desde snapshots inmutables. El equipo puede revisar la preorden junto con la solicitud antes de confirmar o rechazarla; los snapshots siguen sin crear pedidos ni reservar inventario.
- Se amplió `ConfiguredReservationHoursIntegrationTest` para comprobar que la cola pendiente expone el mismo artículo y modificador guardados y que la reserva aparece allí mientras espera revisión.
- Verificación: compilación Maven; suite PostgreSQL 18/Testcontainers con Flyway V1–V38: 225 pruebas, 0 fallos, 0 errores, 0 omitidas. El primer fetch falló por permisos en SSH config global; usando `ssh -F /dev/null` se publicó `b772600` y fetch verificó `HEAD = origin/feature/backend-capacity-order-lifecycle`. Sin merge a development.
## 2026-10-05 — Verificación integral PostgreSQL 18 / V37

- Se ejecutó la suite backend completa desde `apps/api` con Testcontainers y Docker local accesible. En este JDK restringido se pasó el agente de Byte Buddy a la JVM de pruebas para evitar el auto-attach de Mockito.
- Flyway validó y aplicó/confirmó V1–V37 contra PostgreSQL 18; resultado: 214 pruebas, 0 fallos, 0 errores y 0 omitidas.
- En este entorno fue necesario pasar Byte Buddy como agente explícito porque el auto-attach de Mockito está restringido. La primera ejecución sin Docker/agente no es evidencia válida de fallo funcional; produjo 102 errores de inicialización de Mockito y omitió las pruebas Testcontainers. Con Docker y el agente, toda la suite quedó verde.
- `feature/backend-capacity-order-lifecycle` se sincronizó con su remoto antes de esta revisión y no tenía commits pendientes del remoto. `development` avanzó remotamente y permanece sin modificar.
## 2026-10-05 — Facturas Cliente para pickup y delivery

- Se corrigió la descripción del endpoint de lectura Cliente: las facturas emitidas se exponen cuando toda orden de la cuenta pertenece a solicitudes aceptadas de ese usuario, independientemente de la modalidad pickup/delivery. Se mantiene el filtro completo de ownership de la cuenta para no revelar facturas compartidas con órdenes ajenas.
- La integración PostgreSQL crea una cuenta con órdenes pickup y delivery aceptadas, emite una factura mock y valida que el titular lea detalle/líneas y que otro cliente reciba una lista vacía/404. Clase `InvoiceIntegrationTest`: 7/7 en PostgreSQL 18, Flyway V1–V38.
## 2026-10-05 — Catálogo del menú vigente y setup administrativo

- `V39__admin_catalog_setup.sql` añade claves estructurales, slug opcional único, marca `age_restricted` y estado `recipe_status` sin insertar recetas ni menú dentro de Flyway. El setup ADMIN permite crear categorías/estaciones/productos auditados; las altas nuevas quedan ocultas, inactivas y sin seguimiento de inventario, hasta revisión/publicación.
- `database/seeds/menu_real_dev.sql` es una carga manual idempotente para desarrollo: 4 categorías, 3 áreas y 31 productos en GTQ según el menú compartido, con grupos/opciones estructuradas y vínculo por producto. Las pistas de ingredientes no generan BOM, impactos, disponibilidad falsa ni consumos.
- El menú público incorpora slug y `ageRestricted`, y permite obtener producto publicado por UUID o slug. La app Cliente consume esos mismos DTOs y muestra aviso +18; la política de verificación legal aún no está definida. Catálogo funcional no significa receta, stock ni disponibilidad automática.
- `RealMenuSeedIntegrationTest` corre el seed dos veces sobre PostgreSQL 18, revisa 31 productos, precios, restricción +18, estados pendientes, cero tracking/impactos para productos del menú, cálculos Onigiri Q40/Q45/Q45/Q50 y API pública. Suites focales con migraciones desde cero: `RealMenuSeedIntegrationTest` 1, `AdminCatalogSetupIntegrationTest` 2, `AdminCatalogIntegrationTest` 3 y `PublicMenuAvailabilityIntegrationTest` 1; cero fallos/errores/omitidas.
- Recetario/cantidades/rendimientos/mermas/tiempos, disponibilidad +18, condicional picante según salsa, distribución del Panko, imágenes y sabores actuales requieren confirmación/configuración posterior. Detalle en [CATALOG_MENU.md](../backend/CATALOG_MENU.md).

## 2026-10-06 — Áreas canónicas del menú y pedidos con muchos productos

- El seed idempotente consolida estaciones antiguas en `COCINA_FRIA`, `COCINA_CALIENTE` y `BARRA`. Cuando existen nombres legacy y canónicos, mueve referencias y desactiva duplicados; nunca crea una segunda estación equivalente. PostgreSQL prueba el caso de colisión y la segunda ejecución.
- Se quitó el antiguo tope de 20 líneas distintas en disponibilidad pública, pickup, delivery y preorder de reservas. Se conserva una cota técnica de payload de 100 líneas. Es sólo una protección de solicitud; la evaluación de disponibilidad agrega componentes compartidos y no permite eludir límites repartiendo cantidades entre SKU.
- Focales `PublicMenuAvailabilityIntegrationTest` y `RealMenuSeedIntegrationTest` pasaron con PostgreSQL 18/Testcontainers, Flyway V1–V39: 3 pruebas, 0 fallos, 0 errores, 0 omitidas. Con Docker inaccesible en sandbox, Testcontainers omitía las pruebas; resultado válido se obtuvo al habilitar acceso al socket Docker.

## 2026-10-06 — Extras Sushi seleccionables

- El seed idempotente ahora asocia Aguacate, Mayonesa chipotle, Mayonesa jalapeño y Salsa de anguila (Q5 cada uno) a los nueve productos Sushi vigentes. La administración conserva compatibilidad producto↔grupo editable; no se crean impactos de stock.
- `RealMenuSeedIntegrationTest` verifica que los nueve productos expongan los cuatro extras por el selector usado por API y comprueba precio, idempotencia y ausencia de tracking ficticio. PostgreSQL 18/Testcontainers, Flyway V1–V39: 1/1, cero fallos/errores/omitidas.
- Regresión: suite completa backend con PostgreSQL 18/Testcontainers y Flyway V1–V39: 231 pruebas, cero fallos, errores u omitidas.

## 2026-10-07 — Transiciones delivery idempotentes

- `PATCH /api/v1/operational/deliveries/{orderId}` ahora requiere `Idempotency-Key`. La clave queda acotada al actor y a `DELIVERY_DISPATCH_TRANSITION`; el fingerprint incluye pedido, acción, versión esperada, repartidor y motivo normalizado. Claim, transición, evento, auditoría y resultado idempotente comparten la transacción.
- Un reintento con la misma clave y datos devuelve el despacho actual sin repetir eventos; reutilizar la clave con otro payload responde `409`. Se mantiene `expectedVersion` para conflictos de edición concurrente. `X-Request-Id` continúa siendo sólo correlación/auditoría.
- Se corrigió el manejador global para responder `400` con mensaje neutro cuando falta un encabezado obligatorio o un parámetro UUID no tiene formato válido, en vez de filtrar errores de binding como `500`.
- `OrderRequestDecisionIntegrationTest`: 11 pruebas con PostgreSQL 18/Testcontainers y Flyway V1–V39, incluyendo replay, clave/payload conflictivos, headers ausentes/malformados, contrato OpenAPI y conteo de eventos/auditoría sin duplicados: 0 fallos, 0 errores, 0 omitidas. Suite backend completa: 232 pruebas, 0 fallos, 0 errores y 0 omitidas.

## 2026-10-07 — La capability de reservas gobierna nuevas solicitudes

- `ReservationRequestService` valida `service_capabilities.RESERVATIONS` después de resolver replays idempotentes y antes de evaluar capacidad, leer/snapshotear preórdenes o insertar datos. `ENABLED` y `MANUAL_APPROVAL` permiten continuar; `PAUSED`, `DISABLED` o capability ausente responden `503`.
- La consulta toma `FOR SHARE` dentro de la transacción, por lo que una pausa administrativa que gana la carrera se respeta antes de crear evaluación/reserva; las operaciones ya guardadas/reintentadas conservan su resultado idempotente.
- `ConfiguredReservationHoursIntegrationTest`: 5 pruebas PostgreSQL 18/Testcontainers; valida ambas capacidades bloqueadas sin evaluación ni reserva, que `MANUAL_APPROVAL` permite una solicitud pendiente y que una pausa que bloquea primero hace esperar la solicitud HTTP para luego responder 503 sin persistencia. Suite completa Flyway V1–V39: 234 pruebas, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-07 — La evaluación pública también respeta la pausa de reservas

- `/api/v1/public/reservations/evaluate` delega en el servicio de solicitudes y revisa `RESERVATIONS` con el mismo row lock transaccional que el envío. Si la capability está `PAUSED`, `DISABLED` o ausente, no devuelve una evaluación de horario que parezca disponible; responde 503. `ENABLED` y `MANUAL_APPROVAL` conservan la evaluación normal.
- La prueba PostgreSQL existente ahora comprueba evaluación pública bloqueada tanto con `PAUSED` como con `DISABLED`, además de probar el envío y la serialización con una pausa concurrente. Suite backend completa: 234 pruebas, 0 fallos, 0 errores, 0 omitidas; PostgreSQL 18/Testcontainers, Flyway V1–V39.

## 2026-10-07 — Emisión por lote de facturas de una atención

- Se agregó `POST /api/v1/operational/accounts/{accountId}/invoices/issue-drafts`, protegido con `invoices:manage`, `Idempotency-Key` y `X-Request-Id` opcional. Encola en una sola transacción todos los borradores `DRAFT` de la atención en el outbox existente y devuelve el estado detallado de cada factura.
- Los DTE siguen procesándose individualmente por el worker existente. Facturas `QUEUED`, `ISSUED` o `FAILED` no se vuelven a encolar por la operación masiva; repetir la clave devuelve el estado actual sin producir eventos duplicados. La operación serializa por atención.
- El endpoint individual usa el mismo orden de bloqueo (cuenta y luego factura) para evitar inversión de locks al competir con la emisión masiva.
- `InvoiceIntegrationTest`: 8/8 pasó con PostgreSQL 18/Testcontainers y Flyway V1–V41. Incluye permisos, varios borradores, una factura previamente encolada, conteo de outbox y replay idempotente sin eventos duplicados. La vista Operativa que consume este flujo aún debe integrarse desde frontend.

## 2026-10-07 — Pausa de servicio respetada al aceptar solicitudes pendientes

- La aceptación Operativa de pickup/delivery ahora vuelve a leer y bloquear en modo compartido la capability efectiva. Si fue pausada/deshabilitada después de que el Cliente envió la solicitud, responde 503 y mantiene la solicitud en `PENDING_REVIEW`, sin crear pedido ni comanda; `MANUAL_APPROVAL` permite continuar cuando se atienda manualmente.
- Esto alinea la decisión final con los gates existentes al enviar. El bloqueo compartido serializa la aceptación con una actualización administrativa concurrente del estado del servicio.
- `OrderRequestDecisionIntegrationTest` verifica pausa, ausencia de side effects y aceptación posterior al reanudar. Suite focal y suite backend completa pasan con PostgreSQL 18/Testcontainers y Flyway V1–V41: 245 pruebas, 0 fallos, 0 errores y 0 omitidas.

## 2026-10-07 — Las recetas pendientes no consumen inventario

- El BOM de un producto de menú se considera inventario operativo sólo cuando `menu_items.recipe_status = ACTIVE`. Guardar componentes en `PENDING_DATA`, `DRAFT` o `ARCHIVED` ya no vuelve el producto rastreado ni crea reservas en pedidos; el endpoint de disponibilidad también responde `NOT_TRACKED` hasta la activación.
- `PUT /api/v1/operational/inventory/items/{itemId}/recipe` admite `recipeStatus` para productos del menú. Omitirlo conserva el estado; activar requiere una lista no vacía de componentes existentes y rastreados. La transición se audita, y el producto se bloquea de forma determinista para serializar edición/activación contra una aceptación que calcula reservas. Las recetas de subproductos fuera del menú mantienen su operación normal de producción.
- Pruebas PostgreSQL focales: `InventoryOrderIntegrationTest` 4/4, `PublicMenuAvailabilityIntegrationTest` 2/2 y `ProductionIntegrationTest` 2/2, sin fallos ni omisiones. Suite completa: 249/249, 0 fallos, 0 errores, 0 omitidas, PostgreSQL 18/Testcontainers y Flyway V1–V44.

## 2026-10-07 — Proveedor FEL fuera de transacciones SQL

- `InvoiceIssuanceWorker` ahora reclama el evento y carga el snapshot fiscal mediante transacciones breves, ejecuta `FiscalProvider.certify` sin transacción abierta y registra certificación o reintento en una transacción posterior. El UUID estable de factura sigue sirviendo para idempotencia/conciliación si el proceso cae después de certificar y antes de guardar.
- El mock FEL rechaza invocaciones que ocurren dentro de una transacción; `InvoiceIntegrationTest` lo ejecuta en el flujo real del worker.
- `InvoiceIntegrationTest`: 8/8 con PostgreSQL 18/Testcontainers y Flyway V1–V44. Suite completa: 249/249, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-07 — Creación de intentos de pago mediante outbox

- `POST /api/v1/client/delivery-requests/{id}/payment-intents` ahora guarda el intento local `CREATED` y `PAYMENT_INTENT_CREATION_REQUESTED` en una sola transacción. El worker reclama el outbox, llama `PaymentGateway` sin conexión/transacción SQL retenida, y luego persiste referencia/estado; usa el UUID estable del intento como idempotency key del proveedor.
- El adapter sólo es `MockPaymentGateway`; el Cliente puede leer `CREATED` mientras se procesa y luego `PENDING`. Fallos agotados quedan `UNKNOWN`, nunca `CAPTURED`; conciliación/webhook real sigue pendiente del proveedor autorizado. La app móvil muestra el estado inicial y consulta el endpoint actual mientras sigue `CREATED`.
- Agregada Flyway V45 para permitir referencia externa nula hasta la respuesta y optimizar polling del outbox. La prueba de integración verifica el intento y el outbox atómicos, ownership, estado inicial, creación posterior del intento mock, replay sin duplicados y ausencia de cobro/captura.
- Validación: `ClientPaymentIntentIntegrationTest` 2/2; suite backend completa 249/249, 0 fallos, 0 errores, 0 omitidas, PostgreSQL 18/Testcontainers/Flyway V1–V45. Mobile: Vitest 54/54, ESLint y TypeScript `--noEmit`.

## 2026-10-07 — Límite común para pedidos con muchos productos distintos

- La inspección posterior encontró que el antiguo máximo de 20 líneas seguía activo en los controladores pickup/delivery y en preórdenes de reserva, pese a que la matriz ya describía 100. Ahora todos esos flujos, la disponibilidad pública y las órdenes operativas comparten `RequestLimits.MAX_DISTINCT_MENU_LINES = 100`; las DTOs también aplican el mismo límite antes de entrar al caso de uso.
- Este límite sólo acota el tamaño del request. Reglas de stock y capacidad agregada siguen evaluándose en backend; la solicitud pickup/delivery continúa en revisión y la preorden no crea una orden.
- Pruebas focalizadas: `OrderRequestDecisionIntegrationTest`, `ConfiguredReservationHoursIntegrationTest` y `OperationalFlowIntegrationTest`, 33/33 con PostgreSQL 18/Testcontainers y Flyway V1–V45. Cubren 21 líneas pickup/delivery, 21 líneas de preorden sin crear pedido, 51 líneas operativas y rechazo de 101 líneas en el límite HTTP. Suite backend completa: 253/253, 0 fallos, 0 errores, 0 omitidas.

## 2026-10-07 — Cotizaciones de pickup/delivery con precio del servidor

- `POST /api/v1/client/order-quotes` crea una cotización idempotente y persistida por 12 minutos con subtotal GTQ, snapshots de nombres, precios y modificadores, y tiempo de preparación calculado por backend. `GET /{quoteId}` sólo permite leerla a su Cliente y marca vencimiento observado.
- Pickup/delivery aceptan opcionalmente `X-Order-Quote-Id`. Cuando se usa, el backend verifica ownership, vigencia, modalidad, horario, productos/opciones/cantidades y subtotal vigente; una diferencia responde 409 antes de dejar solicitud persistida. Una cotización compatible se consume atómicamente al crear la solicitud, que continúa `PENDING_REVIEW`.
- La cotización reutiliza la estimación de inventario existente; no reserva stock ni capacidad, no proporciona cola/ETA garantizada, no acepta pedidos ni procesa pagos. La aceptación operativa conserva la revalidación final. Expo ya usa cotización y confirmación en pickup/delivery; el hold real queda pendiente de fuentes de capacidad persistidas.
- `ClientOrderQuoteIntegrationTest` cubre precio calculado en servidor, snapshot, idempotencia, ownership, consumo en solicitud pendiente y rechazo al cambiar el precio. Pruebas focalizadas: 18/18 y Flyway V1–V46 aplicado desde esquema vacío. Suite completa: 257 ejecutadas, 0 fallidas, 0 errores, 128 omitidas por falta de acceso al socket Docker que requieren las pruebas Testcontainers; Maven necesita `-DargLine=-javaagent:...byte-buddy-agent...jar` en este entorno para inicializar Mockito.

## 2026-10-07 — Quote ETA separado por estación

- V47 agrega al snapshot persistido `queue_delay_seconds` y `total_eta_seconds`. El quote agrupa preparación por área y consulta la cola activa bajo locks de estación ordenados; reporta el cuello de botella entre estaciones, separando demora de cola, preparación y ETA total. Estos valores son estimaciones sujetas a cambios en cocina.
- Pickup y delivery muestran los tres valores estimados. No se reserva esa capacidad durante la cotización y el equipo debe reevaluar al aceptar.
- `ClientOrderQuoteIntegrationTest`: 4/4 pasa con Testcontainers PostgreSQL, Flyway V1–V47 aplicado desde esquema vacío. `KitchenQueueEstimatorTest`: 1/1. Suite backend completa posterior a V47: 258/258, 0 fallidas, 0 errores, 0 omitidas; incluye los tests PostgreSQL/Testcontainers. Para Mockito en este JDK se ejecutó con `-DargLine=-javaagent:<byte-buddy-agent-1.18.11.jar>`.

## 2026-10-07 — Componentes preliminares medidos para bebidas

- El seed idempotente de catálogo agrega siete insumos de bebidas sin saldos y 15 componentes de receta conocidos para Matcha Latte, Matcha Kiwi, Matcha Maracuyá, Blue Matcha y Carbonatada. La lata de agua mineral queda como una unidad completa; volúmenes se normalizan a mililitros con `FL_OZ=29.573530 ML` y masas permanecen en gramos.
- Las recetas del menú permanecen `PENDING_DATA`; reservas y consumo de pedidos sólo usan recetas `ACTIVE`. Los modificadores Kiwi/Maracuyá de Carbonatada conservan su componente conocido de 2 oz como impacto no operativo (`affects_availability=false`) porque el modelo sólo soporta impactos operativos de modificador, no una receta variante en borrador.
- El endulzante de 2 oz queda pendiente de confirmar como medida por peso o volumen. Se documenta la proporción del jarabe simple 1:1 por peso y el ejemplo de 70 oz + 70 oz, con rendimiento `TO_MEASURE`; no se crean componentes de tanda ni se descuentan azúcar y jarabe a la vez. Hielo para completar tampoco recibe cantidad inventada.
- `RealMenuSeedIntegrationTest`: 1/1 pasó contra PostgreSQL 18/Testcontainers, aplicando las 48 migraciones desde una base vacía. Comprueba repetición idempotente, medidas preliminares, recetas no activas, y ausencia de inventario/reservas iniciales.
- Compatibilidad al re-ejecutar: el seed actualiza `FL_OZ.factor_to_base` al factor confirmado (29.573530 ml), incluso si el valor anterior quedó en 1; la integración reproduce ese estado previo y valida su corrección.

## 2026-10-07 — Correlación de auditoría en cambios de roles

- `PUT /api/v1/admin/users/{userId}/roles/{roleCode}` ahora conserva el `X-Request-Id` opcional en el evento de auditoría `USER_ROLE_GRANT/REVOKE`; cuando el cliente no envía ID, el backend genera uno y lo persiste. Se mantienen `expectedVersion`, motivo y autorización ADMIN.
- `RoleAuthorizationIntegrationTest`: comprueba grant con ID del cliente y revoke sin header; ambos dejan actor/solicitud auditados. Focal: 8/8 pruebas con PostgreSQL 18/Testcontainers y Flyway V1–V48.

## 2026-10-07 — Ownership del tracking de pedidos Cliente

- Se agregó prueba de integración PostgreSQL que crea dos clientes con pedidos pickup aceptados y comprueba que `/api/v1/client/orders/tracking` devuelve únicamente el pedido del usuario autenticado, aunque exista un segundo pedido válido en la base.
- Prueba focal: `ClientOrderTrackingOwnershipIntegrationTest`, PostgreSQL 18/Testcontainers y Flyway V1–V48. La consulta ya restringía por `customer_user_id`; esta prueba verifica el comportamiento completo mediante HTTP y la base real.
- El endpoint de solicitudes de cambio también se probó con propiedades manipuladas `status=PAID` y `orderStatus=READY`: la solicitud queda en `PENDING_REVIEW` y pedido/solicitud conservan sus estados autoritativos. `ClientOrderChangeRequestIntegrationTest`: 4/4 con PostgreSQL 18/Testcontainers.

## 2026-10-07 — Revalidación de capacidad al aceptar solicitudes

- La aceptación Operativa vuelve a validar el horario semanal/excepción diaria del servicio y estima carga de cocina bajo locks estables. Excluye únicamente el hold de la solicitud en evaluación para no contarlo dos veces, e incluye los demás holds vigentes de la misma fecha/hora.
- Si aparece un cierre especial o el ETA ya no cabe antes del horario pedido, la aceptación responde con conflicto/regla de negocio, conserva la solicitud pendiente y no crea pedido. `OrderRequestDecisionIntegrationTest` cubre el cierre diario y la cola; `ClientOrderQuoteIntegrationTest` cubre hold vencido más carga de otra solicitud. Suite completa: 265/265, cero fallos, errores u omitidas, PostgreSQL 18/Testcontainers y Flyway V1–V48.

## 2026-10-07 — Correlación en liquidación de efectivo courier

- El movimiento de venta y la auditoría conservan el `X-Request-Id` de liquidación. La propina usa un UUID determinista derivado (`<request-id>:courier-tip`) para respetar la restricción DB de unicidad por movimiento y mantener una relación reproducible con la solicitud.
- `PaymentIntegrationTest` verifica ambos identificadores correlacionados y que la repetición idempotente no duplica movimientos.

## 2026-10-07 — Edición controlada de borradores FEL

- `PATCH /api/v1/operational/invoices/{invoiceId}` permite corregir receptor y monto sólo mientras la factura siga `DRAFT`. Requiere `expectedVersion` y `Idempotency-Key`, vuelve a validar el monto contra el pool libre de la atención bajo lock, recalcula subtotal/impuesto y reconstruye las líneas con el snapshot de consumo cuando corresponde.
- Las facturas `QUEUED`/`ISSUED` no se editan en esta ruta. Cambios registran before/after y `X-Request-Id`; la versión se expone en el DTO para que el cliente pueda detectar ediciones concurrentes.
- `InvoiceIntegrationTest` cubre edición, replay idempotente, límite fiscal, conflicto de versión, bloqueo posterior a emisión y auditoría en PostgreSQL 18/Testcontainers. Suite backend: 266 pruebas, 0 fallos/errores/omitidas; Flyway V1–V48.

## 2026-10-07 — Conciliación de resultado FEL incierto

- Flyway V49 permite estado `UNKNOWN`. Un timeout, pérdida de conexión u otra excepción no clasificada del proveedor ya no provoca reintento automático: se detiene/publica ese evento, conserva la asignación del monto al pool fiscal y audita `INVOICE_OUTCOME_UNKNOWN`. Reintentos sólo se realizan para `RetryableException`, que el adapter debe reservar para casos que garantiza que no fueron aceptados; rechazos definitivos van a `FAILED`.
- `POST /api/v1/operational/invoices/{id}/reconcile` exige `invoices:manage`, `Idempotency-Key`, razón y referencia de consulta. Registra la confirmación humana obtenida en el portal/proveedor: `CONFIRMED_CERTIFIED` guarda los datos del DTE como emitido; `CONFIRMED_NOT_CERTIFIED` conserva evidencia/referencia auditada y crea un nuevo outbox para reintentar. No simula consulta automática del certificador.
- `InvoiceUnknownOutcomeIntegrationTest` prueba timeout → UNKNOWN sin retry, los dos desenlaces manuales, reencolado tras confirmación negativa e idempotencia/rastro de auditoría. Suite completa: 268 pruebas, 0 fallos/errores/omitidas; PostgreSQL 18 aplica Flyway V1–V49.
- Los fallos inesperados siguen registrándose sólo por clase de excepción; no se emite mensaje ni stacktrace potencialmente sensible a logs.

## 2026-10-07 — Resumen de propina courier en cierre de caja

- El resumen `CashBreakdown` ahora atribuye propinas de courier a la sesión de caja donde se liquidaron (`courier_cash_collections.settled_cash_session_id`). Antes el movimiento se contaba como `otherIncome`, porque el pago original nunca pertenece a una caja al quedar en custodia del repartidor.
- La prueba `PaymentIntegrationTest.courierCashIsReceivableUntilIdempotentlySettledIntoRegister` verifica que Q5 se muestra como propina, Q0 como otro ingreso y el efectivo esperado conserva Q135. Prueba focal PostgreSQL 18/Testcontainers + Flyway V1–V49.

## 2026-10-07 — Respuesta HTTP correcta para rutas inexistentes

- `ApiErrorHandler` ahora traduce `NoResourceFoundException` a HTTP 404 con el mensaje neutral `No encontramos el recurso solicitado.`. Antes el handler genérico devolvía 500 y registraba una ruta inválida como fallo interno.
- `ApiErrorHandlerTest` verifica el status y mensaje sin exponer detalles del framework. Esto no corrige una ruta faltante del servidor desplegado: la comprobación de `/api/v1/public/service-hours` encontró que el contenedor activo se construyó desde `integration-review` y no reconoce ese controller; la ruta de la rama backend requiere `serviceType`, `from` y `to`.
