# Progreso del canal Operativo

Responsables: Antony y Tomy.

Agregar aquí los avances más recientes siguiendo la plantilla de [README.md](README.md).

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
