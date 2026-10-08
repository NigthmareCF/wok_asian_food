# Progreso del canal Operativo

## 2026-10-04 — Solicitudes reales, permisos y continuidad Cliente

- La navegación operativa y administrativa filtra con los permisos reales emitidos por la API; una sesión renovada muestra todos los módulos autorizados.
- El menú autenticado se movió a `/client/menu` y conserva el shell del Cliente en carrito, reservas, pedidos y checkout.
- El checkout para recoger propone una hora de Guatemala dentro de las próximas tres horas, respetando servicio, preparación y diez minutos de revisión operativa.
- `/operation/online-requests` lista solicitudes persistidas y permite aceptarlas o rechazarlas; aceptar crea la orden y la comanda correspondiente.
- Verificación manual completa: solicitud Cliente `7d0354a0-fc32-4910-861c-5aff74b275a8`, orden `ORD-20261004-0003` y comanda visible en Cocina.
- Verificación automática: API 147 pruebas; Web 424 pruebas; lint, TypeScript y build de producción aprobados.

## 2026-10-04 — Listado y detalle de pedidos persistidos

- `/operation/orders` y `/operation/orders/[orderId]` dejan de consultar el proveedor local: cargan pedidos, líneas y comandas mediante BFF autenticado, con búsqueda y filtros locales sobre la respuesta validada.
- El detalle permite transiciones reales `READY → SERVED → CLOSED` y anulación de pedidos activos mediante versión esperada y `X-Request-Id`. Los conflictos se muestran sin sobrescribir estado ajeno y la vista recarga desde servidor.
- La entrada principal para crear pedidos apunta a Mesas. El constructor consume el menú real y crea órdenes con `Idempotency-Key`; desde el detalle también agrega únicamente líneas nuevas y las envía a Cocina sin duplicar las anteriores.
- Pendiente: varias cuentas, uniones y modificación/eliminación de líneas ya enviadas requieren contratos backend adicionales. Se añadieron doce pruebas enfocadas para contratos, aislamiento de sesión, creación, ampliación, filtros, detalle, transición y rechazo de payload inválido.

## 2026-10-04 — Cocina conectada a comandas persistidas

- `/operation/kitchen` deja de usar el proveedor local de pedidos y consulta la cola autenticada de Cocina mediante BFF. La vista conserva el tablero responsivo, muestra productos, notas, modalidad y estación reales, y permite tomar, retomar o marcar lista una comanda.
- La API amplía `TicketView` con los artículos ligados a cada ticket sin exponer precios ni datos innecesarios. Las transiciones conservan `X-Request-Id`, versión esperada, permisos `kitchen:manage`, historial y actualización de la orden cuando todas las estaciones terminan.
- Se agregan validadores de contrato y BFF para listado, toma y cambio de estado. Los errores de sesión, permisos, conflicto y respuesta inválida se convierten en mensajes controlados sin filtrar detalles internos.
- Verificación local: TypeScript, lint, build de producción y 398/398 pruebas web aprobadas. Maven compiló y ejecutó 144 pruebas sin fallos; 49 pruebas de integración PostgreSQL quedaron omitidas porque Testcontainers no tuvo acceso a Docker en este entorno y deberán ejecutarse en CI.
- Se actualiza `docs/project/INTEGRATION_STATUS.md` para distinguir módulos persistidos, integración parcial y vistas demostrativas.

## 2026-10-03 — Mesas operativas conectadas

- `/operation/tables` y `/operation/tables/[tableId]` consumen el listado real de Mesas y permiten crear, abrir y cerrar mesas. Cada mutación envía `X-Request-Id`, bloquea doble envío y recarga el listado; los conflictos `404` y `409` informan y recargan antes de continuar.
- Se agregaron exclusivamente `GET/POST /bff/operational/tables`, `POST /bff/operational/tables/:tableId/open` y `POST /bff/operational/tables/:tableId/close`, con sesión, validación de contrato y transporte común.
- La vista muestra sólo campos del DTO real: identificación, nombre, capacidad, zona, actividad, estado, versión, actualización y cuenta abierta. Unión/separación, reserva, traslado, cobro/división, limpieza a libre y atención presencial permanecen deshabilitados porque no tienen API.

## 2026-10-03 — Validación HTTP/BFF real de reservas operativas

- Se levantó un entorno Docker aislado y desechable con PostgreSQL, API, Web, Nginx y Mailpit; se aplicaron las migraciones V1–V14.
- Cliente temporal y Operativo demo autenticaron correctamente. Una reserva confirmada apareció como `CONFIRMED` en el historial Cliente; una reserva rechazada apareció como `CANCELLED`.
- La cola operativa finalizó sin pendientes. Un reintento de decisión obsoleta devolvió `409` y no sobrescribió la decisión existente.
- Al finalizar se eliminaron los contenedores, red y volumen de prueba. No se persistieron secretos ni se modificaron datos reales.
- La validación HTTP/BFF se completó; la revisión visual automatizada no estuvo disponible.

## 2026-10-02 — Cola operativa de decisiones de reservas

- `/operation/reservations` consume la cola autenticada de solicitudes pendientes y permite confirmar o rechazar con motivo obligatorio. Conserva la versión recibida, bloquea acciones durante el envío y recarga la cola tras una decisión o un conflicto `409`, sin sobrescribir una decisión ajena.
- Se agregaron exclusivamente los BFF `GET /bff/operational/reservations/pending` y `PUT /bff/operational/reservations/:reservationId/decision`. Ambos reenvían la sesión al backend; el segundo valida `CONFIRM|REJECT`, motivo de 3–500 caracteres, versión positiva y `X-Request-Id` UUID antes de reenviar.
- Cliente conserva su historial existente: al actualizarlo muestra el estado real `CONFIRMED` o `CANCELLED` de su consulta propia.
- Archivos principales: `apps/web/src/app/bff/operational/reservations`, `apps/web/src/modules/client-workflows/server/endpoint.ts`, `apps/web/src/modules/reservations` y la ruta operativa de Reservas.
- Pruebas: 15 pruebas enfocadas aprobadas; lint, TypeScript y build web aprobados. La suite completa terminó con 367/377 aprobadas; fallaron 10 pruebas preexistentes ajenas a Reservas en Caja, Personal, Auth, Usuarios y Administración (timeouts/aserciones de interfaz bajo ejecución paralela).
- No se modificaron backend, contratos API de backend, mesas, pedidos, cocina ni el historial Cliente. No se hicieron commits, push ni merge.

