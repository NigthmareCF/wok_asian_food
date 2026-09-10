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
