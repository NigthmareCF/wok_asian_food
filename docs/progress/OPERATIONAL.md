# Progreso del canal Operativo

## 2026-10-08 — Integración local autorizada del PR #37 con Barrera

- Responsable: Barrera. Asistencia: Codex. Rama conservada: `feature/barrera-table-orders`. HEAD previo `04a0351`, fuente integrada `origin/feature/web-integrated-delivery-finance` / `6df0ed4`. Autorizada integración local y resolución de solapamientos; sin publicación ni merge a development.
- Respaldo: stash `barrera-before-pr37-local-integration` con archivos modificados y no rastreados, conservado sin aplicar/pop; copia adicional temporal previa. Los cambios propios se restauraron selectivamente para no sobrescribir conexiones nuevas. No ejecutar stash pop sobre esta integración: contiene contratos antiguos con las mismas rutas.
- Combinación con `git merge --no-commit --no-ff`: conflictos resueltos en detalle de Mesas, test de detalle, cola de Reservas y este registro. Mesas conserva accesibilidad, traducciones y recuperación ante errores; incorpora cuentas reales, comprobación de permisos/saldos y diálogo de liberación del #37. La cola conserva validación de respuesta/versión, bloqueo tras 401/403 y recuperación de Barrera; incorpora polling/timeout del #37.
- Tests de recuperación de Mesas conservados y adaptados en `operational-table-recovery.test.tsx`; pruebas financieras del #37 permanecen en su archivo original. Pruebas de Reservas y listado adaptadas al fixture de sesión real del nuevo transporte de lecturas privadas.
- Contratos consolidados: se usa kitchen/live-contract.ts del #37 con items por ticket y el parser que consume su BFF; añadido límite Java int de expectedVersion y regresiones de estados/motivo/versiones. Se usa orders/order-request-contract.ts del #37, con validación de tipo/límite de reason y coherencia ACCEPTED/orderId, REJECTED/null; pruebas de Barrera adaptadas en order-request-contract-regression.test.ts. No se reintrodujeron archivos duplicados operational-request-contract.ts ni validadores sin consumidor de StationLoad; originales preservados en stash.
- Instalación reproducible: `npm ci --no-audit --no-fund` aprobada con el lockfile integrado. Web: lint y typecheck aprobados; `npm run test --workspace @wok/web -- --maxWorkers=2`: **847 tests / 95 archivos**, todos aprobados. Tras el último ajuste de traducción de cuentas: **41 tests de Mesas / 7 archivos**, typecheck y build nuevamente aprobados. `npm run build:web`: Next 16.3.8, 107 páginas. Mobile: lint y typecheck aprobados, sin prueba en Android físico.
- Backend: Java 21 y wrapper Maven, `mvnw.cmd --batch-mode --no-transfer-progress verify`: 252 tests reportados, 251 aprobados y 1 opt-in omitido, cero fallos/errores. PostgreSQL18 Testcontainers se ejecutó realmente. Después se activó `WebFindingBoundaryIntegrationTest` con `wok.web.test.dir` apuntando a apps/web (sin .env) y `wok.web.next.bin` al CLI local: 1/1 aprobado, cero omitidos; web/BFF/API/SQL en puertos y base temporales. No se ejecutó el harness visual opcional ni el smoke Bash en esta sección.
- Dependencias: 6 tests del auditor aprobados y auditoría de producción aprobada con las excepciones ya documentadas; no se añadieron excepciones. Lint/typecheck/build y pruebas no certifican todo el restaurante ni una venta manual.
- Migraciones: V1–V27 del #37 validadas/aplicadas en PostgreSQL aislado de tests. No se integraron #35/#38 ni se añadió la otra V26. No se reiniciaron los servicios de la demo ni se aplicaron las nuevas migraciones a su base conservada; localhost sigue sirviendo la imagen anterior hasta un arranque coordinado de API/web.
- Git: conflictos resueltos y cambios preparados en índice; merge sigue pendiente de commit intencionadamente. Sin commit, push, cierre de PR ni modificación de development. Documentos propios de Barrera conservados. No se modificaron secretos/.env.
- Siguiente sección: revisar el resultado preparado y autorizar su commit/publicación; para probarlo manualmente, actualizar juntos API/web tras respaldo y comprobación del historial de migraciones de la base local, o usar un entorno demo separado. El permiso actual no se utiliza para publicar ni para integrar otros PR.


## 2026-10-08 — Contraste con PR remotos antes de integrar

- Responsable: Barrera. Asistencia: Codex. Revisión de solo lectura del código y GitHub; git fetch origin actualizó referencias, conservando todos los cambios locales. development sigue en 9eab323.
- PR #37 (`feature/web-integrated-delivery-finance`, 6df0ed4): abierto, mergeable contra development y tres checks aprobados. Ya aporta BFF de cuentas/pedidos/tickets/solicitudes, transporte PATCH y vistas operativas conectadas. También añade su propia consulta backend de solicitudes y detalle de líneas por ticket; no depende necesariamente de integrar primero #35 para tener listado. Sus contratos deben revisarse como conjunto con sus consumidores.
- PR #35 (`feature/chan-order-contracts`, 01f1143): abierto; API y Docker aprobados, Web y móvil fallido. Añade otra implementación de GET operativo lista/detalle de solicitudes. No sustituir una por otra sin comparar DTOs/filtros/consumidores.
- PR #38 (`feature/chan-delivery-contracts`, 2768be3): abierto; API y Docker aprobados, Web y móvil fallido. Habilita creación de pedido delivery al aceptar y valida que esté habilitado. Revisar compatibilidad con el backend de #37 antes de integrarlo. En esta revisión no se diagnosticó nuevamente el paso exacto de CI fallido.
- PR #39 (esta rama, 04a0351): abierto, mergeable contra development y tres checks aprobados. Los cambios locales de las secciones posteriores aún no están publicados y no están cubiertos por esos checks remotos.
- Riesgo confirmado: #35 agrega V26__cash_movement_payment_traceability.sql; #37 agrega V26__presential_payment_attempts.sql (y V27). Colisión de versión Flyway si ambos se combinan sin resolverla. La solución depende de qué migraciones ya hayan sido aplicadas; corresponde a Chan/Fernando, no renombrar a ciegas.
- Solapamiento local importante: los nuevos kitchen/live-contract.ts y su test coinciden en ruta con #37, cuyo TicketView incluye items. El contrato local corresponde al backend antiguo sin items. El nuevo operational-request-contract.ts duplica parte del propósito de order-request-contract.ts de #37. No publicarlos como contratos definitivos sin consolidar con #37. Mesas y Reservas también tienen cambios compartidos entre ambas ramas; preservar accesibilidad, recuperación ante errores y las pruebas relevantes al resolverlos.
- Recomendación: usar #37 como candidato de integración revisado, comparar los cambios de Barrera y conservar solo mejoras no cubiertas. Evaluar por separado qué aportes adicionales de #35/#38 se necesitan y resolver migraciones/DTOs antes de combinar ramas. No asumir que checks verdes individuales validan la combinación.
- Otra referencia actualizada: feature/backend-capacity-order-lifecycle avanzó a 017a6f3, con pruebas de reconciliación concurrente y cambios previos de cocina. No se detectó PR de esa rama en los 20 PR recientes consultados; no se integró.
- Sin merge, cherry-pick, cambios de rama, commit o push. Siguiente acción requiere autorizar integración local concreta de #37 y tratamiento de archivos solapados; el permiso para revisar Git no amplía por sí solo la autorización de nuevas rutas/backend compartido.