## 2026-09-29 — Historial de reservas propio para Cliente

- `GET /api/v1/client/reservations` devuelve las 50 evaluaciones más recientes ligadas exclusivamente al `requester_user_id` autenticado; no admite un ID de cliente enviado por el consumidor.
- `POST /api/v1/client/reservations` conserva `requested_for_at` y `party_size` también cuando una evaluación no crea una reserva, para que decisiones rechazadas/sugeridas aparezcan en el historial. Aplicar V7 de `feature/database-migrations` antes de desplegar este cambio.
- Las filas con reserva enlazan el estado público actual; las solicitudes pendientes/rechazadas conservan decisión y mensaje evaluado. No se exponen notas ni campos operativos.
- Evidencia: composición temporal de `feature/backend-foundation`, `feature/backend-auth`, `feature/availability`, `feature/reservations` y DB migrations compiló y pasó 8/8 tests Maven con Java 21. Smoke HTTP autenticado mostró la solicitud propia y excluyó la de otro usuario; el endpoint público tampoco incluyó `PRODUCTION`. PostgreSQL vacío aplicó V1–V7 y el test V7 pasó.

Responsables: Antony y Tomy.

Agregar aquí los avances más recientes siguiendo la plantilla de [README.md](README.md).

## 2026-09-26 — Solicitudes de reserva persistentes y revisión humana

- Rama backend: `feature/reservations`. El portal Cliente puede crear solicitudes autenticadas; la API evalúa la anticipación/capacidad y nunca las confirma automáticamente.
- Requiere `Idempotency-Key`; la misma clave y payload devuelve la solicitud existente. Si la clave se reutiliza con otro payload responde 409.
- Operativo/Admin pueden listar pendientes y confirmar o rechazar con motivo, versión esperada, historial de estado y auditoría transaccional.
- Regla mínima de 3 h aplicada al crear; resultados de evaluación quedan persistidos. Estados fuera de horario siguen requiriendo decisión explícita y capacidad en vivo aún no está conectada.
- Pruebas: Maven `verify` combinado 12/12; Flyway V1–V5 aplicado a PostgreSQL 18 vacío; recorrido HTTP registro/verificación/login, reserva, replay/mismatch 409, aprobación, conflicto de versión y auditoría pasó en DB temporal.
- No se hicieron cambios en las vistas operativas de datos simulados; integrar UI con API requiere conectar la sesión WOK y el contrato aprobado.

## 2026-09-15 — Auditoría de integración de rutas

- Operación, Mesas, Pedidos, Cocina, Reservas, Mensajes, Solicitudes, Delivery, Caja, Pagos, Inventario, Producción y Estado del servicio tienen rutas y accesos en la sidebar.
- Los formularios operativos se conservan como pendientes de ampliación.

## 2026-09-12 — Ajustes de revisión del PR #10

- Rama: `feature/operational-delivery-payments`
- Responsables: Antony y Tomy
- Asistencia: IA
- Vistas: O-03 `/operation/tables/[tableId]`; O-04 `/operation/orders/new`; O-10 `/operation/online-requests`; O-11 `/operation/delivery`; O-12 `/operation/payments`; O-16 `/operation/production`
- Completado:
  - **Cobro en mesa**: estado «Pendiente de cobro» en cuentas y mesas; modal Cobrar por cuenta o mesa completa para marcarlas y librar el flujo a Pagos; precuenta imprimible desde la mesa con desglose, propina y total; cuentas expandibles con detalle de productos y badge de cobro; la mesa no se libera hasta registrar el pago en O-12
  - **Delivery**: `createDeliveryOrder` con IDs secuenciales compartidos con Pagos; botón «Probar flujo desde cero» en el listado que crea un pedido demo y navega al detalle con su banner
  - **Nuevo pedido**: aviso desechable al cambiar el origen (canal o mesa) que vincula el restablecimiento del carrito con la desvinculación de la mesa
  - **Solicitudes en línea**: rediseño con modalidades (Delivery, Para recoger, Comer en sala, Reservación), filtros con contadores, productos solicitados, reglas de negocio locales (horario 11:00–22:00, estado del servicio y disponibilidad de mesas) con panel «No procede según las reglas actuales», aceptación por modalidad que crea pedido/delivery/reservación con vínculos visibles, revalidación de solicitudes desactualizadas, rechazo con motivo obligatorio o por reglas
  - **Pagos**: etiqueta «Exceso» ajustada a «Cambio»
  - **Producción**: sugerencias colapsables y filas con color/icono según su estado
- Archivos principales: `apps/web/src/modules/tables`, `apps/web/src/modules/orders`, `apps/web/src/modules/delivery`, `apps/web/src/modules/messaging` (incluye `online-request-rules.ts`), `apps/web/src/modules/payments`, `apps/web/src/modules/production`, `apps/web/src/data/fixtures` y estilos globales/operativos
- Pruebas: lint, TypeScript, 67 pruebas unitarias y build aprobados; reglas de solicitudes y flujos Cobrar/Precuenta/Delivery cubiertos por pruebas
- Decisiones: el cobro ya no marca como pagado en mesa: deja la mesa en «Pendiente de cobro» y el registro efectivo ocurre en O-12; cambiar el origen de un pedido vacía el carrito con aviso; las reglas de solicitudes remotas se evalúan en el cliente con datos simulados hasta el backend
- Pendiente: persistencia y autorización reales; evaluación de reglas y conflictos desde backend; realtime en solicitudes, delivery y mesas
- PR: `https://github.com/NigthmareCF/wok_asian_food/pull/10`

