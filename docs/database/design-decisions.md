# Decisiones y contratos de integridad — WOK ASIAN FOOD

## Alcance y supuestos

Modelo lógico y borrador físico para un restaurante y una base central PostgreSQL 18. No es implementación backend ni una migración lista para producción. Clientes WEB, MOBILE y DESKTOP e IA utilizan exclusivamente API/tools autorizadas. Se documentan 109 tablas; no se modifica ningún material previo.

Se asume una sola operación/restaurante. No se agrega tenant_id sin requisito real. Sucursales futuras requerirán establecer el alcance de usuarios, cajas, mesas, existencias, precios y claves únicas mediante una migración explícita. Se admite cliente invitado para operación presencial y canales externos; una cuenta registrada sí debe verificarse. Moneda por documento, sin pagos cruzados entre monedas. GTQ es candidato de seed, no default impuesto.

El DDL declara columnas, PK, FK, NOT NULL, UNIQUE, CHECK, índices y exclusión de solapes. **No incluye triggers, permisos PostgreSQL ni procedimientos de contabilización.** Los contratos R01–R13 son parte obligatoria del diseño y deberán materializarse mediante transacciones de API y, para integridad crítica, guardas/procedimientos o triggers en futuras migraciones. Validar sintaxis no demuestra cumplimiento de reglas entre filas.

## Convenciones y normalización

Nombres técnicos ingleses; tablas plurales salvo `service_status`, nombre expresamente solicitado para el singleton. Columnas snake_case. Toda entidad tiene PK UUID; asociaciones con UUID conservan identidad de eventos y tienen claves alternativas cuando corresponde. UUID no otorga acceso. Los clientes serializan IDs como strings.

Eventos usan TIMESTAMPTZ; fechas laborales usan DATE; horario semanal usa TIME y zona IANA explícita. Horarios que cruzan medianoche se dividen en dos ventanas. La fecha operativa de una caja puede diferir del día civil: se deriva de opened_at y configuración de cierre, no de la fecha del navegador.

Dinero NUMERIC(14,2), costos unitarios y cantidades NUMERIC(18,6); nunca FLOAT. Monedas admitidas con hasta dos decimales; ampliar precisión y contrato antes de añadir monedas que exijan más. Redondear una vez por línea con round(...,2). Precio fiscal documentado como neto más impuesto explícito; confirmar si los precios comerciales entregados por el cliente incluyen impuesto y convertirlos al emitir.

3FN/BCNF: identidad separada de credencial, perfil separado de rol, proveedor separado de item, receta separada de ejecución, cuenta separada de pedido y pago. Dependencias de cada catálogo se concentran en su clave; N:M mediante asociaciones. No hay evidencia de dependencias multivaluadas o joins que justifique aplicar 4FN/5FN adicionalmente.

Excepciones deliberadas: snapshots comerciales/fiscales y de dirección guardan el hecho histórico; inventory_balances, estados actuales y row_version son proyecciones para operación concurrente; `required` se valida equivalente a min_selection > 0; `difference` de arqueo es columna generada. Estas redundancias tienen contrato de mantenimiento. JSONB sólo para configuración, snapshots, auditoría, payloads y resultados operativos de herramientas, no para listas de items, roles o pagos.

Un lote representa identidad y procedencia, no una única ubicación. Por ello la cantidad y ubicación solicitadas se representan normalizadas en inventory_balances y inventory_movements. Un lote puede estar simultáneamente en almacén y cocina. Las presentaciones convierten a la unidad base del item; las unidades sólo convierten dentro de MASS/VOLUME/COUNT. No se supone densidad universal.

## R01 — Identidad, verificación y permisos

Registro público: crear users PENDING_VERIFICATION, user_credentials y customer_profiles; asignar sólo rol CUSTOMER en la misma transacción. La solicitud pública no contiene roles operativos aceptables. Roles CUSTOMER, WAITER, CASHIER, KITCHEN, INVENTORY, PRODUCTION, PURCHASING, MANAGER y ADMIN son candidatos de seed con permisos diferenciados. Cuentas de servicio no se presentan como clientes.

