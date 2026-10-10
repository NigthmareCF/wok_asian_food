> Historical review: see COMBINED_CANDIDATE_STATUS.md and COMBINED_TEST_RESULTS.json for the newer combined candidate and verification.

# Candidato PR32–40: registro de reconciliación

El registro inicial de abajo es histórico. El estado vigente y la evidencia del 9 de octubre de 2026 están en la sección «Verificación con Docker» al final y en TEST_RESULTS.json. Sus resultados sustituyen los bloqueos de entorno anteriores.

Fecha: 9 de octubre de 2026. Rama codex/integration-pr32-40. Escritor único: Codex en este chat, por autorización del responsable de iniciar aplicando las recomendaciones. Integrador del equipo: Barrezzi; no hay traspaso de escritura ni mensajes externos.

## Identificación

Base remota development: 9eab32352b33adc0d4b6a77f6ebee21e9724ed98. HEAD del candidato: bbcb773b7f19804d54d04e69bc2d2410e46364a2 (PR39, contiene PR37). Fuentes de reconciliación: PR35 01f1143545f0f9b73658cbb7d0000d912a6056ff; PR40 b39fb08719cef235bc087dfef87fadfaabdc264d. Son modificaciones locales sobre HEAD, sin nuevos commits. No confundir el SHA base con un SHA final probado: el delta se identifica en CANDIDATE_FILES.json.

PR34 excluido del candidato y PR32 limitado a rescate selectivo, conforme a la decisión del responsable. Ningún PR se cerró o fusionó. PR33 permanece incorporado.

## Cambios concretos

- API operativa mantiene un solo controlador para order-requests. Listado conserva todos los campos consumidos por PR39; agrega filtro type junto con status, validación estricta, intersección de filtros, máximo 50 y orden created_at DESC,id DESC.
- GET /{requestId} conserva detalle de PR35, incluyendo líneas/currencyId, dirección, referencia, contacto y pago. Se consulta por ID independientemente del límite de la bandeja. Mismo permiso orders:manage; no se añadió mapping alternativo.
- BFF operativo valida y reenvía ambos filtros. Estados vacíos, minúsculas y valores desconocidos se rechazan con 400: cambio explícito del contrato respecto a la normalización permisiva anterior; test actualizado según contrato acordado.
- Perfil existente y /bff/profile siguen siendo la única implementación. Se agregan formularios de creación/edición/eliminación de direcciones y listado/revocación de sesiones dentro de LiveProfile. No se importaron client-profile-view ni /bff/client/profile de PR40.
- Rutas de direcciones/sesiones de PR40 se adaptaron con bindClientPrincipal:true. UI reusa identity store y confirma identidad antes/después de mutaciones; operaciones simultáneas del panel se bloquean, expectedVersion se conserva y conflictos recargan sin confirmar éxito.
- reference/deviceName omitidos por serialización NON_NULL se normalizan a null; phone conserva normalización existente. No se sustituyeron campos de identidad.
- Transporte compartido admite emptyResponse solo con 204 confirmado, sin intentar leer JSON. DELETE de dirección se declara 204 en API para alinear el contrato real; no se finge éxito ante un 200 inesperado. Revocación de sesión actual refresca identidad.

## Evidencia y límites

Primer ciclo: compilación API/test-compile aprobada; 10 tests Backend (consulta, direcciones, perfil y sesiones) aprobados, cero omitidos. Suite Web completa 863/863 en 97 archivos, lint/typecheck aprobados con dependencias existentes. Ciclo final con npm ci: lint/typecheck aprobados; build Turbopack aprobado (109 páginas/rutas). Formato de todos los archivos Web modificados aprobado. format:check global falla en 500 archivos; se reprodujo en next.config.ts y vitest.config.ts intactos de la copia original. No se hizo un reformateo masivo. next-env.d.ts generado por build se restauró al contenido base para excluir ruido del candidato.