## 2026-10-08 — Revisión conjunta de la entrega local de Barrera

- Rama: `feature/barrera-table-orders`. Responsable: Barrera. Asistencia: Codex.
- Alcance revisado: 10 archivos con cambios de contenido (5 existentes y 5 nuevos): presentación/accesibilidad de Mesas; contratos aislados de Cocina y decisiones de solicitudes con sus tests; registro de las pruebas reales de Reservas. `next-env.d.ts` figuraba modificado antes de esta entrega pero no presenta diferencia de contenido en Git; se conservó y no forma parte del alcance.
- Validación conjunta ejecutada: `npm run test --workspace @wok/web`: **465 pruebas aprobadas en 63 archivos**. `npm run build:web`: aprobado con Next 16.3.8 y TypeScript, 94 páginas generadas. Prettier --check sobre los 9 archivos de código de la entrega: aprobado. `git diff --check`: aprobado. Lint y typecheck web ya aprobados en la sección precedente sobre este código; no se repitieron sin cambios funcionales.
- Resultado: preparada para revisión/publicación la mejora de Mesas y la preparación de contratos. Reservas conserva evidencia de confirmación/concurrencia reales de la sección anterior. Cocina y solicitudes solo tienen validadores preparados, sin consumidores de producción; no se afirma que esos recorridos estén conectados.
- No se modificaron dependencias, backend, migraciones, BFF, secretos ni transporte compartido. No se repitieron pruebas Java/móvil porque este alcance no los modifica. Esta verificación local no equivale a checks remotos de un nuevo commit.
- Propuesta de entrega: `feat(operational): mejora accesibilidad de mesas y prepara contratos operativos`. Descripción: controles de Mesas de al menos 44 px con foco visible y estados de cuenta en español; validadores acordes con los contratos existentes de tickets y decisiones de solicitudes; evidencia de confirmación/concurrencia de reservas; validación web completa.
- Publicación pendiente: no se hizo staging, commit, push ni merge. Conservar la rama actual y publicar exclusivamente los archivos revisados cuando exista autorización para esta entrega. Antes de actualizar el PR #39, verificar que siga abierto y que la base/remoto no haya cambiado; no se consultó GitHub en esta revisión local.
- Decisión siguiente para avanzar funcionalmente: revisar/integrar los PR de contratos y conexiones existentes, o autorizar la ampliación BFF concreta documentada en las entradas de Cocina/solicitudes. No continuar preparando contratos sin consumidor indefinidamente.


## 2026-10-08 — Solicitudes: contrato de decisión y bloqueo de consulta

- Rama: `feature/barrera-table-orders`, HEAD `04a0351`. Responsable: Barrera. Asistencia: Codex.
- Completado: tipos y validadores de DecisionRequest/DecisionResult en `modules/orders/operational-request-contract.ts`, basados en `OperationalOrderRequestController.java`, y pruebas en `operational-request-contract.test.ts`. Código preparado sin consumidor de producción; no se conectó la bandeja ni se inventó DTO de consulta.
- Backend observado en esta rama: POST `/api/v1/operational/order-requests/{requestId}/decision`, permiso `orders:manage`, cuerpo action ACCEPT/REJECT y reason opcional de hasta 500 caracteres; REJECT exige motivo no vacío en servicio (422). Sin expectedVersion. Bloqueo FOR UPDATE; repetir la misma decisión devuelve idempotentReplay=true; decisión contraria sobre una solicitud atendida/cancelada devuelve 409. ACCEPT solo admite PICKUP; DELIVERY devuelve 422. No trasladar el contrato CONFIRM/expectedVersion de Reservas a este flujo.
- Consulta: búsqueda en controladores y referencias a order_requests no encontró GET operativo de listado/detalle en esta rama. Los GET de ClientPickupRequestController y ClientDeliveryRequestController están restringidos a CLIENT y filtran customer_user_id; el BFF /bff/order-requests consulta ese historial personal. No sirve para bandeja global ni debe eludirse su aislamiento.
- Pantalla: /operation/online-requests compone OnlineRequestsView, consume initialOnlineRequests vía MessagingSessionProvider y altera sesiones locales de pedidos/delivery/reservas/mesas. Sus reglas de horario fijo y disponibilidad proceden del prototipo, no de una consulta real. No se modificaron los módulos compartidos de mensajería ni las reglas del backend.
- Dependencias verificadas: Chan debe aportar/integrar consulta operativa autorizada de lista/detalle y confirmar soporte delivery; Barrera puede consumirla después de verificar el contrato. Rutas BFF de consulta/decisión requieren aprobación específica. La decisión usa POST, ya soportado por el transporte común: no depende de PATCH. Revisar primero los PR existentes de contratos para evitar duplicación; esta entrada describe la rama local, no asegura el estado remoto actual.
- Pruebas ejecutadas: `npm run test --workspace @wok/web -- src/modules/orders`: 35 aprobadas en 2 archivos, incluidos los tests existentes. Lint web y typecheck web aprobados. Validación de razón vacía/límite, acciones inválidas, IDs, coherencia estado/orderId y replay. Son pruebas aisladas; no se ejecutaron decisiones reales ni pruebas de permisos/concurrencia contra backend en esta sección. Sin datos nuevos en base.
- Estado: contrato individual listo; bandeja integrada pendiente. Solo dos archivos nuevos del área Pedidos y este registro; trabajo local previo conservado. Sin commit ni push.
- Siguiente sección: revisión conjunta de los cambios locales de Barrera y preparación de entrega; la conexión de cuentas, cocina y solicitudes depende de aprobar/integrar contratos y BFF ya identificados, no de seguir añadiendo validadores sin consumidores.


## 2026-10-08 — Cocina: contrato real preparado para conexión