Permisos iniciales: order.view, order.modify, order.cancel_item; payment.register, payment.split; cash.view, cash.close, cash.register_expense; service.close, service.suspend_online, service.suspend_delivery; menu.disable_product, menu.enable_product; inventory.view, inventory.adjust; production.view, production.manage; purchase.view, purchase.manage; recipe.view, recipe.edit; user.view, user.manage, user.assign_role; audit.view. Asignación administrativa se audita, incluido el actor que concede y revoca. No interpretar usuarios suspendidos como roles.

Hashes de contraseña auto-descriptivos y suficientemente largos, con salt y parámetros; nunca password plano. PIN de poca entropía protegido con secreto del servidor fuera de PostgreSQL; sólo guardar code_hash y destino vinculado. Limitar intentos también por IP/dispositivo/identificador; evitar enumeración de cuentas en respuestas. Los hashes de longitud válida no garantizan algoritmo seguro por sí solos.

Consumir challenge bajo SELECT FOR UPDATE: comprobar propósito, destino, expiración, revocación, consumo e intentos; incrementar en fallo; consumir una sola vez en éxito. ACCOUNT_VERIFICATION activa identidad y email_verified_at. PASSWORD_RESET cambia hash e invalida sesiones. EMAIL_CHANGE mantiene el email anterior hasta verificar el nuevo. Cambiar contraseña autenticado verifica credencial actual o autenticación reforzada según política.

Después de un cambio sensible actualizar sessions_valid_after y revocar sesiones/refresh tokens anteriores en el mismo commit. La API valida sesión y corte temporal también al usar access tokens; un JWT firmado por sí solo no permite revocación inmediata. Rotación bloquea sesión y token; sucesor comparte sesión, parent_token_id sólo puede tener un sucesor. Reuso de token consumido revoca familia. Expiración del token nunca excede sesión. Registrar evento de seguridad sin guardar el secreto.

Lockout: insertar cada login_attempt, incluso si user_id no se identifica. Bajo bloqueo del usuario contar fallos según ventana configurada y crear account_lockouts. La cuenta está bloqueada cuando existe episodio no desbloqueado con locked_until futuro. unlocked_by y unlocked_at documentan intervención humana; el vencimiento natural no exige inventar un desbloqueador. Ajustar política mediante settings.

## R02 — Reservas y mesas

reservations no exige mesa; arrival_at registra llegada, status NO_SHOW representa inasistencia, orders.reservation_id representa preorder. La asignación usa intervalos finitos [inicio,fin), incluidas tolerancias y limpieza si aplica. EXCLUDE GiST rechaza dos asignaciones activas solapadas de la misma mesa, incluso concurrentes; requiere btree_gist.

Bloquear reserva y mesas en orden UUID al asignar, cambiar o liberar. Validar capacidad conjunta de mesas activas, ventana compatible con reserva y ausencia de asignaciones activas duplicadas. Cancelar, terminar o reasignar libera la asignación en el mismo commit y conserva su fila. Walk-ins actualizan estado operativo bajo bloqueo de mesa; al sentar reserva comprobar ocupación real. Excluir sólo reservas no sustituye el control de una mesa ocupada por servicio presencial. Grupo de varias mesas permitido; la tabla no obliga al cliente a elegir.

Historial guarda from/to, actor, hora y motivo; status actual se actualiza conjuntamente. Validar origen contra estado bloqueado. customer_restrictions NO_RESERVATIONS y FULL_BLOCK se evalúan antes de confirmar; tolerancia/no-show son configurables.

## R03 — Recetas y modificadores