Problemas de entorno corregidos: Mockito fue bloqueado por pipe del sandbox; tests fuera del sandbox pasaron. SWC fue bloqueado por canonicalización de ruta. Turbopack rechazó junctions de dependencias a la copia original; se retiraron solo los enlaces creados y npm ci instaló 1029 paquetes desde el lockfile sin modificarlo. No se introdujeron versiones nuevas ni excepciones de auditoría. La instalación avisa de postinstall de unrs-resolver pendiente según política local; no se aprobó por defecto.

No se ejecutó PostgreSQL/Testcontainers, opt-in BFF/API/SQL, smoke Bash, prueba responsive/manual ni CI remoto: Docker no está disponible. Las pruebas HTTP/SQL nuevas de filtros/detalle están escritas y compiladas, pendientes de ejecución real. Tests Web con mocks no certifican ownership de base ni ausencia de mappings ambiguos en arranque real.

## Trabajo siguiente y bloqueos

1. Historial real Flyway: sigue bloqueado. Ningún SQL V26/V27 fue cambiado, importado, renombrado, reservado ni aplicado. Trazabilidad financiera PR35 permanece fuera hasta estrategia basada en historial real.
2. PR35: además de bandeja, quedan cancelación específica PICKUP, idempotencia ligada a cuenta, validación de reserva pasada/capability, pagos/cierre y tests asociados. El cambio de fingerprint requiere conservar replays de registros históricos; no se reemplaza sin estudiar datos/compatibilidad. No declarar PR35 incorporado completo.
3. PR38: pendiente reconciliación sobre único servicio. Su aceptación DELIVERY no aporta por sí sola teléfono verificado, ventana/cutoff configurables, revisión logística/override ni ETA de traslado. No habilitarlo como flujo canónico completo. Confirmar precisión de anticipación y orden smoke con responsable antes de ampliar.
4. PR36: auditado por rutas contra PR32. Ninguna ruta mobile/mobile-bff de PR32 se elimina en PR36; hay cambios de contenido que deben probarse, por lo que no se necesita rescate masivo de archivos faltantes. PR36 agrega tracking PICKUP y policy de reservas, pero policy publica constantes de tres horas incompatibles con mínimo canónico 120 minutos/configuración. Reconciliar backend antes de importar consumidores móviles; conservar la protección y campos extendidos de PR39. Lockfile de PR39 contiene correcciones de seguridad y no se reemplaza por el de PR36.
5. Canonical-vs-actual: teléfono verificado, configuración completa, auditoría de cambios de direcciones y otras brechas existentes requieren trabajo explícito antes de declarar entrega end-to-end. Revocación de sesiones ya registra evento de seguridad backend. No se implementó AI/Vision, ni se presentaron mocks como Meta/FEL/gateway real.
6. Responsable debe habilitar acceso autorizado a historial y entorno aislado PostgreSQL; verificar migrations upgrade, permissions, detalle DELIVERY y arranque sin ambiguous mappings antes de considerar el candidato aprobable.

Copia original feature/barrera-table-orders preservada; sin cambio de rama, stash pop, commits, push ni modificación de development. Dependencias nuevas están solo en worktree aislado. El registro de turno y manifiesto permiten revisión/traspaso; nadie más puede escribir esta rama hasta liberación explícita.


## Cierre de verificación de esta tanda

Con dependencias instaladas por npm ci, suite Web completa nuevamente aprobada: 863 pruebas / 97 archivos, cero fallos. Build, lint y tipos aprobados; formato de archivos modificados aprobado. Backend 10 pruebas aprobadas. Candidato local identificado mediante CANDIDATE_FILES.json; cambios aún sin commit. Gate SQL/smoke y format:check global siguen pendientes/fallido respectivamente; esta tanda no aprueba la integración completa.

## Verificación con Docker — estado vigente

Actualizado el 9 de octubre de 2026, America/Guatemala. HEAD bbcb773b7f19804d54d04e69bc2d2410e46364a2 y delta local sin commit en CANDIDATE_FILES.json. Escritor único: Codex en este chat; transferencia a Barrezzi únicamente después de aceptación explícita del manifiesto. Responsables restantes propuestos, sin mensajes externos ni aceptación individual comprobada.