## 2026-09-11 — Navegación adaptable y pedidos con varias cuentas

- Rama: `feature/operational-kitchen`
- Responsables: Antony y Tomy
- Asistencia: Codex
- Vistas: shell operativo; O-03 mesas individuales y unidas; O-04 `/operation/orders/new`; O-05 detalle de pedido; O-06 `/operation/kitchen`; O-10 `/operation/online-requests`
- Completado: menú lateral contraíble con accesos identificables y ocultamiento opcional de la barra móvil; tablero de Cocina en una columna desde tablet estrecha; estados de solicitudes acompañados por iconos; apertura de cuentas en mesas individuales o unidas; toma consecutiva por cuenta y envío de una sola comanda con todos los productos de la mesa, conservando la cuenta de cada producto
- Archivos principales: `apps/web/src/shared/components/app-shell.tsx`, `apps/web/src/modules/kitchen`, `apps/web/src/modules/messaging`, `apps/web/src/modules/orders`, `apps/web/src/modules/tables`, `apps/web/src/data/fixtures/orders.ts`, `apps/web/src/app/globals.css` y `apps/web/src/app/orders.css`
- Pruebas: lint, TypeScript y 39 pruebas unitarias aprobados; menú contraído, tablero, solicitudes y constructor multicuenta revisados en navegador sin desbordamiento horizontal en escritorio
- Decisiones: guardar una cuenta conserva sus productos localmente y mueve la captura a la siguiente; Cocina recibe una sola comanda por mesa; cada producto mantiene su cuenta para resumen, edición y cobro posterior
- Pendiente: persistencia y transacciones en backend; autorización; cobro independiente por cuenta; validación visual en dispositivos físicos adicionales
- PR: Pendiente

## 2026-09-11 — Reservaciones, mensajes y solicitudes en línea

- Rama: `feature/operational-kitchen`
- Responsables: Antony y Tomy
- Asistencia: Codex
- Vistas: O-07 `/operation/reservations`; O-08 `/operation/reservations/new` y `/operation/reservations/[reservationId]`; O-09 `/operation/messages`; O-10 `/operation/online-requests`
- Completado: agenda por día, semana y mes con búsqueda y estados; alta, edición, asignación sugerida de mesa, detección de conflicto y confirmación humana; bandeja de mensajes por estado con toma, respuesta, transferencia y contexto; revisión manual de solicitudes remotas con revalidación obligatoria, aceptación como reservación, espera y rechazo con motivo
- Archivos principales: `apps/web/src/modules/reservations`, `apps/web/src/modules/messaging`, `apps/web/src/data/fixtures/reservations.ts`, `apps/web/src/data/fixtures/messaging.ts`, rutas operativas y navegación
- Pruebas: lint, TypeScript, 37 pruebas unitarias y build del frontend web aprobados; rutas y composición visual revisadas en navegador sin desbordamiento horizontal en escritorio
- Decisiones: la atención presencial mantiene prioridad; ninguna solicitud remota se convierte automáticamente; horarios posteriores a las 21:15 requieren preorden; las acciones y datos permanecen simulados en memoria
- Pendiente: persistencia, permisos, disponibilidad y conflictos calculados por backend; integración real de canales, entrega de mensajes, auditoría y sincronización en tiempo real
- PR: Pendiente

## 2026-09-11 — Cuenta de mesa, división y productos para llevar

- Rama: `feature/operational-kitchen`
- Responsables: Antony y Tomy
- Asistencia: Codex
- Vistas: O-03 `/operation/tables/[tableId]`; O-04 `/operation/orders/new`; O-05 `/operation/orders/[orderId]`; O-06 `/operation/kitchen`
- Completado: vinculación de las comandas con su mesa de origen; resumen de productos, comandas y saldo pendiente al volver a la mesa; apertura de varias cuentas con nombre antes de pedir; asociación de cada comanda con su cuenta; incorporación de productos para llevar tanto en una comanda nueva como en una actualización, con hora opcional e indicaciones; identificación de estos productos en Pedido, Mesa y Cocina
- Archivos principales: `apps/web/src/modules/tables`, `apps/web/src/modules/orders`, `apps/web/src/modules/kitchen`, `apps/web/src/data/fixtures/orders.ts`, `apps/web/src/app/globals.css` y `apps/web/src/app/orders.css`
- Pruebas: lint, TypeScript, 32 pruebas unitarias y build del frontend web aprobados; revisión visual en escritorio y 390 px
- Decisiones: las cuentas se abren desde la mesa antes de registrar productos y Pagos O-12 realizará el cobro por cuenta; dividir una cuenta existente queda para una etapa posterior; los cambios viven en memoria durante la navegación y se reinician al recargar
- Pendiente: división posterior de una cuenta ya creada; persistencia y permisos en backend; cobrar cada cuenta desde O-12; calcular ETA según carga operativa, permitir ajuste manual y notificar el nuevo tiempo al portal del cliente mediante realtime
- PR: Pendiente

## 2026-09-10 — Actualizaciones de comanda y tablero de Cocina

- Rama: `feature/operational-kitchen`
- Responsables: Antony y Tomy
- Asistencia: Codex
- Vistas: O-05 `/operation/orders/[orderId]`; O-06 `/operation/kitchen`
- Completado: conservación automática de la mesa de origen al crear una comanda; incorporación de productos a pedidos existentes con modificadores y notas; cálculo y envío de cambios incrementales sin duplicar la comanda; trazabilidad de productos agregados, modificados o retirados; KDS responsive por estado y estación; aceptación de comandas, cambio de ETA, marcado como listo, acceso al detalle y simulación de reconexión
- Archivos principales: `apps/web/src/modules/orders`, `apps/web/src/modules/kitchen`, `apps/web/src/data/fixtures/orders.ts`, `apps/web/src/app/orders.css` y la ruta de Cocina
- Pruebas: lint, TypeScript, 28 pruebas unitarias y build del frontend web
- Decisiones: Cocina controla los estados de preparación y listo; Pedidos únicamente envía la comanda inicial o sus actualizaciones; cada actualización conserva un lote diferencial en memoria
- Pendiente: persistencia, permisos reales, aceptación o rechazo individual de cambios, impresión y sincronización realtime

