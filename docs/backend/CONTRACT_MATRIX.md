# Matriz contractual backend

## Fuente y alcance

Fuente única de los contratos: inventario E0 proporcionado para esta entrega. Esta matriz transcribe sus 27 operaciones de cuentas, pedidos y solicitudes, cocina, pagos y caja. No se realizó una nueva auditoría ni se consultó código para completarla.

La línea base E0 procede de una revisión estática: las pruebas citadas fueron localizadas y leídas, no ejecutadas en ese inventario. Los estados de E1 se registran por instrucción de esta entrega; no representan una nueva validación ni amplían el detalle contractual de E0.

## Estado de las correcciones E1

| Etapa | Hallazgo de E0 | Estado registrado |
| --- | --- | --- |
| E1.1 | La huella de creación de pedido no incluye `accountId`. | **Corregida**. La limitación de E0 se conserva abajo solo como antecedente. |
| E1.2 | El cierre de mesa cierra cuentas sin verificar saldo pendiente. | **Corregida**. La limitación de E0 se conserva abajo solo como antecedente. |
| E1.3 | La cancelación por propietario no filtra `fulfillment_type` y puede alcanzar delivery. | **Corregida**. La limitación de E0 se conserva abajo solo como antecedente. |
| E1.4 | El movimiento de propina en efectivo omite `request_id` y `payment_id`, aunque pago y venta están vinculados. | **Corregida**. Venta y propina comparten `payment_id` y el mismo `request_id`; la idempotencia del pago permanece en `payments`/`Idempotency-Key`. |

## Convenciones y límites de lectura

- Todas las rutas se muestran con el prefijo `/api/v1` expandido. La versión de API es `v1`; la fila «Versión» también describe el control de concurrencia observado en E0.
- **IK**: cabecera obligatoria `Idempotency-Key`, de tipo UUID.
- **XR**: cabecera opcional `X-Request-Id`, de tipo UUID; se genera uno cuando falta.
- **—**: el controlador no declara ese mecanismo; no implica ausencia en infraestructura global.
- Los errores corresponden a ramas explícitas o aserciones observadas en E0. No constituyen un catálogo global ni definen un formato común de error.
- Se incluyen únicamente apertura y cierre de cuentas alojadas en el controlador de mesas, no un inventario completo de mesas.
- Los DTO se describen con el detalle disponible en E0; no se infieren campos, validaciones ni contratos adicionales.
- Las filas siguientes describen la **línea base E0**. Para E1.1–E1.3, el estado de corrección anterior prevalece sobre los hallazgos históricos señalados.

## Cuentas

### `GET /api/v1/operational/accounts/{accountId}`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | accounts:manage |
| DTO de entrada | UUID en ruta |
| Respuesta | 200 AccountDetails: cuenta, pedidos, total, pagado, saldo, propinas, pagos |
| Estados | Estado persistido de cuenta/pedidos/pagos |
| Errores | 404; prueba 403 cliente |
| Versión | v1; account.rowVersion |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | OF, P: totales, cancelados, saldo, pagos, permisos |
| Limitaciones comprobadas | DTO sin moneda; suma pedidos no cancelados sin agrupar por moneda |

### `POST /api/v1/operational/tables/{tableId}/open`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | accounts:manage en método |
| DTO de entrada | Sin cuerpo |
| Respuesta | 200 TableView con cuenta |
| Estados | Cuenta OPEN; mesa FREE/CLEANING → OCCUPIED |
| Errores | 404, 409; prueba 403 |
| Versión | v1; versión de mesa en salida, sin versión esperada |
| Idempotencia | Sin IK; repetir sobre mesa ocupada falla |
| Correlación | XR |
| Pruebas | T, OF, A |
| Limitaciones comprobadas | Apertura de cuenta vinculada a mesa |

### `POST /api/v1/operational/tables/{tableId}/close`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | accounts:manage en método |
| DTO de entrada | Sin cuerpo |
| Respuesta | 200 TableView |
| Estados | Cuentas OPEN/IN_COBRO/PAID → CLOSED; mesa OCCUPIED → CLEANING |
| Errores | 404, 409 por estado o pedidos abiertos |
| Versión | v1; sin versión esperada |
| Idempotencia | Sin IK; repetición falla por estado |
| Correlación | XR |
| Pruebas | T, OF, P, A |
| Limitaciones comprobadas | No verifica saldo pendiente antes de cerrar cuentas. **Antecedente corregido en E1.2**. |


## Pedidos y solicitudes