### Cambio remoto observado

Durante fetch, el equipo fusionó PR36 y origin/development avanzó a 1339d740320741050b1131dd9880491d1adffefc. La base congelada del candidato sigue siendo 9eab32352b33adc0d4b6a77f6ebee21e9724ed98 más PR39. No se movió ninguna copia ni se combinó automáticamente development nuevo. Las pruebas certifican este delta, no una futura combinación con el remoto actualizado.

Se consultaron las correcciones recientes PR47 786a807f3a820c7c6555c2f16d9d1244f31c3759, PR48 00ad174ae0149d7acb2ca68e4bf3ef4d8163096f y perfil e96780cbf9e0fac9ebaa861bc09142b9cffe0927. No se importaron ramas en bloque.

### Correcciones adicionales

- PR35: cancelación limitada a PICKUP/propietario. Idempotencia valida la cuenta del pedido persistido antes de devolver replay, también en la ruta concurrente, conservando el fingerprint histórico. Confirmar reserva vencida devuelve 409 sin cambios; rechazo sigue permitido. Capability de reservas se comprueba antes de solicitudes nuevas; replays persistidos se resuelven primero. Se conserva el cierre financiero protegido de PR39.
- Direcciones: auditoría transaccional de actor/operación/entidad/versiones/fecha en audit_logs, sin duplicar domicilio o teléfono. API real verifica propiedad, versiones, 204 y registros; sesiones verifican revocación de acceso y eventos de seguridad. Next/API reales prueban normalización, identidad y 204.
- PR36: tracking propietario sin sustituir el detalle extendido; endpoint policy CLIENT; allowlist y fundamentos faltantes del BFF móvil recuperados selectivamente. Consumidor existente recibe tracking y política del servidor. Se reemplaza la constante de tres horas por mínimo 120 minutos configurable y +15 por pareja adicional sobre cuatro para el mismo día. Móvil usa minutos exactos y hora civil de Guatemala; el mismo cuerpo pendiente conserva clave y no recalcula política al reintentar.
- Propiedades backend: wok.reservations.timezone, minimum-notice-minutes, additional-pair-minutes, first-admission, last-admission y late-group-review. Defaults canónicos 120/15/14:00/21:15/20:30. Calendario completo, tolerancias, inventario/holds y capacidad real siguen fuera de esta corrección.
- Smoke: corrección localizada para retirar CRLF al leer el include SQL en Windows; conserva el guard de base vacía.

### Migraciones: evidencia y bloqueo delimitado

Acceso autorizado de solo lectura al proyecto local wok: 27 migraciones exitosas; V26 financiera checksum -803647152 y V27 checksum -1729631226. Los 27 checksums coinciden con los archivos, calculados con Flyway 12.4. Evidencia: evidence/LOCAL_FLYWAY_HISTORY.json y evidence/MIGRATION_CHECKSUM_COMPARISON.json. No hubo seed, migración, clean, repair ni cambio de configuración sobre la base persistente.

El responsable desconoce otros despliegues o reservas. Sigue bloqueada la elección/aplicación de una versión futura para todos los entornos. Hace falta inventario por entorno de scripts, checksums y success de flyway_schema_history, más versiones reservadas; específicamente si se aplicó la V26 de trazabilidad PR35. No renombrar ninguna migración aplicada.

PR47 propone V28 sobre la cadena financiera. Su SQL y contrato se guardan como propuestas sin versión activa en proposals/, fuera de Flyway. Se probaron después de V1–V27 en PostgreSQL desechable, en una transacción revertida: venta/propina comparten traza, duplicados SALE/TIP y colisión manual se rechazan; índices originales se restauran. Esto no aprueba V28 para despliegue. PaymentController mantiene el flujo financiero vigente; el vínculo de propina de PR35 depende de esa reconciliación.

### Resultados reales

