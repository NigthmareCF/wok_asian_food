# Database progress

## 2026-10-07 — Temporary remote order capacity holds

- V48 adds `order_capacity_holds` and `order_capacity_hold_stations`, keyed to the consumed quote and pending request, with a bounded lifecycle (`ACTIVE`, `RELEASED`, `CONVERTED`, `EXPIRED`), expiry index, station foreign keys and positive preparation allocation checks.
- The migration is verified by the Spring/Testcontainers backend suite from an empty PostgreSQL 18 database. The wider candidate 128-table model/ERD remains unreconciled; V48 extends the executable migration stream without claiming the candidate artifacts are final.

## 2026-09-30 — Customer App messaging foundation

- V10 adds persistent `conversations` and `messages` following the messaging candidate: owner customer, APP channel, human handling mode, message direction/status, timestamps, and external-thread fields for later provider adapters.
- Local app conversations enforce one active thread per customer; message idempotency keys prevent duplicate submissions. Checks reject blank/oversized bodies, invalid direction, and inconsistent sender identity. No Meta/AI provider or automatic reply is claimed.
- PostgreSQL 18 empty-database run applied V1–V10 in numeric order; `V10_app_messaging.sql` passed duplicate-thread, duplicate-idempotency-key and direction checks and rolled back fixture rows. Temporary DB was removed.
- The 128-table candidate model remains unreconciled. In particular, reconcile the new APP channel and idempotency field before treating candidate ERD/DDL as final.

## 2026-09-29 — Client reservation history snapshot

- V7 adds `requested_for_at` and `party_size` to `reservation_evaluations`, backfills them from reservations that already exist, and adds a size constraint plus an index for recent per-user history.
- Added `database/tests/V7_reservation_request_history.sql` to verify rejected evaluations retain request data without creating a reservation and invalid party sizes are rejected.
- Dependency: `feature/reservations` will persist both fields and expose authenticated history. Apply V7 before deploying that API.
- Flyway applied V1–V7 from empty schema on PostgreSQL 18. SQL suites `V1_constraints`, `V3_reservations`, `V4_hours`, `V5_reservation_request_idempotency`, `V6_cash_sessions_and_movements` and `V7_reservation_request_history` all passed and rolled back test data.
- Updated the V5 SQL test to write the V7 request snapshot while continuing to verify its idempotency and occupancy constraints against the latest schema.
- Candidate model/DDL/dictionary/ERD reconciliation and full historical upgrade-path testing remain open; this slice does not resolve those project-wide findings.

## 2026-09-28 — PostgreSQL migration smoke test

- Validated `feature/database-migrations` in a disposable PostgreSQL 18 container.
- Applied Flyway scripts V1 through V6 in order on an empty database; all completed successfully with `ON_ERROR_STOP` enabled.
- Executed `V1_constraints.sql`, `V3_reservations.sql`, `V4_hours.sql`, `V5_reservation_request_idempotency.sql`, and `V6_cash_sessions_and_movements.sql`; all completed successfully and rolled back their test data where applicable.
- Removed the temporary container after validation. No project database, credentials, or repository secrets were used.
- This verifies migration execution and the available SQL checks only. The model/SQL/dictionary/ERD reconciliation, full business-rule coverage, and migration upgrade-path testing remain open.
# Progreso de base de datos

## 2026-10-05 — Snapshots de preorden en reservas (V38)

- V38 agrega las líneas de productos/opciones solicitadas a la evaluación idempotente de reserva; conserva nombre, cantidad, precio, moneda y modificadores como snapshot.
- No se crea orden, movimiento de inventario ni reserva de stock. Las líneas se mantienen asociadas al request para que la agenda Operativa las muestre junto con la reserva pendiente.
- Migración V1–V38 aplicada desde esquema vacío y flujo HTTP/agenda probado en PostgreSQL 18/Testcontainers dentro de `ConfiguredReservationHoursIntegrationTest`. Suite backend completa: 225/225, sin fallos, errores ni omitidas.

## 2026-09-30 — Libreta de direcciones Cliente

- V12 crea `customer_addresses` asociada al usuario Cliente, con etiqueta única por cuenta, referencia/teléfono validados, versión de actualización y máximo un registro default por cuenta.
- PostgreSQL 18 aplicó V1–V12 desde cero y pasó `V12_customer_delivery_addresses.sql`: inserción válida, segundo default/etiqueta duplicada y teléfono inválido rechazados. Contenedor temporal eliminado.
- No incluye geocoding, tarifa, share entre personas ni política de retención/eliminación de PII.

