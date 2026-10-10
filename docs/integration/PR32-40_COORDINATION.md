# Coordinación de PR32–40 — 9 de octubre de 2026

Estado: correcciones locales autorizadas por el responsable; escritor único de integración: Codex en este chat. Acuerdos técnicos definidos por coordinación en este documento; aceptación de responsables, historial de despliegue y precisiones operativas pendientes. No presentar esos pendientes como acuerdos confirmados.

## Base y preservación

- Remoto verificado con git fetch origin y API GitHub en esta sesión.
- Base común: development `9eab32352b33adc0d4b6a77f6ebee21e9724ed98` (incluye PR33).
- Punto de partida de integración: PR39 `bbcb773b7f19804d54d04e69bc2d2410e46364a2`.
- Rama local separada: `codex/integration-pr32-40`, worktree hermano `wok-integration-pr32-40`. HEAD inicial bbcb773. No merge, commit ni push realizados en esta coordinación.
- Copia original: feature/barrera-table-orders, limpia al inicio. Rama, índice, archivos, stash y directorio padre conservados; no ejecutar stash pop, reset ni clean. development local/remoto no se modifican.
- Instrucciones consultadas: AGENTS.md, apps/web/AGENTS.md, apps/mobile/AGENTS.md, docs/frontend/TEAM_GUIDE.md y channels/README.md. Antes de cada tarea leer además su guía de canal y documentación Next/Expo pertinente. Código en inglés, interfaz en español, secretos excluidos. Cambios de negocio se elevan al responsable.

## Inventario congelado

| PR | Head SHA | Autor GitHub | Tratamiento |
| --- | --- | --- | --- |
| 32 | 9997cf0e5bc9d7be1607c00a1581c27da9bd5e36 | TomyAnva | Rescate selectivo autorizado; no incorporar completo |
| 33 | 4b25f3be9c6c9158af998b321f60f319a1580ca6 | TomyAnva | Fusionado, ya incluido |
| 34 | c55e07c9ee5ee89afe9d7e317241f2cb43bf42e0 | TomyAnva | Rollback excluido del candidato por decisión del responsable; no cerrar ni fusionar |
| 35 | 01f1143545f0f9b73658cbb7d0000d912a6056ff | Chuansi232 | Reconciliar contrato, trazabilidad y smoke; migración bloqueada |
| 36 | fb243d68f208122bd3c8ce4588cf00ec37327d23 | TomyAnva | Depende del estado posterior a PR33 |
| 37 | 6df0ed4cebf1f20617796a47908959635f7488e6 | AVillatoroG17 | Ya contenido por PR39; no integrar otra vez |
| 38 | 2768be3f39394ad8d6b55dc6e37c816a89c95f35 | Chuansi232 | Aceptación DELIVERY, reconciliar sobre contrato unificado |
| 39 | bbcb773b7f19804d54d04e69bc2d2410e46364a2 | Barrezzi12 | Base del candidato |
| 40 | b39fb08719cef235bc087dfef87fadfaabdc264d | Chuansi232 | Extraer direcciones/sesiones, conservar perfil protegido |

Verificaciones Git: merge-base(PR37, PR39) = PR37; diferencia PR37..PR39 contiene ab6da7f, 04a0351 y bbcb773. merge-base(development, PR36) = development. PR35 y PR38 tienen cada uno un commit no alcanzable desde PR39. PR32 tiene dos commits no equivalentes según git cherry; esto no demuestra que sus archivos sean exclusivos: PR33 replica parte del contenido con otros hashes. Comparar por hunks contra PR33 y PR36 antes de rescatar. PR34 elimina rutas, tests y estado móvil recuperado por PR33.

## Exclusión de escritores y responsables

Único escritor de codex/integration-pr32-40: coordinación/Codex en este chat. Ningún otro agente ha recibido permiso de escritura. Equipo trabaja en ramas y worktrees propios; entrega SHA y diff, nunca escribe directamente en la rama de integración. Registro de turno obligatorio: responsable, rama, SHA inicial, rutas reservadas, SHA final y liberación. Coordinación incorpora secuencialmente y verifica HEAD antes de cada incorporación. Si cambió, detenerse y volver a comparar. No usar la misma rama desde dos worktrees.