## 2026-09-11 — Inventario, Producción y Estado del servicio

- Rama: `feature/operational-inventory-production`
- Responsable: Tomy
- Vistas: O-15 `/operation/inventory` (listado y detalle); O-16 `/operation/production` (listado, detalle de batch y revisión de sugerencias) y `/operation/production/suggestion/[suggestionId]`; O-17 Disponibilidad integrada en inventario/producción; O-18 `/operation/status` (estado del servicio)
- Completado:
  - **Inventario**: listado con búsqueda, filtros por estado (disponible, bajo, crítico, reservado, caducado) y categoría, resumen con contadores y filas navegables; detalle con estado, resumen de stock disponible/reservado, barra de nivel con referencia al mínimo, lotes con vencimiento (próximos a vencer y vencidos), registro de entradas (cantidad, vencimiento, proveedor, costo, código de lote) y ajustes de stock (positivos o negativos con motivo).
  - **Producción**: listado con filtros por estado y categoría, resumen por estado, sugerencias pendientes con prioridad y enlace a revisión; detalle de batch con trazabilidad, resumen, reposo, completado con cantidad real y rendimiento calculado, descarte con motivo obligatorio y resumen del lote; sugerencias con aceptar/rechazar y estado visible.
  - **Estado del servicio**: selector de estado (normal, alta demanda, solo recoger, suspendidos) con motivo obligatorio y confirmación, estado actual destacado, historial de cambios y trazabilidad local.
- Archivos principales:
  - `apps/web/src/modules/inventory` (provider, listado, detalle)
  - `apps/web/src/modules/production` (provider, listado, detalle de batch, sugerencias)
  - `apps/web/src/modules/service-status` (provider, vista)
  - `apps/web/src/data/fixtures/inventory.ts`, `production.ts`
  - `apps/web/src/app/(private)/(operational)/operation/inventory`, `production`, `status`
  - `apps/web/src/app/operational-views.css` (estilos nuevos de inventario, producción y estado del servicio)
- Pruebas: lint, TypeScript, 55 pruebas unitarias conjuntas y build aprobados; rutas de detalle dinámicas (`inventory/[itemId]`, `production/[batchId]`, `production/suggestion/[suggestionId]`) compiladas; responsive por breakpoints 960/720/440px según los patrones existentes.
- Decisiones: datos simulados en memoria que se reinician al recargar; fechas de caducidad se comparan contra una referencia fija para mantener renders deterministas; O-17 no tiene página propia y se resuelve con disponible, reservado, mínimo y rendimiento; las entradas de stock se registran únicamente desde el detalle del producto (se retiró el botón "Nueva entrada" del listado, cuyo destino no existe).
- Pendiente: persistencia real, permisos backend, sincronización con pedidos/cocina, impresión, alertas por mínimos y caducidad.
- PR: `https://github.com/NigthmareCF/wok_asian_food/pull/10`

## 2026-09-10 — Delivery, Pagos, Precuenta y Caja (Bloque 1 Tomy)

- Rama: `feature/operational-delivery-payments`
- Responsable: Tomy
- Asistencia: Codex
- Vistas: O-11 `/operation/delivery` (listado y detalle); O-12 `/operation/payments` (listado, detalle y precuenta); O-13 Precuenta integrada en `/operation/payments/[recordId]/prebill`; O-14 `/operation/cash`
- Completado:
  - **Delivery**: listado con filtros por estado (esperando, asignado, en camino, entregado, reprogramado, cancelado), búsqueda, resumen de pendientes de pago; detalle con asignación de repartidor, avance de estado (recogido, entregado), reprogramación, cancelación, trazabilidad y datos de conductor/vehículo.
  - **Pagos**: listado con filtros por estado (pendiente, parcial, pagado, diferencia), búsqueda, resumen de montos pendientes; detalle con registro de pagos por método (efectivo, tarjeta, transferencia, online), aplicación de propinas y descuentos, historial de cobros y trazabilidad.
  - **Precuenta**: vista dedicada con desglose de productos, subtotal, propina sugerida (checkbox), descuentos, total, desglose por método de pago y confirmación de impresión.
  - **Caja**: resumen de turno (fondo inicial, ingresos, gastos, retiros, depósitos, esperado vs contado, diferencia); registro de movimientos por tipo (ingreso, gasto, retiro, depósito) con categorías; cierre de caja con conteo físico, diferencia calculada y observaciones; confirmaciones visibles para acciones financieras.
- Archivos principales:
  - `apps/web/src/modules/delivery` (provider, listado, detalle, fixtures)
  - `apps/web/src/modules/payments` (provider, listado, detalle, precuenta, fixtures)
  - `apps/web/src/modules/cash` (provider, vista, fixtures)
  - `apps/web/src/data/fixtures/delivery.ts`, `payments.ts`, `cash.ts`
  - `apps/web/src/app/(private)/(operational)/operation/delivery`, `payments`, `cash`
- Pruebas: lint, TypeScript, 55 pruebas unitarias conjuntas y build aprobados; revisión visual en escritorio (1440px) y móvil (390px); sin desbordamiento horizontal; estados vacío, carga y error cubiertos.
- Decisiones: datos y permisos simulados en memoria; repartidores y movimientos de caja se reinician al recargar; precuenta no es documento fiscal; pagos y delivery integrados con pedidos existentes mediante IDs compartidos.
- Pendiente: persistencia real, permisos backend, sincronización con cocina/inventario, impresión real, notificaciones push a repartidor, conciliación bancaria.
- PR: `https://github.com/NigthmareCF/wok_asian_food/pull/10`