- API Maven verify: 268 pruebas, 0 fallos/errores/omitidas, jar generado. PostgreSQL/Testcontainers, creación V1–V27, upgrades financieros, concurrencia, HTTP/permisos, policy móvil real y arranque sin mappings ambiguos.
- WebFindingBoundaryIntegrationTest opt-in ejecutado con Next de producción contra API/Testcontainer reales: perfil, identidad, filtros, direcciones, versiones y 204. Detalle operacional y permisos además probados en API/PostgreSQL.
- Todos los contratos SQL database/tests/V*.sql ejecutados en PostgreSQL desechable, más propuesta financiera rollback. candidate_constraints.sql está orientado a schema/postgresql.sql: no se cuenta como ejecutado ni como contrato de esta cadena Flyway.
- Smoke: 44 comprobaciones HTTP y siete límites pickup rollback; tracking, roles, propiedad, replay, cocina, pagos parciales/completos y cierre pasan. Proyecto separado wokcandidate-pr32-40, PostgreSQL tmpfs y claves ficticias aleatorias en caché ignorada; volúmenes de wok intactos.
- BFF móvil Maven verify: 26 pruebas, 0 fallos/errores/omitidas; HTTP contra core stub. No sustituyen la evidencia real de API/Next.
- Móvil: 20 pruebas, lint y tipos aprobados. Sin EAS, emulador ni dispositivo nativo. No se importaron toda la presentación de PR36 ni su lockfile.
- Web: 863 pruebas aprobadas en 97 archivos. Lint, tipos, build final y formato: resultados exactos en TEST_RESULTS.json. Vitest inicialmente bloqueado por EPERM en caché del sandbox; repetición fuera de él aprobada. No contar archivos que no ejecutaron pruebas.
- Perfil autenticado revisado visualmente a 390/768/1280/1440: anchos de documento 375/753/1265/1425, sin desbordamiento horizontal; direcciones vacías y sesiones visibles. No certifica todos los canales, carga/error, teclado/touch ni UI nativa.
- Ensayos fallidos corregidos: fixture duplicado de Mockito, fingerprint de fixture inválido, expectativa de bandeja vacía en DB compartida e identidad esperada omitida. No se debilitaron permisos/SQL; última suite completa verde. Smoke inicial falló por CRLF antes del seed y pasó después.

### Incorporación y entrega

| Área | Responsable propuesto | Estado / dependencia |
| --- | --- | --- |
| PR37/39 | Barrezzi | Base incorporada/probada; revisión del delta y nueva base development antes de futura combinación |
| PR35 | Chan + Villatoro | Parcial: bandeja, cancelación, replay y reservas probados; trazabilidad espera inventario de despliegues |
| PR36 | Tomy + Barrezzi | Fusionado externamente en development; candidato incorpora contratos críticos y consumidor mínimo. Presentación completa y combinación con development actual pendientes |
| PR38 / PR48 | Chan | Aceptación DELIVERY pendiente: sin teléfono verificado, ETA de traslado, anticipación máxima ni permiso/logística de override. No habilitada por simple capability |
| PR40 | Chan + Barrezzi | Direcciones/sesiones sobre perfil protegido reconciliadas; auditoría y API/BFF reales probados |
| PR32 / PR34 | Responsable + Tomy | Selectivo / rollback fuera; no cerrar ni fusionar automáticamente |
| DB/despliegue | Responsable + Villatoro | Inventario obligatorio; probar upgrades de cada cadena desplegada antes de decidir versión |

Orden smoke y separación PICKUP/DELIVERY en PR32-40_COORDINATION.md. DELIVERY no queda completo por aceptar solicitudes; no se inventó permiso ni verificación telefónica. Sin AI/Vision, Meta, FEL real ni gateways ficticios.

No declarar integración completa: faltan migración financiera aprobable para todos los historiales, DELIVERY canónico, combinación deliberada con development actual, validación móvil completa y CI remoto del futuro commit. Copia original, stash y lockfile preservados; sin commits, push ni fusiones. Ningún otro integrante debe escribir simultáneamente en esta rama.