Responsables propuestos, pendientes de aceptación:
- Chuansi232/Chan: contrato API y reconciliación PR35/38; direcciones/sesiones PR40.
- AVillatoroG17: revisión de seguridad/finanzas/política vigente PR37.
- Barrezzi12/Barrera: consumidor operativo PR39 y regresiones de mesas/reservas.
- TomyAnva: móvil PR32/36 y decisión de PR34 con responsable del repositorio.
- Chan y Fernando (mencionados en auditoría del repositorio): historial/reserva de migraciones; identidad de Fernando y aceptación por confirmar.
- Responsable del repositorio: aprobación comercial y decisiones PR32/34. No atribuir aprobación al autor por publicar un PR.

## Migraciones — BLOQUEADO

PR35: V26__cash_movement_payment_traceability.sql. PR37/39: V26__presential_payment_attempts.sql y V27__presential_payment_attempt_resolution.sql. V27 depende del esquema financiero de V26; preservar ambas funcionalidades y ese orden lógico.

Docker disponible. Se consultó en modo READ ONLY public.flyway_schema_history de la base local wok: V1–V27 exitosas; V26 financiera y V27 de resolución coinciden con sus archivos, al igual que los otros 25 checksums. Evidencia en evidence/LOCAL_FLYWAY_HISTORY.json y MIGRATION_CHECKSUM_COMPARISON.json. El responsable desconoce otros despliegues/reservas. Ese inventario sigue bloqueado: no renombrar scripts aplicados, modificar checksums, usar repair ni asignar V28 a ciegas. PR47 propone V28; solo su DDL/contrato se prueban con rollback, fuera de las migraciones activas.

El responsable debe entregar inventario de TODOS los entornos persistentes y exportación de solo lectura, con entorno/fecha y ubicación de la tabla:

```sql
SELECT installed_rank, version, description, script, checksum, success, installed_on
FROM <schema_verificado>.flyway_schema_history
ORDER BY installed_rank;
```

Buscar primero el schema de la tabla mediante information_schema.tables. Comparar scripts/checksums con los SHA congelados. Si ambos V26 diferentes están aplicados en distintos ambientes, acordar explícitamente estrategia de convergencia; si alguno nunca fue aplicado, reservar su versión solo tras revisar todas las versiones realmente ocupadas. Ejecutar upgrades desde cada historial real reproducido en base aislada y creación desde cero. Ninguna escritura sobre demo/despliegue antes de aprobación.

## Contrato único de bandeja operativa

Un solo controlador y un solo mapping GET /api/v1/operational/order-requests, protegido por orders:manage. Reconciliar OperationalOrderRequestController y su servicio de consulta; no conservar dos implementaciones equivalentes.

Respuesta 200: array compatible con order-request-contract.ts de PR39. Cada elemento mantiene requestId (UUID), status, fulfillmentType, requestedFor, submittedAt, customerName, customerEmail, customerNote nullable, subtotal numérico, currency, orderId nullable, orderStatus nullable e items[{name,quantity,unitPrice,lineTotal}]. Importes finitos no negativos; cantidad entera positiva; fechas ISO Instant. Nunca devolver el Summary reducido de PR35 en lugar de este DTO.

Filtros opcionales: status = PENDING_REVIEW|ACCEPTED|REJECTED|CANCELLED|EXPIRED; type = PICKUP|DELIVERY. Ausentes significan sin ese filtro; combinados se intersectan. Valor inválido: 400, nunca ampliar silenciosamente la consulta. Máximo 50 resultados, orden created_at DESC,id DESC; submittedAt representa created_at. La web puede seguir enviando status como hoy. BFF debe reenviar ambos filtros tras validarlos. No envolver el array en un objeto nuevo.

GET /api/v1/operational/order-requests/{requestId}: mantener detalle de PR35 bajo el mismo permiso, 404 para inexistente. Mantener requestId,status,fulfillmentType,requestedFor,customerNote,subtotal,currency,paymentPreference,deliveryAddress,deliveryReference,contactPhone,orderId,createdAt y lines[{name,quantity,unitPrice,lineTotal,currencyId}]. El detalle no depende de que la solicitud esté entre las 50 del listado. Datos privados solo para personal autorizado.