## 2026-09-10 — Creación y gestión de pedidos

- Rama: `feature/orders`
- Responsables: Antony y Tomy
- Asistencia: Codex
- Vistas: listado `/operation/orders`; O-04 `/operation/orders/new`; O-05 `/operation/orders/[orderId]`
- Completado: listado responsive con búsqueda, filtros, estados y alertas; constructor de comandas por mesa, para recoger o delivery; catálogo con disponibilidad, ETA, modificadores y notas; carrito con cantidades y total; confirmación de envío; detalle con trazabilidad, edición, actualización hacia cocina, avance de estado y anulación con motivo; las mesas unidas aparecen como un único destino y sus opciones individuales se ocultan
- Archivos principales: `apps/web/src/modules/orders`, `apps/web/src/data/fixtures/orders.ts`, `apps/web/src/app/orders.css` y `apps/web/src/app/(private)/(operational)/operation/orders`
- Pruebas: lint, TypeScript, 23 pruebas unitarias conjuntas y build aprobados; flujo principal revisado en navegador; filtro, carrito, anulación y destino de mesas unidas cubiertos por pruebas
- Decisiones: pedidos y cambios viven en memoria durante la navegación; las modificaciones posteriores al envío registran una actualización simulada; disponibilidad, precios, ETA y permisos todavía son demostrativos
- Pendiente: agregar productos a pedidos existentes y enviar únicamente los cambios nuevos a cocina; persistencia en backend, autorización real, sincronización con cocina e inventario, impresión de comanda y manejo de rechazos desde cocina
- PR: Pendiente

## 2026-09-10 — Ajustes de revisión del PR #4

- Rama: `feature/frontend-operational`
- Responsables: Antony y Tomy
- Asistencia: Codex
- Vistas: O-01 `/operation`; O-02 `/operation/tables`; O-03 `/operation/tables/[tableId]`
- Completado: unión de dos o más mesas libres y conectadas; apertura con asignación automática al usuario activo; selección de reservaciones del día desde mesas libres individuales o unidas; apertura y acceso a cuenta conjunta para uniones; trazabilidad del estado manual fuera de servicio; bloque de atención desplegable con severidad visual; acciones avanzadas de cuenta identificadas como mockups sujetos a revisión
- Archivos principales: `apps/web/src/modules/operation`, `apps/web/src/modules/tables`, `apps/web/src/data/fixtures/operation.ts` y `apps/web/src/app/globals.css`
- Pruebas: lint, TypeScript, 19 pruebas unitarias y build del frontend web aprobados
- Decisiones: el usuario que abre una mesa queda asignado automáticamente; cada contacto entre mesas resta dos lugares; las reservaciones, uniones y estados continúan simulados en memoria hasta disponer de backend
- Pendiente: persistencia, permisos y sincronización real con reservaciones; atender en `feature/orders` las observaciones sobre cuentas, edición de pedidos y envío incremental a cocina
- PR: `https://github.com/NigthmareCF/wok_asian_food/pull/4`

## 2026-09-10 — Gestión operativa de mesas

- Rama: `feature/frontend-operational`
- Responsables: Antony y Tomy
- Asistencia: Codex
- Vistas: O-02 `/operation/tables`; O-03 `/operation/tables/[tableId]`
- Completado: mapa responsive con cinco estados, filtros por estado y zona, unión de dos mesas libres y adyacentes con capacidad combinada, detalle navegable de la unión, separación que restaura el estado inicial, próxima reserva, detalle con responsable, productos, saldo y acciones de cuenta; confirmaciones visibles para acciones financieras; liberación bloqueada mientras exista saldo pendiente
- Archivos principales: `apps/web/src/modules/tables`, `apps/web/src/data/fixtures/operation.ts` y `apps/web/src/app/(private)/(operational)/operation/tables`
- Pruebas: Prettier de archivos modificados, lint, TypeScript, 12 pruebas unitarias y build aprobados; revisión visual en escritorio y 390 px; unión, persistencia durante navegación, reinicio al recargar, separación y bloqueo de liberación verificados; sin desbordamiento horizontal visible
- Decisiones: las uniones viven en memoria durante la navegación y se reinician al recargar; cada unión resta dos lugares por las caras en contacto; datos, permisos y cobros se mantienen simulados; en móvil el mapa se transforma en una lista de tarjetas táctiles
- Pendiente: integración futura con backend, permisos reales, impresión y realtime
- PR: Pendiente

## 2026-09-10 — Simplificación del dashboard operativo

- Rama: `feature/frontend-operational`
- Responsables: Antony y Tomy
- Asistencia: Codex
- Vistas: O-01 `/operation`
- Completado: resumen reducido a mesas, pedidos y cocina; distribución de mesas mediante gráfico circular; estados de pedidos convertidos de badges a iconos; reservas y acciones rápidas retiradas; menú lateral fijo durante el desplazamiento en escritorio
- Archivos principales: `apps/web/src/modules/operation/components/operational-dashboard-view.tsx`, `apps/web/src/data/fixtures/operation.ts` y `apps/web/src/app/globals.css`
- Pruebas: Prettier de archivos modificados, lint, TypeScript, 7 pruebas unitarias y build aprobados; revisión visual en escritorio y 390 px; menú lateral permanece en `top: 0` al desplazar y no existe desbordamiento móvil
- Decisiones: el dashboard inicial prioriza únicamente información que requiere atención durante el servicio; Reservas conserva su módulo independiente
- Pendiente: validar la nueva composición en escritorio y teléfono; implementar O-02 y O-03
- PR: Pendiente

## 2026-09-09 — Dashboard y navegación operativa