Una recipe produce output_item_id; recipe_version fija rendimiento en su unidad base. Cada componente referencia item y, opcionalmente, una versión de subreceta. La subreceta debe producir exactamente component_item_id. Publicación verifica versiones PUBLISHED, dimensiones y aciclicidad transitiva. El CHECK sólo evita autorreferencia directa; la validación recursiva es obligatoria.

Serializar publicaciones/cambios de BOM usando una fila de control bloqueada o bloqueo asesor transaccional común a las publicaciones. Recorrer con CTE recursiva manteniendo camino de IDs y rechazar una versión repetida. Validar también ciclos por item producido si se permiten recetas alternativas. No confiar en dos validaciones concurrentes sin serialización. Publicar congela versiones y componentes; cambios posteriores crean versión nueva. RETIRED impide nuevas selecciones, preserva referencias existentes.

Menu y producción fijan versión compatible con item producido. Pedidos copian la versión al enviar. Cantidad requerida = cantidad de producto / yield_quantity × cantidad del componente / (1-waste_fraction). Si se consume una preparación disponible se descuenta esa preparación; sólo expandir subreceta cuando realmente se producirá, evitando consumo doble de subreceta e ingredientes.

Seleccionar modificadores exige grupo habilitado para el menu_item, min/max, opciones activas y cantidades válidas. Precio del modificador usa moneda del menú; el catálogo actual es para una moneda operativa. Guardar name_snapshot, price_delta y order_modifier_item_impacts al enviar. Delta de ingredientes puede ser negativo (sin queso) pero consumo final no puede ser negativo. Disponibilidad usa ese impacto congelado; no releer valores cambiados para pedidos históricos.

## R04 — Inventario y disponibilidad física

inventory_movements es libro inmutable; inventory_balances es proyección. En una transacción bloquear saldos (lot_id,location_id) en orden estable, crear asientos, actualizar saldos y asignaciones, y emitir outbox/audit. Resolver creación simultánea de saldo con UNIQUE y reintento. Nunca leer cantidad, calcular en cliente y escribir sin bloqueo o compare-and-swap.

La cantidad del saldo es suma de asientos; reservado es suma de asignaciones abiertas. expires_at no libera físicamente una reserva por sí solo: proceso transaccional marca released_at y reduce reservado. Consumir la asignación y descontar stock en el mismo commit. Cantidad y reservado no pueden ser negativos ni reservado exceder existencia. Saldo inicial exige lote con source_reason y ADJUSTMENT autorizado.

FEFO: lotes del item, no vencidos, saldos disponibles positivos; ordenar expires_at ASC NULLS LAST, received_at, id. Bloquear candidatos y recalcular bajo bloqueo. Índice item_id/expires_at/id apoya selección. Consumo captura costo del lote; no recalcular con último precio del proveedor.

TRANSFER exige exactamente dos asientos por lote, suma cero, origen y destino distintos de cabecera, costo igual y contabilización atómica. WASTE/INTERNAL_USE requieren motivo. Reverso de movimiento es opuesto exacto de cantidad, mismo lote, ubicación y costo; único reversal_of_id. La reversión es ADJUSTMENT/RETURN para no violar signo de SALE o CONSUMPTION. No borrar un asiento para corregirlo.

FK de procedencia debe coincidir con item, lote, ubicación y documento: PURCHASE sólo desde recepción POSTED; PRODUCTION desde salida USABLE; CONSUMPTION de producción desde production_consumptions; SALE/consumo de venta desde order_item. ADJUSTMENT/RETURN requiere motivo y autorización. No permitir múltiples orígenes de negocio incompatibles en un mismo asiento.

## R05 — Compras y recepción

requested_quantity es solicitada, purchased_quantity comprometida, cantidades recibidas se derivan de recepciones POSTED y compensaciones documentadas. No duplicar total recibido en purchase_order_items.