- Rama: `feature/barrera-table-orders`. Responsable: Barrera. Asistencia: Codex.
- Sección independiente completada: `modules/kitchen/live-contract.ts` define y valida TicketView, StationLoad y TicketStatusRequest contra `KitchenController.java` de esta rama. Pruebas en `live-contract.test.ts`. Sin cambios de pantalla, BFF, backend o transporte compartido. El contrato todavía no está conectado a un consumidor de producción.
- Evidencia en código: KitchenBoardView usa fixtures/orders y useOrderSession; los cambios son locales. La ruta /operation/kitchen compone ese componente. No existen rutas BFF de cocina/pedidos en esta rama. endpoint.ts admite GET/POST/PUT/DELETE, no PATCH; ya puede reenviar X-Request-Id con requestId:true.
- Contratos backend existentes (inspeccionados, no ejecutados en vivo en esta sección): GET operational/kitchen/tickets con stationId/status; GET operational/kitchen/load; POST operational/kitchen/tickets/{ticketId}/claim sin cuerpo ni expectedVersion; PATCH operational/kitchen/tickets/{ticketId}/status con status, expectedVersion positivo y reason opcional hasta 300 caracteres. Requieren kitchen:manage.
- Estados de ticket: QUEUED, PREPARING, READY, RECALLED, CANCELLED. OPEN incluye QUEUED/PREPARING/RECALLED, no READY; un tablero con listos debe consultar READY además de OPEN. Los nombres de estaciones deben venir del servidor, no de la lista fija Wok/Sushi/Fría del prototipo.
- Detalle de platos: TicketView contiene contadores, no líneas. GET operational/orders/{orderId} ofrece items y tickets; requiere orders:manage. No hay endpoint de edición de ETA en KitchenController. No inventar ETA ni sincronización realtime. El detalle de pedido no contiene una relación explícita entre cada línea y cada ticket/secuencia: evitar presentar todas las líneas del pedido como contenido exacto de una comanda sin verificar esa correspondencia.
- Entrega/servicio: PATCH operational/orders/{orderId}/status, transición READY -> SERVED, con la versión del pedido (no la del ticket); requiere orders:manage. Esto no certifica reparto/delivery ni pago.
- Cambio mínimo propuesto, NO implementado ni autorizado: BFF GET cocina/tickets, GET cocina/load, POST cocina/tickets/{id}/claim, PATCH cocina/tickets/{id}/status; para detalle y servicio, GET pedidos, GET pedidos/{id} y PATCH pedidos/{id}/status. Reutilizar endpoint.ts tras añadir PATCH bajo responsabilidad/autorización de Fernando; validar query, UUID, cuerpo y respuesta y reenviar X-Request-Id en mutaciones. No crear un proxy genérico ni exponer tokens al navegador. Revisar PR existentes antes de crear estas rutas para no duplicar trabajo.
- Pruebas ejecutadas: `npm run test --workspace @wok/web -- src/modules/kitchen`: 30 aprobadas en 2 archivos (contrato nuevo y tablero existente). Lint web, typecheck web y git diff --check aprobados. Datos artificiales solo en tests. No hubo prueba integrada ni cambios en la base en esta sección; no se certificaron permisos, concurrencia o entrega real con estos tests de contrato.
- Estado: preparación individual lista; Cocina todavía no está conectada. Conservados todos los cambios locales anteriores. Sin commit ni push.
- Siguiente tarea independiente: revisar consulta y contrato de la bandeja de solicitudes; integración de cocina requiere aprobar o integrar las rutas verificadas y el soporte PATCH antes de modificar su consumidor.


## 2026-10-08 — Reservas: confirmación y concurrencia reales

- Rama: `feature/barrera-table-orders`. Responsable: Barrera. Asistencia: Codex.
- Entorno: Docker local en localhost, cuentas demo existentes Cliente, Operativo y Administrador. Sin cambios de código, contratos, credenciales o permisos; únicamente esta documentación y creación/confirmación de dos reservas identificadas PRUEBA mediante rutas existentes.
- Concurrencia real por HTTP a través del BFF: dos usuarios distintos (OPERATIONAL y ADMIN) consultaron la misma reserva y versión 1; se iniciaron ambos PUT asíncronos antes de esperar respuestas. ADMIN obtuvo 200 CONFIRMED y versión 2; OPERATIONAL obtuvo 409. No fue una carrera de dos ventanas ni dos usuarios ambos OPERATIONAL: fueron dos actores autorizados con sesiones independientes. Reserva `a2a3732f-1e19-4cfd-91ab-1d747fafb9a4`, fecha 2026-10-13 18:00 Guatemala.
- Persistencia: dejó de aparecer en pendientes; GET del historial Cliente devuelve CONFIRMED. Consulta SQL de solo lectura comprobó una sola transición REQUESTED -> CONFIRMED y un único RESERVATION_REVIEWED exitoso; X-Request-Id del ganador `97cdc71b-7397-4059-a5b3-50a381e3ef02` coincide en historial y auditoría. Perdedor: `19fc4f0f-f9bd-4c5a-a847-8ff2d7c89eee`.
- Navegador: Operativo confirmó la reserva `12128fe0-863b-4c86-acc8-45fcdda4cefb`, fecha 2026-10-14 18:00 Guatemala, introduciendo motivo identificado PRUEBA. Mostró Solicitud confirmada y cola vacía; recarga mantuvo cola vacía. SQL confirmó CONFIRMED, versión 2 e historial con requestId `68166a5d-f6ef-48c3-8565-6b90b0abb517`. Captura: `reserva-confirmada-barrera.png`, artefactos locales de la conversación.
- Pruebas: `npm run test --workspace @wok/web -- src/modules/reservations/components/operational-reservation-queue.test.tsx src/modules/reservations/live-contract.test.ts src/app/bff/operational/reservations/operational-reservations.test.ts`: 26 aprobadas en 3 archivos. Son pruebas aisladas complementarias; la carrera y confirmación anteriores usaron servicios y persistencia reales. No se repitieron lint/build porque no cambió código.
- Limitación de limpieza: ambas reservas quedan CONFIRMED y rotuladas PRUEBA en la base local. Las rutas actuales solo cancelan/rechazan pendientes; no se borraron registros ni se forzaron estados por SQL. No deben tratarse como reservas reales.
- Hallazgo ajeno al alcance: historial Cliente conserva decision REQUIRES_HUMAN_APPROVAL y mensaje Revisaremos la disponibilidad después de confirmar, aunque reservationStatus es CONFIRMED. Chan debe revisar la semántica del historial y Antony la presentación del estado actual. No se alteraron esos módulos.
- Estado: confirmación visual y control de concurrencia integrados comprobados en este escenario; no certifica carga sostenida ni todos los permisos o fallos en entorno real. Sin commit ni push de esta sección.
- Siguiente: inventariar las conexiones existentes de cocina/entrega y solicitudes en la rama de trabajo antes de elegir el próximo cambio independiente. Nuevas rutas y transporte compartido siguen requiriendo autorización específica.


## 2026-10-08 — Mesas: textos, teclado y pantallas pequeñas

- Rama: `feature/barrera-table-orders`. Responsable: Barrera. Asistencia: Codex.
- Vistas: O-02 y O-03, listado y detalle de mesas.
- Completado: estados de cuenta en español (Abierta, En cobro, Pagada), mensaje de acciones no disponibles limitado a esta pantalla y formulario con indicador accesible de expansión. Controles de al menos 44 px, foco visible y ajuste de nombres largos; estilos limitados al módulo.
- Archivos: `modules/tables/presentation.ts`, componentes `operational-tables-view.tsx`, `operational-table-detail-view.tsx`, `operational-tables.module.css` y expectativa de texto en `operational-tables-view.test.tsx`.
- Pruebas: `npm run test --workspace @wok/web -- src/modules/tables` (30 aprobadas en 6 archivos); lint web y typecheck web aprobados; compilación de producción aprobada mediante `docker compose up -d --build --no-deps web`; `git diff --check` aprobado. Primer intento de Vitest bloqueado por permisos temporales del aislamiento; repetición fuera de él aprobada. Una expectativa antigua PAID se actualizó al texto Pagada.
- Navegador real local: listado/formulario y detalle a 390, 768, 1280 y 1440 px, sin desbordamiento horizontal; controles de al menos 44 px. Enter abre formulario, Tab enfoca Nombre con contorno visible, Espacio oculta formulario, teclado filtra estado y muestra vacío, Enter abre detalle y retorna al listado. Se utilizó la mesa de prueba existente, sin crear registros ni abrir/cerrar cuentas en esta revisión.
- Evidencia: captura local `mesas-responsive-detalle.png` en los artefactos de esta conversación. Responsive comprobado con viewport de navegador; no equivale a prueba táctil en dispositivo físico. Los estados de cuenta se verificaron en código/pruebas; la mesa visible no tenía cuenta abierta.
- Estado: sección de presentación lista individualmente y lectura/navegación comprobadas contra el sistema local. No certifica el módulo completo ni otros recorridos.
- Siguiente sección: confirmación de reserva y concurrencia real. Sin cambios de backend, BFF o dependencias en esta sección. Cambios locales todavía sin commit ni push; PR de referencia: https://github.com/NigthmareCF/wok_asian_food/pull/39.




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