- Rama: `feature/frontend-operational`
- Responsables: Antony y Tomy
- Asistencia: Codex
- Vistas: O-01 `/operation`; destinos provisionales de módulos operativos
- Completado: dashboard responsive con estado del servicio, métricas, acciones rápidas, filtro de pedidos, alertas y próximas reservas; navegación operativa habilitada y rutas sin errores 404
- Archivos principales: `apps/web/src/modules/operation`, `apps/web/src/data/fixtures/operation.ts`, `apps/web/src/config/navigation.ts` y `apps/web/src/app/(private)/(operational)/operation`
- Pruebas: Prettier de archivos modificados, lint, TypeScript, 7 pruebas unitarias y build aprobados; revisión visual a 1440 y 390 px; filtro de retrasados, 13 rutas y ancho móvil verificados. `format:check` global detecta finales CRLF previos en 56 archivos ajenos al cambio
- Decisiones: O-01 usa datos simulados; las rutas de módulos muestran un estado provisional explícito y no cuentan como vistas terminadas
- Pendiente: implementar O-02 y O-03 para mesas; continuar con pedidos y cocina; contrastar detalles visuales cuando Figma vuelva a estar disponible
- PR: Pendiente

## 2026-09-09 — Estado inicial

- Rama: `development`
- Responsables: coordinación frontend
- Asistencia: Codex
- Vistas: entrada base `/operation`
- Completado: shell responsive, navegación configurable y resumen demostrativo del canal
- Archivos principales: `apps/web/src/app/(private)/(operational)` y componentes compartidos
- Pruebas: lint, typecheck, 5 pruebas unitarias y build aprobados
- Decisiones: permisos, ETA, pedidos y realtime son únicamente conceptos visuales
- Pendiente: seleccionar IDs del sprint e implementar vistas asignadas
- PR: `https://github.com/NigthmareCF/wok_asian_food/pull/2`

# Progreso del canal Operativo

## 2026-09-15 — Auditoría de integración de rutas

- Se verificó la cobertura de navegación del canal: Operación, Mesas, Pedidos, Cocina, Reservas, Mensajes, Solicitudes, Delivery, Caja, Pagos, Inventario, Producción y Estado del servicio tienen rutas y accesos en la sidebar.
- Se conservaron los formularios operativos como pendientes de ampliación.

## 2026-10-02 — Mensajería operativa conectada

- `/operation/messages` sustituye el inbox de fixtures por conversaciones APP WAITING de la API, lectura y respuesta del personal autenticado. La bandeja es compartida y no implementa asignación individual.
- Después de responder, el hilo permanece visible con estado Abierta y la conversación sale de la cola. Se conserva el intento idempotente ante respuestas perdidas. Estado del servicio en el shell sigue simulado y su etiqueta lo aclara.
- Prueba local entre Cliente Demo Checkout y Operativo Demo mediante HTTP y navegador: mensaje enviado, respuesta visible, cola sin pendientes. Cliente sin rol operativo recibe 403. Suite web 368 pruebas aprobadas, lint/TypeScript/build Docker correctos.
- Delivery y reservas operativas conservan sus vistas previas; su integración y gestión posterior se deben abordar como siguiente sección. No se hicieron commits ni push.

## 2026-10-06 — F02-UI: flujo financiero presencial

- Cuentas, detalle y precuenta consultan datos reales por BFF; incluyen todas las cuentas cobrables de la mesa y precios congelados, con totales separados por moneda. Se conserva el permiso financiero del cajero sin conceder `orders:manage`.
- Cobros parciales y completos mantienen idempotencia; un intento incierto bloquea otro cobro. Su recuperación manual valida operador, cuenta y permiso, conserva solicitud/clave y no reenvía al recargar. `sessionStorage` conserva solo usuario/cuenta, clave, fecha y método/importes/caja; tras logout los intentos permanecen inactivos para el operador original. Perder la pestaña o ese almacenamiento requiere conciliación; no hay recuperación entre dispositivos.
- El efectivo requiere caja `OPEN` y moneda coincidente. Cobros y movimientos incrementan su versión; un conteo obsoleto conserva el importe introducido y exige revisión/reconteo explícito. Se conserva el bloqueo transaccional del servidor.
- Cuenta `PAID` es compatible con el contrato de mesas y no significa mesa liberada. Cobrar no finaliza pedidos. Finalizar exige saldo cero; liberar exige todos los pedidos finalizados y todas las cuentas de la mesa sin deuda, con autorización final del servidor.
- Verificación: API 190 pruebas; web 474 pruebas en 75 archivos; contrato/BFF de mesas 21 pruebas; tipos, lint y build correctos. Recorrido local real hasta `CLEANING`, varias cuentas, respuesta perdida con consulta por clave y caja cerrada Q440/Q440, diferencia cero. Pruebas concurrentes de F01 y pago/cierre de caja incluidas en la suite API.
- Capturas Chrome local y axe en 390/768/1280/1440 sin desbordamiento horizontal; quedan problemas de contraste de componentes existentes. Playwright no instalado y smoke shell bloqueado por ausencia de jq. No se instalaron herramientas. Los permisos diferenciados por puesto se verificaron en pruebas, no con usuarios independientes de la semilla en el recorrido real.
- Entorno exclusivo `wok-f02-ui-20261006`, web `http://127.0.0.1:3006/login`. Informe y artefactos en `C:/Users/avill/AppData/Local/Temp/wok-f02-ui-20261006/report.md`. Se conserva el trabajo anterior; sin commits, push, merges ni migraciones. Pendiente revisión, sin declarar el proyecto completo o seguro.

## 2026-10-06 — F03: integridad financiera de caja y cierres