Estados resumidos: REQUESTED sin compromiso; PARTIALLY_PURCHASED si alguna cantidad está comprometida pero no toda y no hay recepción; PURCHASED cuando compromiso completa solicitud y aún no se recibe; PARTIALLY_RECEIVED si hay recepción pero queda compromiso o solicitud sin cubrir; RECEIVED cuando todo lo requerido comprometido y aceptado está completo. CANCELLED sólo tras cancelar saldo pendiente y resolver existencias/documentos previos; no elimina recepciones contabilizadas. Reducir solicitud pendiente requiere motivo e historial, nunca editar una recepción pasada.

Recepción puede ser parcial, con rechazo separado. Bloquear purchase_order y sus líneas, verificar pertenencia de cada línea a la misma orden; suma aceptada no supera comprado. Un exceso se resuelve aumentando explícitamente compromiso autorizado antes de contabilizar. goods_receipts pasa DRAFT → POSTED una vez: accepted_quantity genera lotes/movimientos/saldos en una sola transacción. Rechazado no entra al stock. Suma de entradas por línea y lotes coincide con aceptado. Presentación debe corresponder al item; precio y cantidades ya convertidos a base quedan congelados.

Anular recepción contabilizada exige reversos de todos sus efectos y que exista cantidad física libre suficiente; si ya se consumió, no se puede simplemente hacer REVERSED. Devolución posterior usa movimiento RETURN negativo documentado con línea de recepción y motivo; evaluar documento específico de devolución al confirmar necesidades de cuentas por pagar. Este modelo cubre compras operativas, no contabilidad general ni cuentas por pagar a proveedores.

## R06 — Producción y costo

SUGGESTED requiere fuente opcional IA y decisión humana. Aceptar fija accepted_by/at y PENDING; modificar fija modified_by y motivo además de auditoría before/after; rechazar fija rejected_by/at y CANCELLED. PENDING → IN_PROGRESS → AVAILABLE; merma total puede terminar DISCARDED. CANCELLED después de consumir requiere contabilizar devolución/merma real.

Una orden admite varias ejecuciones production_batches; cada una tiene historial propio. planned_quantity y salidas están en unidad base del output item. Bloquear orden, batch y saldos. Consumos por lote y movimientos negativos coinciden uno a uno en cantidad y costo. Salidas USABLE generan lotes y movimientos positivos; WASTE no aumenta stock utilizable. No generar un lote de salida antes de confirmar ejecución real.

Fijar política de costeo en settings: costo total de consumos dividido entre rendimiento utilizable, con asignación explícita de merma. Moneda coincide con production_order.currency_id; lotes de otras monedas requieren conversión explícita futura, hoy se rechazan. Ningún precio de menú recalcula costos históricos. AVAILABLE indica ejecución terminada con salida; disponibilidad posterior depende del stock restante y caducidad, no de conservar ese estado indefinidamente.

## R07 — Disponibilidad, operación y pedidos

Disponibilidad calculada usa receta, impactos, existencias libres no vencidas, capacidad, producción terminada y estado operativo. Resultado es derivado, no tabla permanente de verdad. Se puede cachear con versión de datos y caducidad fuera de este borrador.

Override vigente más reciente de canal específico prevalece sobre ALL, y ambos sobre el cálculo comercial. Un override no se elimina por recalcular. is_available=true permite decisión comercial pero jamás stock negativo ni saltar cierre/restricción de seguridad; falta física exige producción/ajuste autorizado real. Resolver conflictos por created_at,id y registrar actor/motivo al crear o revocar.

service_status tiene flags independientes. Aceptación online exige restaurant_open, online_orders_enabled y canal de cumplimiento; operación presencial exige dine_in_enabled. high_demand afecta estimación, no bloquea necesariamente. production_in_progress se deriva de ejecuciones activas y se actualiza bajo bloqueo del singleton; before/after queda en historial.

Pedido conserva channel diferente de order_type. Estado DRAFT → SUBMITTED → ACCEPTED → IN_PREPARATION → READY → COMPLETED, con cancelaciones autorizadas y compensaciones. No imponer toda transición sólo mediante CHECK: validar estado previo bloqueado, condiciones y permiso. Evaluar restricciones NO_DELIVERY, PREPAY_ONLY, FULL_BLOCK, REQUIRES_AUTH al admitir la acción, no sólo al crear cuenta.