## 2026-10-08 — Integración local autorizada del PR #37 con Barrera

- Responsable: Barrera. Asistencia: Codex. Rama conservada: `feature/barrera-table-orders`. HEAD previo `04a0351`, fuente integrada `origin/feature/web-integrated-delivery-finance` / `6df0ed4`. Autorizada integración local y resolución de solapamientos; sin publicación ni merge a development.
- Respaldo: stash `barrera-before-pr37-local-integration` con archivos modificados y no rastreados, conservado sin aplicar/pop; copia adicional temporal previa. Los cambios propios se restauraron selectivamente para no sobrescribir conexiones nuevas. No ejecutar stash pop sobre esta integración: contiene contratos antiguos con las mismas rutas.
- Combinación con `git merge --no-commit --no-ff`: conflictos resueltos en detalle de Mesas, test de detalle, cola de Reservas y este registro. Mesas conserva accesibilidad, traducciones y recuperación ante errores; incorpora cuentas reales, comprobación de permisos/saldos y diálogo de liberación del #37. La cola conserva validación de respuesta/versión, bloqueo tras 401/403 y recuperación de Barrera; incorpora polling/timeout del #37.
- Tests de recuperación de Mesas conservados y adaptados en `operational-table-recovery.test.tsx`; pruebas financieras del #37 permanecen en su archivo original. Pruebas de Reservas y listado adaptadas al fixture de sesión real del nuevo transporte de lecturas privadas.
- Contratos consolidados: se usa kitchen/live-contract.ts del #37 con items por ticket y el parser que consume su BFF; añadido límite Java int de expectedVersion y regresiones de estados/motivo/versiones. Se usa orders/order-request-contract.ts del #37, con validación de tipo/límite de reason y coherencia ACCEPTED/orderId, REJECTED/null; pruebas de Barrera adaptadas en order-request-contract-regression.test.ts. No se reintrodujeron archivos duplicados operational-request-contract.ts ni validadores sin consumidor de StationLoad; originales preservados en stash.
- Instalación reproducible: `npm ci --no-audit --no-fund` aprobada con el lockfile integrado. Web: lint y typecheck aprobados; `npm run test --workspace @wok/web -- --maxWorkers=2`: **847 tests / 95 archivos**, todos aprobados. Tras el último ajuste de traducción de cuentas: **41 tests de Mesas / 7 archivos**, typecheck y build nuevamente aprobados. `npm run build:web`: Next 16.3.8, 107 páginas. Mobile: lint y typecheck aprobados, sin prueba en Android físico.
- Backend: Java 21 y wrapper Maven, `mvnw.cmd --batch-mode --no-transfer-progress verify`: 252 tests reportados, 251 aprobados y 1 opt-in omitido, cero fallos/errores. PostgreSQL18 Testcontainers se ejecutó realmente. Después se activó `WebFindingBoundaryIntegrationTest` con `wok.web.test.dir` apuntando a apps/web (sin .env) y `wok.web.next.bin` al CLI local: 1/1 aprobado, cero omitidos; web/BFF/API/SQL en puertos y base temporales. No se ejecutó el harness visual opcional ni el smoke Bash en esta sección.
- Dependencias: 6 tests del auditor aprobados y auditoría de producción aprobada con las excepciones ya documentadas; no se añadieron excepciones. Lint/typecheck/build y pruebas no certifican todo el restaurante ni una venta manual.
- Migraciones: V1–V27 del #37 validadas/aplicadas en PostgreSQL aislado de tests. No se integraron #35/#38 ni se añadió la otra V26. No se reiniciaron los servicios de la demo ni se aplicaron las nuevas migraciones a su base conservada; localhost sigue sirviendo la imagen anterior hasta un arranque coordinado de API/web.
- Git: conflictos resueltos y cambios preparados en índice; merge sigue pendiente de commit intencionadamente. Sin commit, push, cierre de PR ni modificación de development. Documentos propios de Barrera conservados. No se modificaron secretos/.env.
- Siguiente sección: revisar el resultado preparado y autorizar su commit/publicación; para probarlo manualmente, actualizar juntos API/web tras respaldo y comprobación del historial de migraciones de la base local, o usar un entorno demo separado. El permiso actual no se utiliza para publicar ni para integrar otros PR.


## 2026-10-08 — Contraste con PR remotos antes de integrar

- Responsable: Barrera. Asistencia: Codex. Revisión de solo lectura del código y GitHub; git fetch origin actualizó referencias, conservando todos los cambios locales. development sigue en 9eab323.
- PR #37 (`feature/web-integrated-delivery-finance`, 6df0ed4): abierto, mergeable contra development y tres checks aprobados. Ya aporta BFF de cuentas/pedidos/tickets/solicitudes, transporte PATCH y vistas operativas conectadas. También añade su propia consulta backend de solicitudes y detalle de líneas por ticket; no depende necesariamente de integrar primero #35 para tener listado. Sus contratos deben revisarse como conjunto con sus consumidores.
- PR #35 (`feature/chan-order-contracts`, 01f1143): abierto; API y Docker aprobados, Web y móvil fallido. Añade otra implementación de GET operativo lista/detalle de solicitudes. No sustituir una por otra sin comparar DTOs/filtros/consumidores.
- PR #38 (`feature/chan-delivery-contracts`, 2768be3): abierto; API y Docker aprobados, Web y móvil fallido. Habilita creación de pedido delivery al aceptar y valida que esté habilitado. Revisar compatibilidad con el backend de #37 antes de integrarlo. En esta revisión no se diagnosticó nuevamente el paso exacto de CI fallido.
- PR #39 (esta rama, 04a0351): abierto, mergeable contra development y tres checks aprobados. Los cambios locales de las secciones posteriores aún no están publicados y no están cubiertos por esos checks remotos.
- Riesgo confirmado: #35 agrega V26__cash_movement_payment_traceability.sql; #37 agrega V26__presential_payment_attempts.sql (y V27). Colisión de versión Flyway si ambos se combinan sin resolverla. La solución depende de qué migraciones ya hayan sido aplicadas; corresponde a Chan/Fernando, no renombrar a ciegas.
- Solapamiento local importante: los nuevos kitchen/live-contract.ts y su test coinciden en ruta con #37, cuyo TicketView incluye items. El contrato local corresponde al backend antiguo sin items. El nuevo operational-request-contract.ts duplica parte del propósito de order-request-contract.ts de #37. No publicarlos como contratos definitivos sin consolidar con #37. Mesas y Reservas también tienen cambios compartidos entre ambas ramas; preservar accesibilidad, recuperación ante errores y las pruebas relevantes al resolverlos.
- Recomendación: usar #37 como candidato de integración revisado, comparar los cambios de Barrera y conservar solo mejoras no cubiertas. Evaluar por separado qué aportes adicionales de #35/#38 se necesitan y resolver migraciones/DTOs antes de combinar ramas. No asumir que checks verdes individuales validan la combinación.
- Otra referencia actualizada: feature/backend-capacity-order-lifecycle avanzó a 017a6f3, con pruebas de reconciliación concurrente y cambios previos de cocina. No se detectó PR de esa rama en los 20 PR recientes consultados; no se integró.
- Sin merge, cherry-pick, cambios de rama, commit o push. Siguiente acción requiere autorizar integración local concreta de #37 y tratamiento de archivos solapados; el permiso para revisar Git no amplía por sí solo la autorización de nuevas rutas/backend compartido.


