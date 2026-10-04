# Progreso de planificación backend

## 2026-10-04 — Preferencias de pago y factura en solicitudes Cliente

- Migración Flyway `V25__order_request_payment_and_invoice_preferences.sql`: añade a `wok.order_requests` la solicitud de factura y su snapshot (`invoice_name`, `invoice_tax_id`), y permite registrar para pickup efectivo/tarjeta/transferencia al recoger. No crea pagos ni facturas FEL.
- Pickup y delivery aceptan los datos de facturación solicitados, los normalizan, incorporan al fingerprint idempotente y los devuelven sólo en recursos propios del Cliente. Los datos fiscales se limitan a nombre (150) y NIT (32), en línea con la entidad de factura existente.
- La cola Operativa (`orders:manage`) sólo ve `invoiceRequested`; endpoint separado `GET /api/v1/operational/order-requests/{id}/invoice-request` requiere `invoices:manage` para revelar nombre/NIT.
- Límites preservados: `ONLINE_PAYMENT_REQUESTED` sólo expresa preferencia; la solicitud permanece pendiente de revisión, no cobra ni emite FEL. Delivery aún no se puede aceptar como pedido desde el flujo Operativo.
- Verificación: Testcontainers PostgreSQL 18 aplicó V1–V25 desde esquema vacío. Suite completa `sh mvnw -q test`: 146 pruebas, 0 fallos, 0 errores, 0 omitidas. Integración prueba persistencia pickup/delivery, que no se crea factura al solicitarla, y separación de permisos entre `orders:manage`/`invoices:manage`.

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

## 2026-10-04 — Seguimiento de pickup aceptado para Cliente

- En `feature/backend-capacity-order-lifecycle` se añadió `GET /api/v1/client/orders/tracking`, protegido para rol `CLIENT`. La consulta devuelve como máximo 50 solicitudes pickup aceptadas con pedido asociado y filtra siempre por el UUID del usuario autenticado; no acepta identificadores de cliente suministrados por el navegador.
- La respuesta expone código y estado del pedido, horario solicitado, última actualización y ETA máxima de los tickets activos sólo cuando el pedido está `SENT` o `PREPARING`. Los estados finales no publican ETA. No requiere migración: reutiliza `order_requests.order_id`, `orders` y `kitchen_tickets` de V9, V13 y V16.
- Prueba unitaria del controlador valida el filtro de ownership, el estado aceptado y la proyección del ETA. `sh mvnw -q -DargLine=-javaagent:... -Dtest=ClientOrderTrackingControllerTest test` pasó (2 pruebas). Suite backend completa: 139 pruebas, 0 fallos/errores, 49 omitidas porque Docker no está accesible para Testcontainers.
- Dependencia externa/red: el fetch SSH falla por permisos de `/etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`; el fetch HTTPS dentro del sandbox no resuelve `github.com`. Con acceso de red elevado se actualizó `origin/*`; `feature/backend-capacity-order-lifecycle` es local y parte de `origin/development`, que no presentó commits nuevos respecto a su base. Esta rama aún no se ha publicado.
- Límites: el backend sólo permite aceptar solicitudes pickup en el flujo operativo actual; el seguimiento no convierte solicitudes delivery en pedidos ni marca pagos. Falta prueba integrada contra PostgreSQL y prueba HTTP con autenticación real.

## 2026-10-04 — Evaluación Flyway/Liquibase

- Se documentó en `docs/database/MIGRATION_TOOL_ASSESSMENT.md` la compatibilidad, diferencias funcionales, estrategia de baseline, riesgos, pasos de validación y estimación orientativa. Con PostgreSQL único y 24 migraciones SQL activas, recomendación actual: conservar Flyway. Evaluación únicamente; no se cambió Maven, configuración ni el historial de ninguna base.

## 2026-10-04 — Cola Operativa para solicitudes pickup/delivery

- `GET /api/v1/operational/order-requests` lista hasta 100 solicitudes y permite filtrar `status` y `fulfillmentType`; sin filtros muestra primero las pendientes. `GET /api/v1/operational/order-requests/{requestId}` devuelve snapshot de cliente/modalidad/contacto/horario/importe/notas y líneas guardadas, incluyendo dirección y referencia para delivery.
- Ambos endpoints exigen `orders:manage`, validan filtros contra listas permitidas y no reciben IDs de usuario para ampliar alcance. Se añadió prueba HTTP/PostgreSQL para filtro, detalle delivery, items, rol Cliente prohibido y filtro inválido.
- La rama contiene explícitamente el límite previo: aceptar una solicitud DELIVERY sigue respondiendo 422; consulta del Operativo no equivale a soporte de reparto, autorización contra entrega o cobro externo.
- PostgreSQL 18 aplicó Flyway V1–V24 en la prueba efímera. Clase focal: 5/5 pruebas; suite completa: 140 pruebas, 0 fallos, 0 errores, 0 omitidas. Docker/Testcontainers disponible en la corrida con acceso elevado.
