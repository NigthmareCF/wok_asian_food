# Progreso del canal Operativo

Responsables: Antony y Tomy.

Agregar aquí los avances más recientes siguiendo la plantilla de [README.md](README.md).

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