Al enviar líneas congelar precio, nombre, versión y modificadores. quantity puede fraccionarse comercialmente; si un platillo sólo admite enteros, aplicar contrato configurable del producto antes de enviar. Sustitución crea nueva línea con replaces_order_item_id del mismo pedido, preserva anulada y motivo. Nunca borrar silenciosamente línea enviada. Liberar reservas, cancelar comandas y ajustar cuentas/reembolsos de manera explícita.

Comanda por área: kitchen_ticket_items y order_items comparten order; cantidades activas no exceden enviado. Incrementos generan nueva sequence_number. Área e items de comanda son histórico; cambiar el área del menú no rerutea comandas ya enviadas.

## R08 — Cuentas, pagos, propinas y fiscalidad

bill_orders permite N:M pedido/cuenta. Para bill_item SALE, order_item debe pertenecer a un pedido vinculado a la bill. Bloquear order_item y bills en orden estable; suma de cantidades no anuladas facturadas entre cuentas no supera cantidad cobrable del pedido. No editar cantidades o importes de cuentas emitidas/pagadas; corregir con anulación autorizada, reasignación previa al pago o nota de crédito según fase.

Todos los pedidos, cuentas, facturas, cajas y comprobantes asociados deben compartir moneda. payments hereda moneda de bill; commissions/refunds/allocations la heredan del pago. Bill total excluye tips. Fórmula de venta está en diccionario; pagos parciales sólo liquidan la suma de SALE exitosa neta de reembolsos. PAID exige saldo de venta cero y decisión explícita sobre propinas pendientes. Impedir sobrepago aplicado a venta; el cambio de efectivo no es ingreso, payment.amount es cobro neto aplicado.

Antes de SUCCEEDED verificar SUM(payment_allocations.amount)=payment.amount, tip en misma bill y límite de venta/propina. Reservar importe de pagos PENDING bajo bloqueo de bill evita dos autorizaciones simultáneas por todo el saldo. Interacción con procesador no mantiene transacción abierta durante red: persistir intento y clave, enviar con idempotencia del proveedor, confirmar mediante webhook autenticado; reconciliar estados inciertos antes de liberar reserva de cobro.

No prometer transacción ACID única entre procesador y PostgreSQL. proveedor/provider_reference únicos identifican operación externa; idempotencia también cubre efectivo sin proveedor. Cambios de PENDING a éxito/fracaso se auditan. payment_receipts se emite sólo para pago exitoso con importe/moneda coincidentes y numeración única; no sustituye factura fiscal.

Reembolsos: bloquear pago y asignaciones; suma exitosa por asignación no excede cobrado, SUM(refund_allocations)=refund.amount y sus asignaciones pertenecen al mismo pago. Refunded money de propina disminuye disponible a distribuir. SUM(tip_distributions) no supera propina cobrada neta de reembolsos; si ya se distribuyó, resolver recuperación antes de devolver. Comisiones se registran por separado.

Factura conserva emisor, receptor, dirección, identificador opcional, moneda, líneas y autorización. No NIT obligatorio ni formato fiscal inventado. total = subtotal + tax_total; cabecera debe igualar suma de líneas. Un bill_item no puede emitirse dos veces por cantidades acumuladas en facturas vigentes. Nota de crédito referencia factura original y no excede cantidades/importes pendientes de acreditar. Inmutabilidad después de emisión y anulación mediante procedimiento fiscal.

## R09 — Caja

Una sesión OPEN/CLOSING por caja (índice UNIQUE parcial). Un movimiento OPENING por sesión. Bloquear cash_session al registrar efectivo o iniciar cierre; sólo OPEN admite movimientos. Validar is_cash del método, moneda y payment.amount de SALE. Un mismo pago/reembolso no genera dos asientos de caja. Efectivo neto incluye propina; TIP_PAYOUT separa posterior entrega al personal. Transferencia/tarjeta no se registran como efectivo.