### `GET /api/v1/operational/orders`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | orders:manage |
| DTO de entrada | Query status?, tableId? |
| Respuesta | 200 `List<OrderSummary>` |
| Estados | Filtra estado persistido |
| Errores | Pruebas de denegación 403 |
| Versión | v1; rowVersion por pedido |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | OF, A |
| Limitaciones comprobadas | Máximo 200; sin paginación; status es texto |

### `GET /api/v1/operational/orders/{orderId}`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | orders:manage |
| DTO de entrada | UUID en ruta |
| Respuesta | 200 OrderDetails: pedido, ítems, comandas |
| Estados | Estado persistido |
| Errores | 404 |
| Versión | v1; versiones de pedido/comandas |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | OF: consulta para transiciones |
| Limitaciones comprobadas | No declara ETag |

### `POST /api/v1/operational/orders`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | orders:manage |
| DTO de entrada | OpenOrderRequest: cuenta, canal, comensales, notas, 1–50 líneas |
| Respuesta | 201 OrderReceipt, incluye idempotentReplay |
| Estados | Crea SENT; cuenta debe admitir pedidos |
| Errores | 400 líneas; 404 cuenta; 409 cuenta/clave; 422 producto, moneda o salón sin mesa |
| Versión | v1; devuelve rowVersion |
| Idempotencia | IK por actor + huella |
| Correlación | XR |
| Pruebas | O, OF: creación, precios, comandas, repetición y conflictos |
| Limitaciones comprobadas | La huella no incluye accountId. **Antecedente corregido en E1.1**. |

### `POST /api/v1/operational/orders/{orderId}/items`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | orders:manage |
| DTO de entrada | AddItemsRequest: 1–50 líneas |
| Respuesta | 200 OrderDetails |
| Estados | Admite SENT/PREPARING/READY; rechaza SERVED/CLOSED/CANCELLED |
| Errores | 400, 404, 409, 422 |
| Versión | v1; sin expectedVersion |
| Idempotencia | IK por actor/operación; huella incluye pedido |
| Correlación | XR |
| Pruebas | OF: adicionales, comandas, repetición, conflicto y cancelado |
| Limitaciones comprobadas | Repetición devuelve detalle actual; sin indicador de replay |

### `PATCH /api/v1/operational/orders/{orderId}/status`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | orders:manage |
| DTO de entrada | StatusRequest: estado, expectedVersion > 0, motivo opcional |
| Respuesta | 200 OrderSummary |
| Estados | SENT → PREPARING → READY → SERVED → CLOSED; cancelación desde los tres primeros |
| Errores | 404; 409 transición/versión |
| Versión | v1; control optimista explícito |
| Idempotencia | Sin IK; repetir transición no reproduce éxito |
| Correlación | XR |
| Pruebas | O, OF: transiciones, historial, cancelación, versión obsoleta |
| Limitaciones comprobadas | No permite saltos ni reapertura |

### `POST /api/v1/client/order-requests`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | Rol CLIENT |
| DTO de entrada | PickupRequest: horario, nota, 1–20 productos con cantidad positiva |
| Respuesta | 202 PickupRequestReceipt |
| Estados | PENDING_REVIEW |
| Errores | 400 líneas; 409 clave; 422 catálogo, moneda, horario |
| Versión | v1; sin versión de fila expuesta |
| Idempotencia | IK por cliente + huella |
| Correlación | — |
| Pruebas | CP; OD usa envío HTTP |
| Limitaciones comprobadas | Crea solicitud, no pedido; precio calculado en backend |

### `GET /api/v1/client/order-requests`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | Rol CLIENT |
| DTO de entrada | Sin cuerpo |
| Respuesta | 200 `List<PickupRequestReceipt>` |
| Estados | Estados persistidos de solicitudes pickup propias |
| Errores | Sin error de negocio explícito |
| Versión | v1; sin versión |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | Sin caso directo localizado |
| Limitaciones comprobadas | Últimas 50; sin paginación |

### `GET /api/v1/client/order-requests/{requestId}`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | Rol CLIENT + propietario |
| DTO de entrada | UUID en ruta |
| Respuesta | 200 PickupRequestDetails con líneas guardadas |
| Estados | Estado persistido |
| Errores | 404 inexistente, ajena o de otro tipo |
| Versión | v1; sin versión |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | CP: detalle y ocultación de solicitud ajena |
| Limitaciones comprobadas | No devuelve vínculo orderId |