- Alcance aprobado: H02 (conteo por turno), H04 (precisión de caja) y protección H01 (saldos por moneda). No corresponde al hallazgo de idempotencia de pedidos llamado F03 anteriormente.
- Conteo vinculado a sessionId/versión/importe. Cambio de turno exige importe nuevo; cambio de versión del mismo turno conserva referencia y exige reconteo. El cierre captura el destino antes de validar sesión y lo revalida antes de enviar.
- Caja API valida centavos exactos, mínimos y rango NUMERIC(14,2) antes de JDBC/claims. Auditoría y persistencia usan el mismo valor validado; fingerprints existentes conservados.
- Agregado financiero pequeño compartido por cuenta y moneda. Detalle mantiene REPEATABLE_READ; finalización/liberación conservan bloqueos existentes y rechazan incompatibilidades/saldos anómalos. Recibo no compensa monedas; consulta incompatible devuelve 409 con el pago identificado, sin nueva captura ni pérdida de evidencia. Replay toma el mutex existente de cuenta; consulta GET mantiene lectura REPEATABLE_READ.
- Maven offline verify en copia temporal y PostgreSQL18 nuevo de Testcontainers: 201 pruebas, cero fallos/errores/omitidas. Incluye regresión F01/F02, carreras, permisos, rollback y nuevos casos H01/H04.
- Web en copia temporal: 76 archivos/480 pruebas PASS, TypeScript/ESLint/build Next webpack PASS; diff --check PASS. Incluye reproducción H02 y cambio de turno/versión durante espera asíncrona.
- Primer verify tuvo un error de preparación por semilla ficticia ausente en la copia; se copió el archivo requerido y se repitió sin modificar pruebas. Primer build se lanzó por error desde raíz: Next detectó .env y abortó antes de compilación; no imprimió valores ni se observó .next en raíz. Build posterior correcto exclusivamente en copia temporal.
- Artefactos e informe: C:/Users/avill/AppData/Local/Temp/wok-f03-finance-20261006-131456. Sin commits/push/merge/fetch/cambio de rama, migraciones, dependencias o cambios de autenticación/roles/navegación/estilos. Contenedores/volúmenes previos preservados; Testcontainers usó recursos nuevos propios.
- Límites: sin navegador real/CI remoto ni nuevas pruebas de impresión/contraste. BFF conserva su mensaje genérico de 409; motivo específico disponible en API. H03/H05/H06 y reparación/conciliación durable siguen fuera de este encargo. Entrega detenida para revisión.


## 2026-10-06 — F04-B Web/BFF: protocolo durable y bloqueo de acceso ADMIN

- Implementación limitada a los archivos 9–31 aprobados. Preparación con importe explícito, revisión y captura separadas; retiro PREPARED, reemplazo REJECTED y resolución excepcional usan contratos durables. Montaje, foco, recarga y recuperación solamente consultan; sin POST legacy de respaldo.
- sessionStorage v2 contiene únicamente versión, usuario, cuenta e intento seleccionado. Storage ausente/inaccesible/manipulado no autoriza capturar ni impide consultar servidor. La referencia v1 solo se consulta mediante puente de lectura; no se adopta su payload financiero ni se fabrica otra identidad.
- DTO estricto: HTTP200 no equivale a CONFIRMED. PENDING/error/404/timeout/DTO inválido conservan incertidumbre. CONFIRMED conserva pago y distingue saldo disponible de conciliación requerida. Datos/actor/cuenta/versiones quedan capturados y revalidados durante esperas; permisos actuales se verifican por sesión y API. El backend aceptado verifica permisos en BD, no solo autoridades de token.
- Resolución exige ambos permisos, responsable distinto del creador, motivo, evidencia, versión y NOT_RECEIVED. UNKNOWN/RECEIVED no ofrecen retiro. No se marca pagado, no se borran historia/claims ni se asocian pagos por similitud.
- Copia física temporal sin .env*: Web 78 archivos/548 pruebas PASS; TypeScript, ESLint y build Next PASS. API offline con PostgreSQL18 nuevo Testcontainers: 274 pruebas PASS, incluidas reproducciones externas del revisor intactas, migraciones y regresiones F01–F04-A/backend B. Harness adicional de navegador 1 PASS; no sustituye las aserciones independientes de resultados financieros.
- Chrome nuevo aislado contra backend nuevo: preparación con respuesta perdida recuperada por GET; captura con respuesta perdida y storage borrado recupera evidencia sin otro cobro; parcial GTQ30 y GTQ70 preparado explícitamente, saldo cero, pedido CLOSED, cuenta CLOSED y mesa CLEANING. Efectivo sin turno produce REJECTED y reemplazo TRANSFER preparado sin captura automática. Dos pestañas capturan el mismo sucesor: un pago GTQ20. Otro operador queda bloqueado. Resolución BFF ADMIN con respuesta perdida: cero pagos en esa cuenta, marcador conservado y una auditoría; revocación real de permiso devuelve403 con la sesión existente.
- Capturas revisadas 390/768/1280/1440, sin desbordamiento horizontal; Tab/Shift-Tab/Escape y retorno de foco en diálogo de captura. Los fallos intermedios del guion (modificador CDP, foco programático, recarga antes de POST, formulario sin importe, selector de limpieza) se conservan en artefactos; no se debilitaron expectativas de producto. La primera suite Web paralela tuvo timeouts; repetición completa con dos workers pasó sin alterar pruebas/timeouts.
- Bloqueo confirmado en navegador: usuario solo ADMIN redirigido de /operation/payments a /admin por requireContext/canAccessContext existentes. La propuesta aprobada suponía acceso ADMIN al canal operativo. No se cambió autenticación/layout/navegación fuera de alcance. Resolución UI del ADMIN real pendiente; BFF real y componentes aislados sí comprobados. Se requiere aprobar acceso acotado en contexto administrativo antes de completar ese recorrido.
- Expectativas Web anteriores incompatibles sustituidas según plan aprobado: storage v1 obligatorio/autoridad, key cliente, recuperación404 que reenviaba POST legacy y captura en un único paso. Cobertura endpoint legacy y expectativas API conservadas; no compatibilidad total ni identidad inequívoca global. Ambigüedad legacy residual y H05 fuera de alcance.
- Artefactos: C:/Users/avill/AppData/Local/Temp/wok-f04-b-web-20261006-190327. Sin cambios backend/migraciones/Mobile/autenticación/navegación/estilos globales ni instalaciones/commits/push/merge/fetch/cambio de rama. No activado para uso general; H03/H06 pendientes de revisión independiente. Entrega detenida por ampliación de alcance necesaria para ADMIN.


