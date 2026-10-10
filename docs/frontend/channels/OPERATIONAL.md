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

## E8.1 - Caja conectada a contratos reales

La vista /operation/cash consume mediante BFF GET /api/v1/operational/cash-sessions/current?registerCode=MAIN, POST /api/v1/operational/cash-sessions, POST /{sessionId}/movements y POST /{sessionId}/close. El backend exige cash:manage; apertura y movimientos requieren Idempotency-Key y X-Request-Id, y el cierre envía expectedVersion junto con X-Request-Id. El DTO real expone sesión, desglose, movimientos y arqueos, y la interfaz no inventa nombres de usuario ni saldos.

Se cubren carga, vacío sin sesión, errores 401/403/404/409, validación, bloqueo de doble envío y recarga después de movimientos o conflictos. Pagos, devoluciones, pasarela, cuentas/precuentas y cualquier mutación sin endpoint específico quedan bloqueados para 8.2; no se simulan cobros ni saldos.

## E8.2 - Pagos y cuentas operativas

Se conectaron mediante BFF GET /api/v1/operational/accounts/{accountId} y POST /api/v1/operational/accounts/{accountId}/payments. El backend calcula total, pagado, saldo y el importe completo cuando el monto se omite; la interfaz no trata cálculos del navegador como autoridad. Los pagos aceptan únicamente CASH, CARD_EXTERNAL y TRANSFER, con Idempotency-Key y X-Request-Id; después de un pago se recargan la cuenta y la sesión de caja.

El cierre de cuenta, la precuenta y las devoluciones/reversiones no tienen endpoint operativo disponible y quedan bloqueados. Tampoco se inventa pasarela online. Se manejan 401, 403, 404, 409 y 422 a través del BFF, además de validación y doble envío.