### `DELETE /api/v1/client/order-requests/{requestId}`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | Rol CLIENT + propietario |
| DTO de entrada | Sin cuerpo |
| Respuesta | 200 OrderRequestState |
| Estados | PENDING_REVIEW → CANCELLED |
| Errores | 404, 409 |
| Versión | v1; bloqueo interno, sin versión esperada |
| Idempotencia | Repetir CANCELLED devuelve éxito sin nuevo evento |
| Correlación | — |
| Pruebas | CP: cancelación, propietario, repetición |
| Limitaciones comprobadas | Consulta por propietario sin filtrar fulfillment_type. **Antecedente corregido en E1.3**. |

### `POST /api/v1/client/delivery-requests`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | Rol CLIENT |
| DTO de entrada | DeliveryRequest: horario, nota, dirección, referencia, teléfono, preferencia de pago, 1–20 productos |
| Respuesta | 202 DeliveryRequestReceipt |
| Estados | PENDING_REVIEW |
| Errores | 400, 409, 422; 503 servicio no disponible |
| Versión | v1; sin versión |
| Idempotencia | IK por cliente + huella |
| Correlación | — |
| Pruebas | CD: pausa, catálogo, snapshots |
| Limitaciones comprobadas | Preferencia de pago no realiza cobro; aceptación operativa bloqueada |

### `GET /api/v1/client/delivery-requests`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | Rol CLIENT |
| DTO de entrada | Sin cuerpo |
| Respuesta | 200 `List<DeliveryRequestReceipt>` |
| Estados | Solicitudes delivery propias |
| Errores | Sin error de negocio explícito |
| Versión | v1; sin versión |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | Sin caso directo localizado |
| Limitaciones comprobadas | Últimas 50; sin paginación |

### `GET /api/v1/client/delivery-requests/{requestId}`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | Rol CLIENT + propietario |
| DTO de entrada | UUID en ruta |
| Respuesta | 200 DeliveryRequestDetails |
| Estados | Estado persistido |
| Errores | 404 inexistente, ajena o de otro tipo |
| Versión | v1; sin versión |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | CD: propietario, tipo y snapshots |
| Limitaciones comprobadas | Respuesta omite dirección, teléfono, referencia y orderId |

### `POST /api/v1/operational/order-requests/{requestId}/decision`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | orders:manage |
| DTO de entrada | DecisionRequest: ACCEPT/REJECT, motivo ≤500 |
| Respuesta | 200 DecisionResult: solicitud, estado, pedido, replay |
| Estados | PENDING_REVIEW → ACCEPTED/REJECTED; aceptar pickup crea pedido SENT |
| Errores | 404, 409; 422 motivo, disponibilidad, moneda, horario o delivery |
| Versión | v1; sin versión esperada |
| Idempotencia | Por estado/acción, sin IK |
| Correlación | XR |
| Pruebas | OD: aceptación, repetición, rechazo, catálogo y delivery |
| Limitaciones comprobadas | Delivery no se acepta; repetir rechazo no compara nuevo motivo |


### `GET /api/v1/operational/order-requests`

| Campo | Contrato implementado (Canónico PR39) |
| --- | --- |
| Permiso | `orders:manage` |
| DTO de entrada | Query opcional `status` (`PENDING_REVIEW`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `EXPIRED`) y `type` (`PICKUP`, `DELIVERY`) |
| Respuesta | 200 `List<OrderRequestSummary>` con `requestId`, `status`, `fulfillmentType`, `requestedFor`, `submittedAt`, `customerName`, `customerEmail`, `customerNote`, `subtotal`, `currency`, `orderId`, `orderStatus`, e `items` (`name`, `quantity`, `unitPrice`, `lineTotal`) |
| Estados | Filtra estados persistidos; la solicitud permanece separada del pedido |
| Errores | 400 enum/filtro inválido; 403 sin permiso |
| Versión | v1; máximo 50, orden `PENDING_REVIEW` primero, luego `created_at DESC, id DESC` |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | `OrderRequestQueryIntegrationTest`: pickup/delivery, filtros status/type, orden, rol 403, 400 por filtro inválido y ausencia de datos sensibles |
| Limitaciones comprobadas | El contrato canónico omite cliente userId, dirección/contacto, fingerprint y clave de idempotencia |

### `GET /api/v1/operational/order-requests/{requestId}`