expected_cash es SUM(amount_delta), incluido opening. CLOSING bloquea nuevos asientos; calcular corte, guardar cash_reconciliations con counted_cash y diferencia generada, luego CLOSED con responsable. Arqueo final único; intermedios se conservan. No crear salida ficticia de total al cerrar; retiro físico es WITHDRAWAL independiente. Una corrección exige reverso con misma sesión y monto opuesto; tras cierre se documenta ajuste en nueva sesión vinculando la corrección según política autorizada, sin reabrir silenciosamente historia.

## R10 — Mensajería, delivery, IA y visión

Dirección de delivery es snapshot, no sólo FK editable. Reintentos tienen attempt_number; no dos entregas activas para mismo pedido salvo decisión operativa futura. Partner INTERNAL requiere employee; EXTERNAL usa proveedor de reparto. Pedido debe ser DELIVERY y dirección válida. Historial acompaña cambio de estado. Fee cobrada debe reflejar bill_item DELIVERY_FEE; no sumar dos veces desde deliveries.

Una asignación humana activa por conversación. Mensajes e IA pertenecen a conversación coherente; reply_to_message_id apunta dentro de ella. Handoff registra motivo, aceptación y resolución, y cambia handling_mode y asignación en transacción. Aplicar NO_MESSAGING. IDs externos se deduplican por conversación/canal según las claves declaradas. Registrar estado técnico de entrega de mensajes sin borrar contenido histórico.

AI sólo usa API/tools con identidad autorizada, nunca SQL directo. arguments_redacted/result_summary contienen datos mínimos operativos, sin chain-of-thought, credenciales o secretos. Handoff no equivale a ejecución de permiso elevado. Vision sólo almacena referencia de evidencia; confidence no es confirmación humana. Reviews CONFIRM/REJECT conservan revisiones previas; supersedes debe ser del mismo evento y no formar ciclos.

## R11 — Auditoría, eventos e idempotencia

Historial de dominio registra transiciones específicas; audit_logs registra quién cambió qué y resultado; security_events registra seguridad; outbox_events transporta cambios confirmados. No son intercambiables. Cambio sensible + historial + auditoría de éxito + outbox comparten commit. Auditoría de fallo/denegación se registra en transacción independiente cuando la transacción de negocio se revierte. Redactar before/after; entity_id lógico sin FK conserva la referencia aunque no exista el objeto.

request_id corresponde a intento HTTP/tool; correlation_id agrupa flujo distribuido; client_action_id identifica acción originada en cliente pero se valida dentro del principal. Se guardan en puntos de entrada y eventos, no en cada catálogo. Una acción reintentada puede tener varios request_id con una misma clave idempotente.

Tabla idempotency_keys justificada para pedidos, cobros, recepciones y cambios de estado desde varios dispositivos. Clave única (principal_scope,operation,key), request_hash canónico incluye cuerpo y versión de operación. Tomar reserva atómica: misma clave/hash COMPLETED devuelve respuesta mínima guardada; hash distinto es conflicto; IN_PROGRESS vigente solicita reintento. Lock lease no autoriza repetir un efecto desconocido: comprobar recurso/proveedor antes de recuperar un trabajo vencido. Efecto local y COMPLETED se confirman en la misma transacción. Llamadas externas usan clave también en proveedor.

Outbox se inserta atómicamente con negocio. Workers reclaman lotes con FOR UPDATE SKIP LOCKED y lease claimed_until, actualizan intentos/backoff; published_at sólo después de confirmación. Un fallo tras publicar y antes de marcar produce duplicado: consumidores deben deduplicar por event id. aggregate_version se asigna bajo bloqueo/row_version del agregado; puede haber varios eventos de una versión. No depender de hora global para orden total. Retención de publicados y claves idempotentes es configurable; nunca eliminar claves antes de cerrar horizonte de reintentos y conciliación.