## 2026-10-08 — Revisión conjunta de la entrega local de Barrera

- Rama: `feature/barrera-table-orders`. Responsable: Barrera. Asistencia: Codex.
- Alcance revisado: 10 archivos con cambios de contenido (5 existentes y 5 nuevos): presentación/accesibilidad de Mesas; contratos aislados de Cocina y decisiones de solicitudes con sus tests; registro de las pruebas reales de Reservas. `next-env.d.ts` figuraba modificado antes de esta entrega pero no presenta diferencia de contenido en Git; se conservó y no forma parte del alcance.
- Validación conjunta ejecutada: `npm run test --workspace @wok/web`: **465 pruebas aprobadas en 63 archivos**. `npm run build:web`: aprobado con Next 16.3.8 y TypeScript, 94 páginas generadas. Prettier --check sobre los 9 archivos de código de la entrega: aprobado. `git diff --check`: aprobado. Lint y typecheck web ya aprobados en la sección precedente sobre este código; no se repitieron sin cambios funcionales.
- Resultado: preparada para revisión/publicación la mejora de Mesas y la preparación de contratos. Reservas conserva evidencia de confirmación/concurrencia reales de la sección anterior. Cocina y solicitudes solo tienen validadores preparados, sin consumidores de producción; no se afirma que esos recorridos estén conectados.
- No se modificaron dependencias, backend, migraciones, BFF, secretos ni transporte compartido. No se repitieron pruebas Java/móvil porque este alcance no los modifica. Esta verificación local no equivale a checks remotos de un nuevo commit.
- Propuesta de entrega: `feat(operational): mejora accesibilidad de mesas y prepara contratos operativos`. Descripción: controles de Mesas de al menos 44 px con foco visible y estados de cuenta en español; validadores acordes con los contratos existentes de tickets y decisiones de solicitudes; evidencia de confirmación/concurrencia de reservas; validación web completa.
- Publicación pendiente: no se hizo staging, commit, push ni merge. Conservar la rama actual y publicar exclusivamente los archivos revisados cuando exista autorización para esta entrega. Antes de actualizar el PR #39, verificar que siga abierto y que la base/remoto no haya cambiado; no se consultó GitHub en esta revisión local.
- Decisión siguiente para avanzar funcionalmente: revisar/integrar los PR de contratos y conexiones existentes, o autorizar la ampliación BFF concreta documentada en las entradas de Cocina/solicitudes. No continuar preparando contratos sin consumidor indefinidamente.


## 2026-10-08 — Solicitudes: contrato de decisión y bloqueo de consulta

- Rama: `feature/barrera-table-orders`, HEAD `04a0351`. Responsable: Barrera. Asistencia: Codex.
- Completado: tipos y validadores de DecisionRequest/DecisionResult en `modules/orders/operational-request-contract.ts`, basados en `OperationalOrderRequestController.java`, y pruebas en `operational-request-contract.test.ts`. Código preparado sin consumidor de producción; no se conectó la bandeja ni se inventó DTO de consulta.
- Backend observado en esta rama: POST `/api/v1/operational/order-requests/{requestId}/decision`, permiso `orders:manage`, cuerpo action ACCEPT/REJECT y reason opcional de hasta 500 caracteres; REJECT exige motivo no vacío en servicio (422). Sin expectedVersion. Bloqueo FOR UPDATE; repetir la misma decisión devuelve idempotentReplay=true; decisión contraria sobre una solicitud atendida/cancelada devuelve 409. ACCEPT solo admite PICKUP; DELIVERY devuelve 422. No trasladar el contrato CONFIRM/expectedVersion de Reservas a este flujo.
- Consulta: búsqueda en controladores y referencias a order_requests no encontró GET operativo de listado/detalle en esta rama. Los GET de ClientPickupRequestController y ClientDeliveryRequestController están restringidos a CLIENT y filtran customer_user_id; el BFF /bff/order-requests consulta ese historial personal. No sirve para bandeja global ni debe eludirse su aislamiento.
- Pantalla: /operation/online-requests compone OnlineRequestsView, consume initialOnlineRequests vía MessagingSessionProvider y altera sesiones locales de pedidos/delivery/reservas/mesas. Sus reglas de horario fijo y disponibilidad proceden del prototipo, no de una consulta real. No se modificaron los módulos compartidos de mensajería ni las reglas del backend.
- Dependencias verificadas: Chan debe aportar/integrar consulta operativa autorizada de lista/detalle y confirmar soporte delivery; Barrera puede consumirla después de verificar el contrato. Rutas BFF de consulta/decisión requieren aprobación específica. La decisión usa POST, ya soportado por el transporte común: no depende de PATCH. Revisar primero los PR existentes de contratos para evitar duplicación; esta entrada describe la rama local, no asegura el estado remoto actual.
- Pruebas ejecutadas: `npm run test --workspace @wok/web -- src/modules/orders`: 35 aprobadas en 2 archivos, incluidos los tests existentes. Lint web y typecheck web aprobados. Validación de razón vacía/límite, acciones inválidas, IDs, coherencia estado/orderId y replay. Son pruebas aisladas; no se ejecutaron decisiones reales ni pruebas de permisos/concurrencia contra backend en esta sección. Sin datos nuevos en base.
- Estado: contrato individual listo; bandeja integrada pendiente. Solo dos archivos nuevos del área Pedidos y este registro; trabajo local previo conservado. Sin commit ni push.
- Siguiente sección: revisión conjunta de los cambios locales de Barrera y preparación de entrega; la conexión de cuentas, cocina y solicitudes depende de aprobar/integrar contratos y BFF ya identificados, no de seguir añadiendo validadores sin consumidores.


## 2026-10-08 — Cocina: contrato real preparado para conexión