| Campo | Contrato implementado (Canónico PR39) |
| --- | --- |
| Permiso | `orders:manage` |
| DTO de entrada | UUID en ruta |
| Respuesta | 200 `OrderRequestSummary` (único DTO unificado con listado) con `submittedAt`, datos cliente (`customerName`, `customerEmail`), `orderId`/`orderStatus` opcionales e `items` snapshot |
| Estados | Estado persistido; no crea ni transforma la solicitud en pedido |
| Errores | 403 sin permiso; 404 inexistente |
| Versión | v1; sin versión esperada |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | `OrderRequestQueryIntegrationTest`: detalle, items, separación solicitud/pedido, 403/404 |
| Limitaciones comprobadas | Comparte exactamente el mismo DTO canónico con el listado sin exponer campos sensibles ni direcciones |

## Cocina

### `GET /api/v1/operational/kitchen/tickets`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | kitchen:manage |
| DTO de entrada | Query stationId?, status?; defecto OPEN |
| Respuesta | 200 `List<TicketView>` |
| Estados | OPEN agrupa QUEUED/PREPARING/RECALLED |
| Errores | Prueba 403 |
| Versión | v1; rowVersion |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | K, OF, A |
| Limitaciones comprobadas | Sin paginación; devuelve resumen, no líneas de preparación |

### `GET /api/v1/operational/kitchen/load`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | kitchen:manage |
| DTO de entrada | Sin cuerpo |
| Respuesta | 200 `List<StationLoad>` |
| Estados | Conteos QUEUED/PREPARING/READY |
| Errores | Sin error de negocio explícito |
| Versión | v1; sin versión |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | K: conteos |
| Limitaciones comprobadas | No cuenta RECALLED en esas categorías |

### `POST /api/v1/operational/kitchen/tickets/{ticketId}/claim`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | kitchen:manage |
| DTO de entrada | Sin cuerpo |
| Respuesta | 200 TicketView |
| Estados | QUEUED → PREPARING; inicia pedido SENT |
| Errores | 404, 409 ya tomada |
| Versión | v1; incrementa versión, no exige versión previa |
| Idempotencia | Sin IK; repetición devuelve conflicto |
| Correlación | XR |
| Pruebas | K, OF: toma, pedido, inexistente y ya tomada |
| Limitaciones comprobadas | Solo admite QUEUED, no RECALLED |

### `PATCH /api/v1/operational/kitchen/tickets/{ticketId}/status`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | kitchen:manage |
| DTO de entrada | TicketStatusRequest: estado, versión positiva, motivo opcional |
| Respuesta | 200 TicketView |
| Estados | Transiciones descritas abajo |
| Errores | 404, 409 transición/versión |
| Versión | v1; expectedVersion obligatorio |
| Idempotencia | Sin IK |
| Correlación | XR |
| Pruebas | K, OF: listo, estaciones pendientes, retorno, versión |
| Limitaciones comprobadas | Pasar a PREPARING por PATCH no llama al inicio del pedido usado por claim |

Transiciones de cocina declaradas en E0:

| Estado inicial | Estados de destino |
| --- | --- |
| `QUEUED` | `PREPARING`, `CANCELLED` |
| `PREPARING` | `READY`, `QUEUED`, `CANCELLED` |
| `READY` | `RECALLED` |
| `RECALLED` | `PREPARING` |
| `CANCELLED` | Terminal |

## Pagos

### `POST /api/v1/operational/accounts/{accountId}/payments`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | payments:manage |
| DTO de entrada | PaymentRequest: método; importe, propina, referencia y caja opcionales |
| Respuesta | 201 PaymentReceipt: importe, moneda, saldo, estado cuenta, enlaces caja, replay |
| Estados | Pago CAPTURED; cuenta OPEN/IN_COBRO → PAID al liquidar |
| Errores | 404; 409 estado, pedidos abiertos, caja o clave; 422 sin consumo, multimoneda o exceso |
| Versión | v1; sin versión esperada |
| Idempotencia | IK por actor/operación + huella |
| Correlación | XR |
| Pruebas | P: efectivo, externo, mixto, parcial, propinas, repetición, permisos |
| Limitaciones comprobadas | Importe omitido cobra saldo completo; no hay reverso en este controlador. La venta y la propina en efectivo quedan vinculadas al mismo pago y solicitud. |


## Caja

### `POST /api/v1/operational/cash-sessions`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | cash:manage |
| DTO de entrada | OpenRequest: código obligatorio ≤32, fondo ≥0 |
| Respuesta | 201 CashSession |
| Estados | OPEN; movimiento OPENING |
| Errores | 404 registro; 409 apertura duplicada/clave |
| Versión | v1; devuelve rowVersion |
| Idempotencia | IK por actor/operación |
| Correlación | XR |
| Pruebas | CA: apertura, repetición y conflictos |
| Limitaciones comprobadas | Replay devuelve estado actual, sin bandera |