## R12 — Concurrencia y consultas

READ COMMITTED con bloqueos explícitos para agregados críticos; SERIALIZABLE cuando regla abarca conjuntos difíciles de bloquear, reintentando fallos de serialización. Ordenar bloqueos por entidad e ID evita muchos deadlocks. Operaciones mutables no críticas pueden hacer UPDATE ... WHERE id = :id AND row_version = :expected, incrementando versión; cero filas es conflicto, no éxito. updated_at/updated_by se actualizan en esa misma sentencia. Ningún default actualiza timestamps automáticamente.

Índices B-tree para filtros por FK y estado/fecha; UNIQUE y PK aportan sus propios índices. No indexar por defecto cada actor de auditoría ni todos los JSONB. Alta frecuencia: keyset con `(occurred_at,id) > (:time,:id)` o comparación inversa según ORDER BY; índice comienza por filtros estables de igualdad. Ejemplo mensajes: conversation_id + created_at + id. Offset reservado a catálogos pequeños.

Búsqueda inicial: códigos/email exactos con UNIQUE; menú por categoría/estado/orden. Búsqueda libre por nombre/description con ILIKE en catálogos pequeños admite barrido. Si volumen/medición lo requiere, migración con pg_trgm para substring o tsvector/GIN para texto; no afirmar que B-tree acelera ILIKE '%texto%'. Validar EXPLAIN con datos representativos antes de ampliar índices.

Auditoría, login, mensajes, visión, inventario y outbox son candidatos de particionado temporal futuro, no particionados ahora. Antes de particionar adaptar claves únicas/FK y retención: PostgreSQL requiere que unicidad global incluya clave de partición donde corresponda. Archivar no equivale a borrar documentos financieros. Consultar saldos/proyecciones para operación, libro para reconstrucción y conciliación.

## R13 — Conservación y seguridad de persistencia

ON DELETE RESTRICT / ON UPDATE RESTRICT explícitos en todas las FK; no cascadas. Usuarios/items/proveedores se desactivan. Roles asignados se revocan conservando historia. Las relaciones de configuración reemplazables pueden retirarse de forma autorizada y auditada; no política universal deleted_at. audit_logs.entity_id y outbox.aggregate_id deliberadamente no tienen FK. Identidades referidas se conservan/anonimizan según política, no hard delete.

Antes de producción: credencial de aplicación sin DDL/superusuario; acceso sólo desde API, roles de lectura/escritura por función, UPDATE/DELETE prohibidos en libros contabilizados y logs; funciones/guardas para ciclos de vida. La cuenta dueña de migraciones se mantiene aparte. Roles RBAC de negocio no son automáticamente roles de PostgreSQL. Retención, respaldo/PITR, restauración ensayada y acceso a evidencias externas se definen según requisitos acordados.

No guardar PAN/CVV, contraseñas, PIN, tokens crudos, claves de cámaras ni claves de proveedor en JSON/settings/logs. Sólo referencias de secretos. IP, user_agent, contacto y evidencias necesitan plazos configurados de conservación y acceso mínimo. Los logs no deben permitir recuperar secretos aunque before/after venga de una entidad sensible.

## Decisiones pendientes del propietario

1. Moneda operativa, precios con/sin impuestos, proveedor fiscal, numeración y política de notas de crédito; no se fijan obligaciones tributarias sin especificación.
2. Clientes invitados online y enlace de contactos externos a cuentas verificadas; permisos y retención por canal.
3. Tolerancias de reserva, combinación de mesas, duración estimada y reglas de no-show.
4. Unidades/presentaciones reales, política de merma/costeo y devolución de compras; umbrales y plazos de caducidad.
5. Propina voluntaria, reparto, comisiones, devolución después de distribución y política de diferencias de caja.
6. Capacidad por estación, prioridades de pedidos, overrides positivos y proveedores de delivery/mensajería.
7. Retención y acceso a auditoría, mensajes y evidencia de cámaras; periodos de idempotencia y reconciliación externa.
8. Si habrá múltiples sucursales o contabilidad general/cuentas por pagar. Se requiere extensión explícita, no está implícita en el alcance actual.