## 2026-10-06 — F04-B ampliación autorizada: revisión ADMIN acotada

- B01 de la entrega anterior atendido con únicamente dos páginas nuevas: /admin/payment-attempts y /admin/payment-attempts/[accountId]. Layout ADMIN y sesión existentes; sin cambios de autenticación, roles, layouts o navegación global y sin habilitar ADMIN para /operation.
- Ambas páginas comprueban en servidor rol/contexto y payments:manage + payments:resolve, y consultan el API con permisos actuales antes de renderizar. El detalle exige UUID de cuenta y reviewAttempt único, rechaza parámetros adicionales y comprueba correspondencia exacta de cuenta/intento y DTO autorizado. La lista ofrece enlaces locales al detalle ADMIN.
- El detalle recibe destino de revisión fijado por servidor, se remonta al cambiar de cuenta/intento y permanece exclusivo de consulta/resolución incluso ante errores. No ofrece preparación, captura, reemplazo ni retiro normal; el hook también rechaza esas acciones en modo administrativo. Revalidación de destino durante esperas y permisos frescos conservada. Se espera sesión lista antes de consultar para conservar referencias legacy.
- Prohibición de auto-resolución y NOT_RECEIVED con motivo/evidencia mantenidas. UNKNOWN/RECEIVED no ofrecen retiro. Error nativo de red convertido a incertidumbre explícita en español; consulta posterior no fabrica otra identidad.
- Copia física nueva sin .env*: Web78 archivos/569 pruebas PASS; tipos, ESLint y build PASS. API offline con PostgreSQL18 nuevo:274 pruebas PASS, reproducciones externas intactas y regresiones F01–F04-A/backend B, incluido rollback/claims/auditoría/fencing/migraciones. Harness adicional de navegador1 PASS.
- Navegador ADMIN real: entrada desde enlaces de lista, revisión PENDING ajeno, evidencia obligatoria, UNKNOWN/RECEIVED sin retiro, teclado Tab/Shift-Tab/Escape y retorno de foco, revocación de permiso con sesión existente, resolución con respuesta perdida y recuperación por GET sin repetir, auto-resolución POST403 y UI sin acción, URLs manipuladas denegadas. Capturas390/768/1280/1440 sin desbordamiento horizontal e inspeccionadas. ADMIN sigue redirigido fuera de /operation.
- Next16.3.6 transmite notFound con HTTP200 en respuestas streaming: se comprobó denegación en servidor, marcador404 y ausencia de proveedor/controles, además de BFF403 por permiso revocado. La expectativa inicial de status404 del guion propio se corrigió conforme a documentación instalada; no se relajó autorización ni expectativa financiera.
- Versión final en navegador: GTQ40 parcial y GTQ60 de saldo explícito congelado; respuestas perdidas de captura/preparación recuperadas sin otro POST; texto incierto en español, storage borrado, cuenta/pedido CLOSED y mesa CLEANING. Captura tardía del PENDING retirado:409. Snapshot: dos pagos40+60, cero pagos en cuentas de resolución ajena/auto-resolución, una auditoría de resolución, marker no nulo conservado y auto-resolución permanece PENDING/v2.
- Artefactos de ampliación: C:/Users/avill/AppData/Local/Temp/wok-f04-b-admin-20261006-201238. Informe y delta propio más delta Web/BFF acumulado desde la copia inicial anterior. Trabajo previo y entornos existentes preservados; sin instalaciones/commits/push/merge/fetch/cambio de rama/backend/migraciones.
- Se detiene para revisión independiente. No activación general ni cierre de H03/H06; H05 y ambigüedad legacy residual permanecen fuera. Emulación responsive no sustituye dispositivo físico/lector de pantalla ni auditoría global de estilos.

## 2026-10-07 — Recorridos Web integrados de PLAN_TRABAJO

- Creación/ampliación conserva cuerpo y clave por usuario/cuenta/pedido antes de enviar, recupera el intento tras recarga y permite un nuevo envío solo después de confirmación explícita. Lecturas automáticas de cocina/detalle/solicitudes/reservas; recuperación tras errores/conflictos y bloqueo de doble envío.
- Pagos/caja y enlaces desde cuentas se conservaron con su protocolo y límites anteriores. Regresión global: 766 pruebas Web y 244 API aprobadas; bases de prueba nuevas aisladas, sin ventas reales.
- Informe y guion mesa → pedido → cocina → servido → pago → cierre: [WEB_INTEGRATED_DELIVERY.md](WEB_INTEGRATED_DELIVERY.md). Validación en navegador del último delta pendiente; hallazgos financieros previos no se consideran cerrados por estas pruebas.

## 2026-10-07 — Corrección F2–F6 de revisión independiente

- Creación/ampliación vinculadas al propietario inicial y al principal verificado por BFF con el mismo token reenviado. Desmontaje/cambio de generación aborta y descarta respuestas; cuerpo/clave/propietario inciertos persisten antes del transporte. Formularios antiguos sin propietario/header quedan bloqueados explícitamente.
- Bandeja usa cargas privadas cancelables por filtro/generación también en refrescos automáticos. Lecturas compartidas y sus BFF protegen identidad; compatibilidad financiera de solo lectura preservada.
- Solicitudes verificada con Chrome aislado a 390/768/820/1280/1440: sin overflow de documento, Actualizar y detalle visibles, sin ocultar datos. Integración real de pedidos y replay en PostgreSQL nuevo; regresión Web 786 aprobadas, lint/tipos/build aprobados.
- Informe, archivos, compatibilidad y límites: [WEB_INTEGRATED_F1_F6.md](WEB_INTEGRATED_F1_F6.md). Sin cambios al protocolo financiero ni publicación; detenido para revisión independiente.