- Rama: `feature/barrera-table-orders`. Responsable: Barrera. Asistencia: Codex.
- Sección independiente completada: `modules/kitchen/live-contract.ts` define y valida TicketView, StationLoad y TicketStatusRequest contra `KitchenController.java` de esta rama. Pruebas en `live-contract.test.ts`. Sin cambios de pantalla, BFF, backend o transporte compartido. El contrato todavía no está conectado a un consumidor de producción.
- Evidencia en código: KitchenBoardView usa fixtures/orders y useOrderSession; los cambios son locales. La ruta /operation/kitchen compone ese componente. No existen rutas BFF de cocina/pedidos en esta rama. endpoint.ts admite GET/POST/PUT/DELETE, no PATCH; ya puede reenviar X-Request-Id con requestId:true.
- Contratos backend existentes (inspeccionados, no ejecutados en vivo en esta sección): GET operational/kitchen/tickets con stationId/status; GET operational/kitchen/load; POST operational/kitchen/tickets/{ticketId}/claim sin cuerpo ni expectedVersion; PATCH operational/kitchen/tickets/{ticketId}/status con status, expectedVersion positivo y reason opcional hasta 300 caracteres. Requieren kitchen:manage.
- Estados de ticket: QUEUED, PREPARING, READY, RECALLED, CANCELLED. OPEN incluye QUEUED/PREPARING/RECALLED, no READY; un tablero con listos debe consultar READY además de OPEN. Los nombres de estaciones deben venir del servidor, no de la lista fija Wok/Sushi/Fría del prototipo.
- Detalle de platos: TicketView contiene contadores, no líneas. GET operational/orders/{orderId} ofrece items y tickets; requiere orders:manage. No hay endpoint de edición de ETA en KitchenController. No inventar ETA ni sincronización realtime. El detalle de pedido no contiene una relación explícita entre cada línea y cada ticket/secuencia: evitar presentar todas las líneas del pedido como contenido exacto de una comanda sin verificar esa correspondencia.
- Entrega/servicio: PATCH operational/orders/{orderId}/status, transición READY -> SERVED, con la versión del pedido (no la del ticket); requiere orders:manage. Esto no certifica reparto/delivery ni pago.
- Cambio mínimo propuesto, NO implementado ni autorizado: BFF GET cocina/tickets, GET cocina/load, POST cocina/tickets/{id}/claim, PATCH cocina/tickets/{id}/status; para detalle y servicio, GET pedidos, GET pedidos/{id} y PATCH pedidos/{id}/status. Reutilizar endpoint.ts tras añadir PATCH bajo responsabilidad/autorización de Fernando; validar query, UUID, cuerpo y respuesta y reenviar X-Request-Id en mutaciones. No crear un proxy genérico ni exponer tokens al navegador. Revisar PR existentes antes de crear estas rutas para no duplicar trabajo.
- Pruebas ejecutadas: `npm run test --workspace @wok/web -- src/modules/kitchen`: 30 aprobadas en 2 archivos (contrato nuevo y tablero existente). Lint web, typecheck web y git diff --check aprobados. Datos artificiales solo en tests. No hubo prueba integrada ni cambios en la base en esta sección; no se certificaron permisos, concurrencia o entrega real con estos tests de contrato.
- Estado: preparación individual lista; Cocina todavía no está conectada. Conservados todos los cambios locales anteriores. Sin commit ni push.
- Siguiente tarea independiente: revisar consulta y contrato de la bandeja de solicitudes; integración de cocina requiere aprobar o integrar las rutas verificadas y el soporte PATCH antes de modificar su consumidor.


## 2026-10-08 — Reservas: confirmación y concurrencia reales

- Rama: `feature/barrera-table-orders`. Responsable: Barrera. Asistencia: Codex.
- Entorno: Docker local en localhost, cuentas demo existentes Cliente, Operativo y Administrador. Sin cambios de código, contratos, credenciales o permisos; únicamente esta documentación y creación/confirmación de dos reservas identificadas PRUEBA mediante rutas existentes.
- Concurrencia real por HTTP a través del BFF: dos usuarios distintos (OPERATIONAL y ADMIN) consultaron la misma reserva y versión 1; se iniciaron ambos PUT asíncronos antes de esperar respuestas. ADMIN obtuvo 200 CONFIRMED y versión 2; OPERATIONAL obtuvo 409. No fue una carrera de dos ventanas ni dos usuarios ambos OPERATIONAL: fueron dos actores autorizados con sesiones independientes. Reserva `a2a3732f-1e19-4cfd-91ab-1d747fafb9a4`, fecha 2026-10-13 18:00 Guatemala.
- Persistencia: dejó de aparecer en pendientes; GET del historial Cliente devuelve CONFIRMED. Consulta SQL de solo lectura comprobó una sola transición REQUESTED -> CONFIRMED y un único RESERVATION_REVIEWED exitoso; X-Request-Id del ganador `97cdc71b-7397-4059-a5b3-50a381e3ef02` coincide en historial y auditoría. Perdedor: `19fc4f0f-f9bd-4c5a-a847-8ff2d7c89eee`.
- Navegador: Operativo confirmó la reserva `12128fe0-863b-4c86-acc8-45fcdda4cefb`, fecha 2026-10-14 18:00 Guatemala, introduciendo motivo identificado PRUEBA. Mostró Solicitud confirmada y cola vacía; recarga mantuvo cola vacía. SQL confirmó CONFIRMED, versión 2 e historial con requestId `68166a5d-f6ef-48c3-8565-6b90b0abb517`. Captura: `reserva-confirmada-barrera.png`, artefactos locales de la conversación.
- Pruebas: `npm run test --workspace @wok/web -- src/modules/reservations/components/operational-reservation-queue.test.tsx src/modules/reservations/live-contract.test.ts src/app/bff/operational/reservations/operational-reservations.test.ts`: 26 aprobadas en 3 archivos. Son pruebas aisladas complementarias; la carrera y confirmación anteriores usaron servicios y persistencia reales. No se repitieron lint/build porque no cambió código.
- Limitación de limpieza: ambas reservas quedan CONFIRMED y rotuladas PRUEBA en la base local. Las rutas actuales solo cancelan/rechazan pendientes; no se borraron registros ni se forzaron estados por SQL. No deben tratarse como reservas reales.
- Hallazgo ajeno al alcance: historial Cliente conserva decision REQUIRES_HUMAN_APPROVAL y mensaje Revisaremos la disponibilidad después de confirmar, aunque reservationStatus es CONFIRMED. Chan debe revisar la semántica del historial y Antony la presentación del estado actual. No se alteraron esos módulos.
- Estado: confirmación visual y control de concurrencia integrados comprobados en este escenario; no certifica carga sostenida ni todos los permisos o fallos en entorno real. Sin commit ni push de esta sección.
- Siguiente: inventariar las conexiones existentes de cocina/entrega y solicitudes en la rama de trabajo antes de elegir el próximo cambio independiente. Nuevas rutas y transporte compartido siguen requiriendo autorización específica.


## 2026-10-08 — Mesas: textos, teclado y pantallas pequeñas