POST /{requestId}/decision conserva ACCEPT/REJECT, reason validado y obligatorio al rechazar, resultado requestId,status,orderId,idempotentReplay. ACCEPTED exige orderId; REJECTED exige null. Mantener locking, atomicidad, auditoría y replay; PR38 añade DELIVERY aquí sin perder validación PICKUP de PR39.

## Perfil único

Base: página client/profile, modules/clients/profile-contract.ts, live-profile y /bff/profile de PR39. Mantener normalizeClientProfile (phone ausente/null -> null), UUID válido, versión positiva y bindClientPrincipal:true en lectura/escritura. Validar que userId coincide con sesión y conservar comportamiento ante respuesta ajena. userId/email nunca se actualizan desde payload cliente; expectedVersion y conflictos permanecen.

PR40 aporta contratos/rutas de direcciones y sesiones y sus controles dentro del perfil existente. No sustituir la página por client-profile-view completo, no crear segundo perfil ni publicar /bff/client/profile como alternativa sin necesidad. Adaptar imports y pruebas; endpoint compartido no debe perder protección de identidad. Direcciones/sesiones siempre pertenecen al principal autenticado; validar identificadores, mutaciones, sesión ajena, revocación y estados vacíos/error. No debilitar el helper global para permitir PR40.

## Políticas independientes — reconciliar con especificación confirmada

PICKUP vigente PR39: requestedFor > now + suma(preparación*quantity), preparación <= 86400 segundos, requestedFor <= now+3h. Debe caer en business_hours activos service_type RESTAURANT, apertura inclusiva y cierre exclusivo, con timezone_name real. Validar creación y nuevamente aceptación. El texto 14:00–22:00 no sustituye la configuración de BD. Revisar selección del weekday y zonas antes de generalizar.

DELIVERY vigente: preparación mínima estricta, sin política equivalente demostrada de horario ni máximo de 3h. PR38 habilita aceptación según capability DELIVERY. No reutilizar PickupSchedulePolicy ni introducir máximo/hora por suposición. Responsable debe confirmar ventana propia de DELIVERY, zona, anticipación mínima (incluido tiempo de reparto si aplica), máxima, límites inclusivos/exclusivos y revalidación al aceptar. La especificación posterior confirma cutoff DELIVERY 20:00, revisión/override logístico y parámetros configurables; revisar CANONICAL_BUSINESS_POLICY.md. ETA de entrega, anticipación máxima y fronteras aproximadas siguen pendientes; no inventarlas.

Propuesta de orden obligatorio del smoke, pendiente confirmación del responsable: abrir caja cuando aplique -> crear solicitud válida -> aceptar -> crear pedido/cuenta -> cocina claim/PREPARING -> READY -> SERVED cuando corresponda -> pago parcial confirmado -> replay sin doble pago -> rechazar cierre con saldo -> completar pago confirmado -> comprobar saldo cero -> cerrar pedido -> liberar/cerrar mesa. Incluir también cierre rechazado antes de pedido cerrado. DELIVERY usa su ciclo propio y no libera mesa ficticia.

Intentos financieros PR39: preparar/consultar no captura; PREPARED/PENDING no equivalen a pago confirmado. Intento activo/ambiguo bloquea cierre según reglas vigentes. Confirmación/rechazo/resolución excepcional deben preservar separación de funciones, evidencia, auditoría y fencing. No avanzar cocina por un pago ni registrar pago por preparar intento. Mantener las pruebas de orden actuales antes de añadir PR35/38.

## Secuencia y comprobaciones obligatorias