## 2026-09-30 — Direcciones guardadas por Cliente

- V12 agrega `customer_addresses`, con ownership explícito por `customer_user_id`, etiqueta única por cliente, validación de dirección/contacto/referencia y máximo una dirección marcada por defecto.
- La tabla no integra acceso de staff, geocoding, navegación ni uso compartido entre perfiles. Requiere política de retención/eliminación de PII antes de producción.
- Test SQL cubre inserción válida, único default, etiqueta duplicada y teléfono inválido; ejecutar sobre V1–V12.

## 2026-09-30 — Solicitudes de delivery

- V11 permite `fulfillment_type=DELIVERY` en la bandeja común de solicitudes y persiste dirección, referencia, teléfono y preferencia de pago. Checks requieren dirección/contacto/preferencia para delivery y prohíben dichos campos en pickup.
- `ONLINE_PAYMENT_REQUESTED` no representa autorización/captura. Solicitud sigue `PENDING_REVIEW`; aún faltan cobertura geográfica, tarifa, regla de retención de PII y aceptación operacional.
- PostgreSQL 18 aplicó V1–V11 desde cero y pasó el test V11 que acepta delivery válido y rechaza falta de datos (incluida la preferencia) o delivery fields en pickup; el contenedor se retiró. Maven backend compuesto con los tres slices pasó 41/41.

## 2026-09-30 — Campos seguros de solicitudes delivery pendientes

- V11 extiende `order_requests` para `DELIVERY` con dirección, referencia, contacto telefónico y preferencia (`CASH_ON_DELIVERY` o `ONLINE_PAYMENT_REQUESTED`). Las restricciones exigen datos de entrega y prohíben que pickup guarde esos campos.
- `ONLINE_PAYMENT_REQUESTED` sólo expresa una preferencia, no crea intención ni confirma pago. Todas las solicitudes siguen `PENDING_REVIEW`; cobertura, horario, carga, existencia de orden, tarifa y pago requieren implementación/verificación posterior.
- `V11_delivery_requests.sql` prueba una solicitud válida y rechaza datos ausentes y contaminación de pickup. Requiere PostgreSQL V1–V11 en orden.
- Pendiente: política de retención de dirección/teléfono y contrato de decisión Operativo antes de aceptar entrega.

## 2026-09-29 — Fundamento ejecutable de catálogo

- `V8__catalog_foundation.sql` agrega tablas de tipos de artículo, unidades, artículos, áreas de preparación, categorías, grupos/opciones de modificadores y ofertas del menú; incluye llaves foráneas, checks e índices para lectura ordenada.
- `V8_catalog.sql` valida inserción relacionada y rechaza precio negativo y límites de selección inválidos.
- Verificación real: PostgreSQL 18 desechable, base vacía y aplicación secuencial de V1–V8; prueba V8 completada y transacción revertida. No se incorporaron productos, recetas ni credenciales de demostración.
- Alcance: es un primer corte ejecutable, no una reconciliación del modelo candidato de 128 tablas. No incluye `recipe_version_id` en `menu_items` porque las migraciones V1–V7 aún no definen `recipe_versions`; resolver esa divergencia al integrar `feature/database-schema` y la porción de recetas.
- Próximo dependiente: desarrollar lectura pública de menú en `feature/backend-api` usando sólo elementos `PUBLIC`/`ACTIVE` y sin afirmar disponibilidad de inventario hasta que exista el slice de disponibilidad.

## 2026-09-29 — Solicitudes de pickup separadas de órdenes

- V9 agrega `order_requests`, `order_request_items` y `order_request_events`. Una solicitud nace `PENDING_REVIEW`, tiene idempotencia por cliente/clave, fingerprint, precios/nombres congelados por línea y cola para decisión operativa.
- La estructura no crea una orden aceptada ni reserva inventario; el personal debe revalidar horario, capacidad, stock y precio antes de aceptar, siguiendo la regla del mega prompt. En esta primera migración sólo se habilita modalidad `PICKUP`; no implica delivery, mesa ni pago.
- Prueba V9 valida líneas/huella, unicidad de idempotencia y rechaza cantidad cero. Flyway V1–V9 ejecutó sobre PostgreSQL 18 recién inicializado; V8 y V9 SQL tests aprobaron.
- La tabla candidate `orders` no expresa suficientemente la solicitud pendiente separada. Esta decisión sigue la jerarquía nueva del requisito explícito; reconciliar `database/design/model.json`, ERD y diccionario antes de presentar el modelo completo como definitivo.