- Rama: `feature/barrera-table-orders`. Responsable: Barrera. Asistencia: Codex.
- Vistas: O-02 y O-03, listado y detalle de mesas.
- Completado: estados de cuenta en español (Abierta, En cobro, Pagada), mensaje de acciones no disponibles limitado a esta pantalla y formulario con indicador accesible de expansión. Controles de al menos 44 px, foco visible y ajuste de nombres largos; estilos limitados al módulo.
- Archivos: `modules/tables/presentation.ts`, componentes `operational-tables-view.tsx`, `operational-table-detail-view.tsx`, `operational-tables.module.css` y expectativa de texto en `operational-tables-view.test.tsx`.
- Pruebas: `npm run test --workspace @wok/web -- src/modules/tables` (30 aprobadas en 6 archivos); lint web y typecheck web aprobados; compilación de producción aprobada mediante `docker compose up -d --build --no-deps web`; `git diff --check` aprobado. Primer intento de Vitest bloqueado por permisos temporales del aislamiento; repetición fuera de él aprobada. Una expectativa antigua PAID se actualizó al texto Pagada.
- Navegador real local: listado/formulario y detalle a 390, 768, 1280 y 1440 px, sin desbordamiento horizontal; controles de al menos 44 px. Enter abre formulario, Tab enfoca Nombre con contorno visible, Espacio oculta formulario, teclado filtra estado y muestra vacío, Enter abre detalle y retorna al listado. Se utilizó la mesa de prueba existente, sin crear registros ni abrir/cerrar cuentas en esta revisión.
- Evidencia: captura local `mesas-responsive-detalle.png` en los artefactos de esta conversación. Responsive comprobado con viewport de navegador; no equivale a prueba táctil en dispositivo físico. Los estados de cuenta se verificaron en código/pruebas; la mesa visible no tenía cuenta abierta.
- Estado: sección de presentación lista individualmente y lectura/navegación comprobadas contra el sistema local. No certifica el módulo completo ni otros recorridos.
- Siguiente sección: confirmación de reserva y concurrencia real. Sin cambios de backend, BFF o dependencias en esta sección. Cambios locales todavía sin commit ni push; PR de referencia: https://github.com/NigthmareCF/wok_asian_food/pull/39.




## 2026-09-15 — Auditoría de integración de rutas

- Se verificó la cobertura de navegación del canal: Operación, Mesas, Pedidos, Cocina, Reservas, Mensajes, Solicitudes, Delivery, Caja, Pagos, Inventario, Producción y Estado del servicio tienen rutas y accesos en la sidebar.
- Se conservaron los formularios operativos como pendientes de ampliación.

## 2026-10-02 — Mensajería operativa conectada

- `/operation/messages` sustituye el inbox de fixtures por conversaciones APP WAITING de la API, lectura y respuesta del personal autenticado. La bandeja es compartida y no implementa asignación individual.
- Después de responder, el hilo permanece visible con estado Abierta y la conversación sale de la cola. Se conserva el intento idempotente ante respuestas perdidas. Estado del servicio en el shell sigue simulado y su etiqueta lo aclara.
- Prueba local entre Cliente Demo Checkout y Operativo Demo mediante HTTP y navegador: mensaje enviado, respuesta visible, cola sin pendientes. Cliente sin rol operativo recibe 403. Suite web 368 pruebas aprobadas, lint/TypeScript/build Docker correctos.
- Delivery y reservas operativas conservan sus vistas previas; su integración y gestión posterior se deben abordar como siguiente sección. No se hicieron commits ni push.

## 2026-10-08 — Barrera: compatibilidad de mesas con cuentas pagadas

- Sección individual O-02/O-03: corrección del contrato de lectura de mesas. La API existente incluye cuentas PAID en OperationalTableController, pero el validador web solo aceptaba OPEN e IN_COBRO; una mesa pagada invalidaba todo el listado.
- Cambio: aceptar PAID en modules/tables/live-contract.ts sin alterar reglas, backend, transporte común ni rutas BFF. Se conservan validaciones de estados desconocidos y cuentas incompletas.
- Archivos: live-contract.ts, live-contract.test.ts y components/operational-tables-view.test.tsx dentro de apps/web/src/modules/tables.
- Evidencia: dos regresiones nuevas fallaron antes de corregir; después pasaron 13 pruebas de contrato, pantalla y BFF de mesas. TypeScript sin emisión, lint web y build web aprobados. Pruebas y build necesitaron ejecución fuera del aislamiento por permisos de archivos temporales/configuración; la invocación inicial de ESLint desde raíz se corrigió usando el workspace web.
- Estado: listo individualmente con respuestas controladas en pruebas; no validado en navegador contra una cuenta pagada real en esta sesión. No se crearon datos ni se ejecutaron cobros. No se certifica pago/cierre financiero.
- Inventario acotado: mesas y reservas operativas tienen conexiones existentes; detalle de cuenta/pedidos/cocina tiene contratos backend, pero requiere revisar y autorizar BFF faltante antes de conectar. No se declara completado el inventario de todo el canal.
- Próxima tarea independiente: probar y mejorar recuperación del detalle de mesa ante conflicto, respuesta perdida y permisos usando rutas existentes.
- Rama conservada: development; cambios locales sin commit, push ni despliegue. Se preservan los dos documentos locales sin seguimiento. Antes de publicar, mover el trabajo a una rama de tarea autorizada.

## 2026-10-08 — Barrera: recuperación del detalle de mesa

- Sección O-03: ante fallo de red, respuesta inválida o HTTP 5xx después de abrir/cerrar, el detalle informa resultado incierto y consulta nuevamente el listado sin reenviar la mutación. Si falla la consulta, solo ofrece Actualizar hasta recuperar el estado.
- Los conflictos 409 conservan el motivo recibido (incluido cierre rechazado por pedidos pendientes); 401/403 muestran mensajes específicos y bloquean mutaciones hasta volver a entrar al componente con sesión/permisos adecuados. El backend sigue siendo responsable de autorizar cada operación.
- Se evita apertura de mesas inactivas y se añade bloqueo inmediato de solicitudes simultáneas mediante referencia local.
- Archivos: apps/web/src/modules/tables/components/operational-table-detail-view.tsx y su nuevo operational-table-detail-view.test.tsx.
- Validación: 36 pruebas aprobadas en 7 archivos de mesas/BFF, incluidas 10 pruebas nuevas del detalle; lint web y build web con TypeScript aprobados. Dobles HTTP usados exclusivamente en pruebas. No hubo mutaciones de base de datos, despliegue ni pruebas nuevas en navegador real.
- Estado individual listo; validación integrada pendiente. Se preservó el archivo next-env.d.ts que ya estaba modificado al comenzar y el resto del trabajo local. Sin nuevas rutas, cambios backend ni transporte compartido, commit o push.
- Límite: no se añadió timeout local; la recuperación se activa al recibir error/respuesta o rechazo de fetch. La recuperación del listado utiliza el hook compartido existente sin modificarlo.
- Próxima tarea independiente: auditar/probar recuperación y decisiones de reservas operativas con las rutas ya existentes; pedidos/cocina siguen pendientes de autorización para BFF faltante.

## 2026-10-08 — Barrera: recuperación de decisiones de reservas

- Sección O-07: se valida la respuesta de decisión con el contrato existente y se comprueba identidad, decisión, estado y avance de versión antes de anunciar éxito.
- Fallos de red, respuestas inválidas y HTTP 5xx descartan el borrador y recargan pendientes sin repetir PUT. Actualizar manualmente también elimina el borrador para evitar operar con una versión anterior.
- Se conserva el tratamiento de conflictos 409; 404 recarga la cola. HTTP 401/403 muestra mensaje específico y bloquea decisiones hasta volver a entrar con sesión/permisos adecuados. Errores de validación conservan el motivo escrito para corregirlo.
- Se reutiliza el parser existente para validar motivos y versiones; referencia local bloquea envíos simultáneos. No se modifica transporte común, contrato backend ni rutas BFF.
- Archivos: apps/web/src/modules/reservations/components/operational-reservation-queue.tsx y operational-reservation-queue.test.tsx.
- Pruebas: 22 aprobadas en contrato, componente y BFF (7 casos nuevos); lint web aprobado; build con TypeScript aprobado tras corregir dos errores detectados en la primera compilación. Pruebas HTTP controladas, sin registros nuevos en BD ni validación de navegador real en esta sección.
- Estado: listo individualmente, integración real pendiente. Sin commit, push ni despliegue; cambios previos preservados.
- Próxima tarea independiente: ampliar aceptación de rechazo, actualización de expectedVersion tras conflicto y consulta fallida en reservas. La conexión de cuentas/pedidos/cocina mantiene dependencia de BFF aún no autorizado.