1. Aceptar contratos/responsables y resolver historial/precisiones operativas. La política comercial confirmada está en CANONICAL_BUSINESS_POLICY.md y prevalece sobre el código descrito abajo. Ningún cambio compartido mientras falte el acuerdo aplicable.
2. Reconciliar PR35 contra PR39 sin sustituir seguridad/finanzas. Resolver migraciones con evidencia antes de combinación ejecutable.
3. Incorporar PR38 sobre el controlador/servicio único; validar ambas modalidades.
4. Extraer direcciones/sesiones PR40 sobre perfil protegido; conservar tests de auditoría de PR39.
5. Integrar PR36 conservando PR33. PR32 se rescata solo por aportes exclusivos; PR34 queda fuera del candidato. No cerrar esos PR automáticamente.
6. Inspeccionar cambios exclusivos por hunks, manifests y regresiones; no fusionar PR37 otra vez. Re-fetch y verificar SHA antes de incorporar; cambios remotos requieren nueva revisión.

Gates del candidato compuesto, no de PR individuales:
- Spring arranca sin ambiguous mappings. Tests lista/detalle: filtros solos/combinados/ausentes/inválidos, límite/orden, DTO real consumido por BFF/web, permisos y 404.
- Migraciones: creación y upgrades aislados de todos los historiales conocidos, checksums aplicados intactos, trazabilidad PR35 y resolución financiera V27 conservadas.
- Perfil: phone omitido/null/vacío, payload y respuesta con identidad ajena, expectedVersion obsoleto, direcciones/sesiones propias/ajenas, revocación y normalización.
- Horarios: por modalidad, preparación exacta/insuficiente, máximo exacto/excedido, apertura/cierre, zona/día, capability deshabilitada y cambio entre creación/aceptación; sin cambios de horario en demo.
- Pedidos/pagos: concurrencia, idempotencia, cancelación, cuenta/pago/evento/auditoría atómicos, parciales/completos, intento pendiente, resolución excepcional y cierre de saldo cero.
- Maven verify con PostgreSQL real/Testcontainers; opt-in WebFindingBoundaryIntegrationTest debe ejecutarse, no contar omitido como aprobado.
- Web format:check, lint, typecheck, test, build:web; móvil/BFF lint, tipos y tests pertinentes. Leer scripts reales antes de invocar.
- Smoke operational-flow-smoke.sh y fixtures pickup juntos, Bash/jq y PostgreSQL aislado nuevo; conservar guard de base vacía y tests rollback. Ampliar a DELIVERY tras aprobación; no ejecutar seeds contra demo.
- Responsive 390/768/1280/1440, teclado/touch y carga/vacío/error; auditoría dependencias/CI del SHA final, sin nuevas excepciones implícitas.

Validación de esta entrega: refs/estados/ancestría y revisión contractual de solo lectura; no se ejecutaron suites ni smoke porque solo se creó documentación y la implementación está bloqueada. No hay evidencia de aprobación de combinación ni de despliegue.

## Decisiones solicitadas y entrega

El responsable aceptó las recomendaciones: PR32 selectivo, PR34 fuera del candidato, base PR39 y correcciones de bandeja/perfil primero. Historial autorizado y confirmación del orden técnico de smoke siguen pendientes. No se enviaron mensajes externos ni comentarios a los PR; este documento es la entrega revisable al equipo. No cerrar PR32/34 ni fusionar ningún PR a development. Publicación/commit y futura integración a development requieren autorización explícita correspondiente.

## Actualización canónica confirmada

La política confirmada está en [CANONICAL_BUSINESS_POLICY.md](CANONICAL_BUSINESS_POLICY.md); prevalece sobre descripciones de implementación y propuestas anteriores. Los defaults son configurables y no se hardcodean en vistas. La confirmación de requisitos no prueba implementación, disponibilidad de proveedores ni aceptación de todos los contratos técnicos.

Barrezzi coordina la incorporación de funcionalidades compatibles. PR39 ya contiene PR37; PR34 es un rollback y no una funcionalidad adicional a sumar. PR32 tiene rescate selectivo autorizado y PR34 queda excluido del candidato; no se autoriza cierre automático. Barrezzi no debe escribir sobre la rama reservada mientras coordinación tenga el turno: entrega/aceptación de SHA y liberación explícita preceden al traspaso. Responsables restantes siguen propuestos.