### `GET /api/v1/operational/cash-sessions/current`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | cash:manage |
| DTO de entrada | Query registerCode=MAIN |
| Respuesta | 200 CashSession |
| Estados | Busca OPEN/CLOSING |
| Errores | 404; prueba 403 |
| Versión | v1; rowVersion |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | CA: caja actual |
| Limitaciones comprobadas | Solo una sesión actual por consulta |

### `GET /api/v1/operational/cash-sessions/{sessionId}`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | cash:manage |
| DTO de entrada | UUID en ruta |
| Respuesta | 200 CashSession: desglose, arqueos, movimientos |
| Estados | Estado persistido |
| Errores | 404 |
| Versión | v1; rowVersion |
| Idempotencia | Lectura |
| Correlación | — |
| Pruebas | CA, P: desglose y propinas |
| Limitaciones comprobadas | Listas internas sin paginación |

### `POST /api/v1/operational/cash-sessions/{sessionId}/movements`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | cash:manage |
| DTO de entrada | MovementRequest: tipo, importe ≥0.01, motivo 3–500 |
| Respuesta | 201 CashMovement |
| Estados | Solo caja OPEN; INCOME/EXPENSE/WITHDRAWAL |
| Errores | 404, 409 estado/clave |
| Versión | v1; sin versión esperada |
| Idempotencia | IK por actor/operación |
| Correlación | XR |
| Pruebas | CA: signos, retiro, replay y conflicto |
| Limitaciones comprobadas | No incrementa rowVersion de sesión |

### `POST /api/v1/operational/cash-sessions/{sessionId}/close`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | cash:manage |
| DTO de entrada | CloseRequest: contado ≥0, versión positiva |
| Respuesta | 200 CashSession con diferencia |
| Estados | OPEN → CLOSED; arqueo final |
| Errores | 404, 409 estado/versión |
| Versión | v1; expectedVersion, incrementa versión |
| Idempotencia | Sin IK; repetir cierre falla |
| Correlación | XR |
| Pruebas | CA: cierre, diferencia y versión obsoleta |
| Limitaciones comprobadas | La versión no refleja movimientos intermedios |

### `POST /api/v1/operational/cash-sessions/{sessionId}/reconciliations`

| Campo | Contrato inventariado en E0 |
| --- | --- |
| Permiso | cash:manage |
| DTO de entrada | ReconciliationRequest: contado ≥0, notas ≤500 |
| Respuesta | 201 Reconciliation |
| Estados | Solo OPEN; isFinal=false |
| Errores | 404, 409; prueba 403 |
| Versión | v1; sin versión esperada |
| Idempotencia | Sin IK; cada llamada crea arqueo |
| Correlación | XR |
| Pruebas | CA: arqueo, desglose, cierre y permisos |
| Limitaciones comprobadas | Sin deduplicación de reintentos |

## Referencias de pruebas del inventario

Los códigos de las filas remiten a estas clases, tal como las identifica E0. No se añaden pruebas posteriores ni resultados de ejecución de otras etapas.

| Código | Clase |
| --- | --- |
| O | `OrderServiceTest` |
| OF | `OperationalFlowIntegrationTest` |
| CP | `ClientPickupRequestControllerTest` |
| CD | `ClientDeliveryRequestControllerTest` |
| OD | `OrderRequestDecisionIntegrationTest` |
| K | `KitchenServiceTest` |
| P | `PaymentIntegrationTest` |
| CA | `CashSessionIntegrationTest` |
| T | `TableServiceTest` |
| A | `PermissionAuthorizationIntegrationTest` |

Las pruebas unitarias usan mocks y no acreditan validación HTTP ni concurrencia real. Las integraciones heredan una configuración que las omite sin Docker (`PostgresIntegrationTest`). «Sin caso directo localizado» expresa el resultado de E0, no una comprobación nueva de ausencia de cobertura.

## Aspectos no verificados en E0

- Formato global de errores e implementación compartida de idempotencia.
- Filtros globales e infraestructura fuera del alcance del inventario.
- Los controladores operativos reciben o generan XR, pero no lo incluyen en sus DTO de respuesta; no se verificó si infraestructura global lo expone por otro mecanismo.
- No se revisó código frontend/BFF. La matriz no amplía contratos de esos componentes.