## 2026-10-08 — Barrera: aceptación complementaria de reservas

- Se completó la sección de validación acordada sin cambios adicionales al componente productivo.
- Cuatro casos nuevos: rechazo REJECT/CANCELLED exitoso; conflicto seguido de nueva decisión con expectedVersion actualizado (1 → 4); respuesta perdida y consulta fallida con recuperación exclusivamente GET; doble clic mientras PUT está pendiente sin duplicar decisión.
- Archivo: apps/web/src/modules/reservations/components/operational-reservation-queue.test.tsx.
- Evidencia: 26 pruebas aprobadas en 3 archivos de contrato/componente/BFF. TypeScript sin emisión y ESLint del archivo modificado aprobados. No se repitió build porque esta sección solo amplía pruebas; la compilación productiva se verificó en la sección anterior.
- Estado: aceptación individual con dobles HTTP; no representa una nueva prueba integrada ni datos reales. Sin cambios de backend, BFF, contratos, datos, commit o push.
- Próximo avance útil: validación visual de mesas y reservas con el sistema local, verificando primero qué versión sirve el entorno. La conexión nueva de cuenta/pedidos mantiene su dependencia explícita de aprobación del BFF mínimo y no se sustituye por nuevas rondas de pruebas del mismo componente.

## 2026-10-08 — Barrera: comprobación visual local

- Docker estaba detenido; se inició Docker Desktop y se reconstruyó solamente web con docker compose up -d --build --no-deps web. Compilación Docker/TypeScript aprobada, Next 16.3.6 según imagen. Backend y volumen de datos conservados.
- Navegador con cuenta Operativo Demo: listado y detalle de PRUEBA Mesa 20261005-223953 (afa195b2-46fc-4e27-8474-2264f3008fb1). Se abrió Cuenta 2, mesa OCCUPIED versión 4; recargar conservó cuenta/estado. Cierre sin pedidos exitoso: CLEANING versión 5 y sin cuenta abierta. No se registraron pedidos ni cobros.
- /operation/reservations carga correctamente y muestra cola vacía. No se validaron decisiones reales ni conflictos en navegador en esta sección; su evidencia sigue siendo la suite automatizada previa.
- Hallazgo para Fernando: la navegación lateral de esta cuenta solo muestra Operacion; reservas fue accesible mediante URL directa. No se modificaron permisos ni navegación compartida.
- Otro pendiente visible: detalle de mesa afirma que todas las acciones deshabilitadas requieren APIs inexistentes; el texto es demasiado general porque algunos contratos backend ya existen. Revisar redacción dentro del alcance de Barrera en siguiente sección.
- Evidencia visual: C:/Users/tonys/.codex/visualizations/2026/10/02/01a0fec7-06db-7391-bac9-147ff251ecd9/mesa-prueba-cerrada.png.
- Estado: apertura/persistencia/cierre sin pedidos validado con UI y backend local; reservas solo consulta vacía. No equivale a validación de PAID, concurrencia, cobro ni sistema completo. Sin commit, push o publicación remota.

## 2026-10-08 — Barrera: rechazo de reserva desde navegador contra API local

- Se creó mediante BFF una solicitud de prueba identificada como PRUEBA BARRERA 2026-10-08, para 2 personas el 12/10 a las 18:00 Guatemala. reservationId: 3908eeb5-5a6e-46e5-b154-216bd07abc58; requestId: f1a75279-a36a-4645-b40a-ea63818fa07a. Primer envío con offset horario fue rechazado 400 por el validador; el envío en formato UTC Z fue aceptado.
- UI operativa real: solicitud visible, Rechazar solicitud deshabilitado sin motivo, envío con motivo de prueba, mensaje Solicitud rechazada y eliminación de pendientes. Recargar mantuvo la cola vacía.
- Consulta autenticada del historial Cliente vía BFF confirmó reservationStatus=CANCELLED. Registro de prueba conservado para trazabilidad, sin reserva activa ni cobros.
- Hallazgo para Chan/Antony: historial conserva decision=REQUIRES_HUMAN_APPROVAL y mensaje inicial de revisión junto a estado CANCELLED; revisar cómo se presenta para evitar contradicción. No se modificó contrato ni UI Cliente.
- Evidencia: C:/Users/tonys/.codex/visualizations/2026/10/02/01a0fec7-06db-7391-bac9-147ff251ecd9/reserva-prueba-rechazada.png.
- Estado: rechazo validado en navegador + BFF + API local y persistencia consultada desde historial. Confirmación y concurrencia no se probaron en navegador en esta sección. Sin cambios de código, commit, push ni despliegue.
- Siguiente sección propuesta: preparar el alcance concreto de conexión de cuenta/pedidos con endpoints existentes y solicitar aprobación de las rutas BFF mínimas antes de implementarlas.

## 2026-10-08 — Barrera: propuesta mínima de cuenta operativa

- Revisados OperationalAccountController, OperationalOrderController, transporte BFF y NewOrderView/OrderSessionProvider. Cuenta/pedidos existen en backend; sus BFF no existen. Constructor actual usa fixtures y estado en memoria.
- Propuesta concreta en docs/project/BARRERA_PROPUESTA_CUENTAS_PEDIDOS.md: primera entrega con un único GET BFF de cuenta y panel operativo dentro de detalle de mesa; conserva backend/transporte y excluye responsabilidades financieras de Beto.
- Creación de pedidos queda como entrega posterior con POST orders y GET detalle; PATCH y cocina no se incluyen en la aprobación inicial.
- Estado: propuesta lista para aprobación del usuario por restricción expresa de no crear rutas BFF. No implementado; sin pruebas nuevas, registros, commit, push ni despliegue.

## 2026-10-08 — Corrección autorizada de dependencias para PR #39

- Se reutilizó exclusivamente la actualización de dependencias de 6df0ed4: Next/eslint-config-next 16.3.8, sharp 0.35.5, shell-quote 1.12.0 y source-map-js 1.2.2 con su lockfile. No se incorporaron cambios funcionales de otra rama.
- npm ci completado. Auditoría de producción aprobada: ninguna alerta alta/crítica fuera de las excepciones ya documentadas. No se ampliaron excepciones ni se cambió CI. En Windows se utilizó WOK_NPM_CLI_PATH, opción existente del script, por spawnSync npm.cmd EINVAL.
- Validación: 6 pruebas del auditor, 412 pruebas web, lint web, build/TypeScript web, lint y typecheck móvil aprobados. No se ejecutaron nuevamente pruebas Java; el cambio es de dependencias JavaScript.
- Cambio autorizado expresamente por el usuario para corregir y subir al mismo PR. Archivo generado next-env.d.ts preservado fuera del commit.

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