Antes de corregir ramas en paralelo, aceptar el contrato único de bandeja, perfil, política y migraciones aplicables. El candidato combinado debe registrar SHA inicial, commits incorporados/reconciliados, decisiones excluidas y SHA final probado; un test verde de PR individual no valida la composición. Mientras no exista commit del candidato, usar además manifiesto de archivos y hashes del delta; nunca atribuir las pruebas al HEAD si había modificaciones.

Reglas transversales obligatorias: multirrol por unión, registro sin roles operativos, auditoría sensible, historial de recetas, compra distinta de entrada a inventario, restricciones internas específicas/auditables, AI restringida por autorización humana y Vision complementaria con confianza. No implementar AI/Vision fuera de alcance.

Nueva especificación resuelve los defaults comerciales, pero faltan historial real V26/V27, precisiones de ventanas aproximadas/ETA DELIVERY/holds y confirmación del orden técnico de smoke. No ejecutar cambios compartidos afectados por esos pendientes. Mantener backlog de diferencias canónico-vs-PR; no sumar automáticamente funcionalidades nuevas ausentes de los PR.

## Entrega vigente después de PostgreSQL y smoke

Base congelada y escritor único se conservan. origin/development avanzó externamente a 1339d740320741050b1131dd9880491d1adffefc por fusión de PR36. Antes de una futura combinación, Barrezzi debe aceptar el manifiesto del delta y revisar las diferencias respecto de ese SHA. No reescribir simultáneamente esta rama ni atribuir los tests a un commit que aún no existe.

Historial local V26/V27 y orden de pagos/cierre ya verificados; el inventario de otros despliegues continúa pendiente. PR47/48 y la rama de corrección de perfil se inspeccionaron; no aportan evidencia de teléfono verificado ni un contrato completo de ETA/override DELIVERY. La decisión de usar el mejor criterio disponible no autoriza inventar permisos ni saltarse esas dependencias.

| Modalidad | Política aplicable | Implementación y gate |
| --- | --- | --- |
| PICKUP | Mínimo: preparación/ETA actual, revalidado al aceptar. Horario operativo por configuración del backend; política canónica separa recogida tardía alrededor de 21:30 y revisión de apertura 14–15. | Flujo existente validado; máximo vigente 180 minutos en PickupSchedulePolicy. Este máximo y la selección del horario RESTAURANT siguen siendo limitaciones del código actual, no una política común para DELIVERY. Configuración completa de cutoff/apertura está pendiente. |
| DELIVERY | Teléfono verificado, cotización/logística humana, ETA de cocina más traslado cotizado; cutoff automático canónico 20:00, excepción con confirmación logística y auditoría. | No reutilizar máximo PICKUP de tres horas ni inferir tiempo de traslado. Faltan estado verificable del teléfono, representación de cotización/ETA, máximo de anticipación y permiso existente que autorice override. Aceptación PR38 no habilitada; Chan debe acordar esos contratos antes de escribir el servicio compartido. |
| Reservas | Mínimo 120 minutos configurable; mismo día +15 por pareja adicional sobre cuatro; ventana configurable 14:00–21:15. | API/policy y móvil usan minutos del servidor. Capability bloquea solicitudes nuevas; vencidas no se confirman. Tolerancia, calendario completo, preorden tardía obligatoria y capacidad/inventario no se presentan como implementados. |

Orden obligatorio probado por smoke: solicitud pendiente → revisión humana → pedido SENT → cocina PREPARING → READY → servicio/entrega → pago parcial/completo → saldo cero → pedido CLOSED → cierre de mesa/cuenta. Pagos parciales no permiten cerrar. Con intento financiero pendiente, conservar gates de PR39 y su resolución autorizada; no sustituirlos por los de PR35/38. DELIVERY necesita además el acuerdo anterior antes de ampliar el smoke: una preferencia de pago o cobro por mensajero no constituye efectivo recibido ni pago capturado.

Resultados y reparto vigente en CANDIDATE_STATUS.md y TEST_RESULTS.json. No hay CI remoto de un commit candidato, build móvil nativo ni integración completa. PR32/34 no se cierran ni fusionan; sin autorización de commit/push/merge. Lockfile, checkout original y stash preservados.
