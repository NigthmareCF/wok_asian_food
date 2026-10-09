# Canal Operativo

Responsables: Antony y Tomy. Rama de canal disponible: `feature/frontend-operational`.

El canal Operativo está diseñado para trabajo repetitivo y rápido durante el servicio. Debe priorizar densidad legible, tiempos, estados, alertas y acciones según permisos, sin depender de animaciones decorativas.

## Ubicación técnica

- Rutas: `apps/web/src/app/(private)/(operational)/operation`.
- Dominios principales: `modules/tables`, `modules/orders`, `modules/kitchen`, `modules/reservations`, `modules/messaging`, `modules/delivery`, `modules/payments`, `modules/cash`, `modules/inventory` y `modules/production`.
- Navegación: `apps/web/src/config/navigation.ts`.

## Catálogo de vistas

| ID   | Ruta inicial                                       | Controles y acciones mínimas                                         | Estados mínimos                                            |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| O-01 | `/operation`                                       | Abrir Mesas, Pedidos, Reservas, Mensajes, Caja e Inventario          | Servicio, carga, ETA, críticos y solicitudes pendientes    |
| O-02 | `/operation/tables` propuesta                      | Abrir, asignar, unir, separar y consultar próxima reserva            | Libre, ocupada, reservada, preparación y fuera de servicio |
| O-03 | `/operation/tables/[tableId]` propuesta            | Agregar, dividir, precuenta, cobrar y trasladar                      | Tiempo, responsable, cuentas y saldo pendiente             |
| O-04 | `/operation/orders/new` propuesta                  | Categorías, búsqueda, modificadores, carrito y enviar a cocina       | Disponibilidad aproximada, ETA y limitantes                |
| O-05 | `/operation/orders/[orderId]` propuesta            | Editar, cambiar, anular y elegir actualización de comanda            | No comandado, comandado, preparando y cambio rechazado     |
| O-06 | `/operation/kitchen` propuesta                     | Filtrar estación, aceptar, marcar listo, cambiar ETA y abrir detalle | Nuevos, preparación, listos, retrasados y reconectando     |
| O-07 | `/operation/reservations` propuesta                | Cambiar día/semana/mes, buscar y abrir reserva                       | Próxima, confirmada, tardía, preorden y vencida            |
| O-08 | `/operation/reservations/new` y edición propuestas | Cliente, fecha, hora, personas, mesa sugerida, preorden y confirmar  | Conflicto, límite horario y confirmación humana            |
| O-09 | `/operation/messages` propuesta                    | Tomar conversación, responder, transferir y consultar contexto       | Sin asignar, IA, humano y requiere atención                |
| O-10 | `/operation/online-requests` propuesta             | Revisar, aceptar, rechazar, mantener y revalidar                     | Pendiente, desactualizada, aceptada y rechazada            |
| O-11 | `/operation/delivery` propuesta                    | Registrar datos, pago, ETA, repartidor, llegada y recogida           | Esperando repartidor, llegó, recogido y reprogramado       |
| O-12 | `/operation/payments` propuesta                    | Dividir, mover ítem, pago parcial y cobrar                           | Pendiente, parcial, pagada y diferencia                    |
| O-13 | Estado de precuenta                                | Imprimir y mostrar total con/sin propina                             | Impresión pendiente, correcta o fallida                    |
| O-14 | `/operation/cash` propuesta                        | Registrar gasto/retiro y ejecutar cierre autorizado                  | Abierta, diferencia y cierre pendiente                     |
| O-15 | `/operation/inventory` propuesta                   | Buscar, filtrar, entrada, ajuste y consultar lotes                   | Bajo, crítico, reservado, disponible y caducidad           |
| O-16 | `/operation/production` propuesta                  | Registrar, corregir rendimiento y aceptar/rechazar sugerencia        | Pendiente, activa, reposo, disponible y descartada         |
| O-17 | Integrada en constructor/menú                      | Ver cantidad aproximada, limitante y override permitido              | Calculada, publicada, suspendida y con producción          |
| O-18 | `/operation/status` propuesta                      | Seleccionar estado, indicar motivo y aplicar con confirmación        | Normal, alta demanda, sólo recoger y servicios suspendidos |

## Reglas que no se pueden omitir

- Las acciones visibles dependen de permisos; ocultarlas no reemplaza autorización backend.
- Una mesa no se libera con saldos pendientes salvo autorización especial.
- Las modificaciones posteriores a cocina conservan trazabilidad y revisión de comanda.
- Un fallo de impresión no debe duplicar ni invalidar un pedido confirmado.
- Cocina puede ajustar ETA y prioridad; los cambios se propagan al personal correspondiente.
- Solicitudes remotas pendientes se revalidan antes de aceptar y nunca se convierten automáticamente.
- Atención presencial tiene prioridad operativa sobre solicitudes remotas pendientes.
- Inventario diferencia stock físico, reservado y disponible; los ajustes registran responsable.
- Toda suspensión, cierre u override requiere usuario, fecha, hora y motivo.
- Acciones destructivas o financieras requieren confirmación visible.

## Comportamiento responsive

El KDS de escritorio usa columnas por estado. En tablet o móvil estrecho se transforma en pestañas con contadores y tarjetas, conservando el estado seleccionado. Tablas extensas pasan a listas o tarjetas con detalle en panel o pantalla; nunca deben exigir hover.

Los controles principales deben medir al menos 44 px y mantenerse accesibles con teclado. Estados críticos incluyen texto o icono además de color.

## Entrega del canal

Cada PR debe limitarse a vistas asignadas, identificar permisos simulados y documentar qué requiere backend o realtime. Adjuntar capturas de los estados normal, vacío y crítico, además de móvil y escritorio.

## E9.1 - Inventario conectado

Se conectaron mediante BFF GET /api/v1/operational/inventory/items, GET /items/{itemId} y POST /items/{itemId}/movements. El permiso real es inventory:manage; el backend calcula existencias, reservado, disponible, mínimo, estado y delta. Los movimientos ENTRY, ADJUSTMENT y WASTE usan Idempotency-Key y X-Request-Id, y la interfaz recarga el listado después de registrar.

Se manejan carga, vacío, 401, 403, 404, 409, 422, validación y doble envío. Lotes, compras, proveedores, recetas, consumo de pedidos y producción no tienen una superficie conectada para esta etapa y quedan bloqueados para 9.2; no se usan fixtures como éxito real.

## E9.2 - Compras, proveedores, recetas y producción

La API existente permite lectura de lotes de producción (GET /api/v1/operational/production/batches y detalle), registro idempotente de producción (POST /batches) y lectura de recetas (GET /api/v1/operational/inventory/items/{itemId}/recipe). Las operaciones de producción consumen inventario y el backend valida receta, disponibilidad, permisos production:manage, Idempotency-Key y X-Request-Id.

No hay endpoints operativos para proveedores, órdenes de compra, recepción de compras ni lotes de inventario. El consumo por pedidos se ejecuta internamente al cerrar/reservar pedidos y no tiene consulta operativa dedicada. La edición de recetas existe en backend (PUT) pero no hay editor activo conectado en esta etapa. Compras, proveedores, lotes, editor de recetas y cualquier estado no expuesto quedan bloqueados; no se simula persistencia ni éxito.