## Referencias técnicas contrastadas

Las restricciones CHECK operan sobre la fila; reglas entre filas requieren otras herramientas. Referencia: [PostgreSQL 18 — Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).

Bloqueos de fila y conflictos requieren orden y reintentos según estrategia transaccional. Referencia: [PostgreSQL 18 — Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html).

NUMERIC permite cantidades exactas con precisión declarada. Referencia: [PostgreSQL 18 — Numeric Types](https://www.postgresql.org/docs/18/datatype-numeric.html).
# Evolución del diseño para la arquitectura integral (2026-09-25)

El generador `database/design/generate.py` sigue siendo la fuente primaria del modelo candidato. `model.json`, `schema/postgresql.sql`, diccionario y ERD son artefactos derivados. La exportación declarativa completa **no** es una migración Flyway ni prueba de funcionamiento. `database/migrations/V1__identity_and_core.sql` es un corte explícito de 23 tablas para identidad, configuración operativa, auditoría y outbox; las demás tablas candidatas requieren migraciones posteriores revisadas. La migración V1 queda inmutable una vez aplicada.

Las siguientes decisiones anteriores quedan **SUPERSEDED** por el alcance actual:

| Decisión anterior | Decisión vigente | Motivo |
|---|---|---|
| `invoices` sólo `DRAFT/ISSUED/VOID`, serie y número obligatorios en draft | Estados FEL desde `DRAFT` hasta `CANCELLED`; serie/número son opcionales antes de certificación; intentos y artefactos separados | Un timeout no prueba emisión ni asigna número fiscal. `UNKNOWN` requiere conciliación. |
| `payments` sólo `PENDING/SUCCEEDED/FAILED/CANCELLED` | Ciclo desde `CREATED` hasta `REFUNDED`, incluido `REQUIRES_ACTION` y `UNKNOWN`; intentos de gateway separados | 3DS, webhooks y conciliación no caben en cuatro estados. |
| `service_status` con booleanos como único estado operativo | `service_capabilities` por capacidad con `ENABLED/MANUAL_APPROVAL/PAUSED/DISABLED` e historial | Un servicio puede pausarse sin detener otros; los booleanos quedan como proyección heredada hasta retirar su uso. |
| Identificación externa por email o hilo sin vínculo verificado | `auth_identities` y `external_customer_identities` usan provider + subject estable | El email/nombre no autorizan fusión de cuentas. |
| IA y visión representadas sólo por sesiones/eventos | Feedback, dataset versionado y evidencia de voucher con revisión humana | La extracción visual nunca confirma un pago; el aprendizaje no es automático. |

Las nuevas tablas son **diseño candidato** salvo las 23 del corte V1. `dining_sessions` agrupa mesas sin borrar historia; `reservation_evaluations` conserva decisiones y estimaciones de capacidad; `payment_intents` y `payment_gateway_events` separan pasarela de cobro; `fiscal_allocations`, `fiscal_attempts` y `fiscal_artifacts` preparan FEL; `message_attachments` y `message_transcriptions` preparan voz; `email_outbox` permite enviar después del commit. Los servicios deben validar ownership, sumas entre filas e idempotencia; ninguna tabla aislada implementa esas reglas.

No se sembraron menú, recetas, mesas físicas ni usuarios con contraseña: esos datos no han sido entregados. La normalización de importes/impuestos FEL queda sujeta a verificación fiscal antes de operar con certificador real. El modelo conserva `service_status` mientras se migra a capacidades para no romper consumidores existentes; deberá eliminarse esa doble representación cuando el backend y las vistas usen la nueva fuente.
