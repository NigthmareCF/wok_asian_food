# Handoff por ramas y merge de integración

Fecha: 2026-09-26. Este documento organiza el trabajo que sigue al corte integral y evita que cada PR replantee contratos compartidos. Se usaron las ramas existentes. Todas eran antecesoras de `origin/development` y no tenían commits exclusivos, así que se adelantaron con `--ff-only` a `3bbd0ed`; no hubo rebase, force ni resolución de conflictos. Después se crearon y publicaron commits normales para el primer reparto en 18 ramas. El workspace principal sigue en `feature/frontend-admin`.

## Distribución actual de archivos

El primer reparto ya está committed y pushed en sus ramas respectivas. La validación posterior añadió slices de reservas, administración de servicios, migración V5 y ahora módulo de caja/V6; sus commits también están publicados en `feature/reservations`, `feature/availability`, `feature/backend-auth`, `feature/database-migrations`, `feature/database-schema`, `docs/database`, `docs/api`, `feature/frontend-client`, `feature/backend-foundation` y `feature/project-foundation`. Las copias de entrega se retiraron del workspace Admin; allí sólo permanece su guía. Los worktrees de trabajo están en `/tmp/wok-worktrees/`.

| Rama                           | Worktree                                | Contenido asignado                                                                          |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `feature/frontend-admin`       | `/home/fer-cachy/Wok_Asian_Food`        | Guía ADMIN actualizada; la rama ya contiene la base frontend de integración.                |
| `feature/frontend-client`      | `/tmp/wok-worktrees/client`             | Validación del formulario de reservas de Cliente para 3 h, fixture y pruebas; guía Cliente. |
| `feature/frontend-operational` | `/tmp/wok-worktrees/operational`        | Guía del canal Operativo.                                                                   |
| `docs/frontend`                | `/tmp/wok-worktrees/frontend-docs`      | Guía de equipo, arquitectura frontend y matriz de brechas.                                  |
| `feature/backend-foundation`   | `/tmp/wok-worktrees/backend-foundation` | Maven/Spring, config, Compose/Nginx, guía/plan backend y progreso.                          |
| `feature/backend-auth`         | `/tmp/wok-worktrees/backend-auth`       | Identidad, sesiones, challenges, email outbox/adapters, seguridad y diseño de auth/email.   |
| `feature/backend-api`          | `/tmp/wok-worktrees/backend-api`        | Manejador HTTP de errores y contrato base OpenAPI.                                          |
| `feature/reservations`         | `/tmp/wok-worktrees/reservations`       | Estimador, evaluación preliminar de capacidad y pruebas de reservas.                        |
| `feature/availability`         | `/tmp/wok-worktrees/availability`       | Lectura de capacidades de servicio desde DB.                                                |
| `feature/ai`                   | `/tmp/wok-worktrees/ai`                 | Gateway/mock, broker inicial, pruebas y arquitectura IA.                                    |
| `feature/payments`             | `/tmp/wok-worktrees/payments`           | Puertos/adapters mock de pago/FEL y API persistente de sesión/ledger/arqueo/cierre de caja. |
| `feature/database-schema`      | `/tmp/wok-worktrees/db-schema`          | Generador y modelo candidato, SQL PostgreSQL regenerado.                                    |
| `feature/database-migrations`  | `/tmp/wok-worktrees/db-migrations`      | Flyway V1–V6 y pruebas SQL; V6 cubre registro/sesión/movimientos/arqueo de caja.            |
| `docs/database`                | `/tmp/wok-worktrees/db-docs`            | Mapeo, ERD, validación, decisiones y progreso DB.                                           |
| `feature/project-foundation`   | `/tmp/wok-worktrees/project-foundation` | GAP/estado/decisiones/reporte maestro, README y progreso del sistema.                       |
| `docs/architecture`            | `/tmp/wok-worktrees/architecture-docs`  | Diagramas Draw.io y su generador.                                                           |
| `docs/api`                     | `/tmp/wok-worktrees/api-docs`           | Guía de contrato/API.                                                                       |
| `feature/mobile-shell`         | `/tmp/wok-worktrees/mobile`             | Plan Cliente móvil y progreso móvil.                                                        |

**Base actual:** `origin/development` está en `3bbd0ed`; las ramas especializadas publicadas avanzan desde esa base con el commit de su entrega inicial. Los siguientes cambios aún no están publicados. La actualización de base fue sólo fast-forward y preservó historias. El código frontend de Cliente ahora parte de la base web vigente. Los slices de backend siguen separados: `backend-foundation` contiene el proyecto ejecutable y cada rama de dominio sólo sus paquetes; se integran después de foundation y migraciones. Así evitamos duplicar módulos y provocar conflictos.

Los PR se deben ordenar por dependencias: base frontend existente → Cliente/Operativo/Admin; modelo y migraciones DB → backend-foundation → auth/API/reservations/availability/payments/AI → canales web/app; infraestructura y diagramas se revisan junto al foundation. Tras cada merge a `development`, coordinación actualiza las ramas posteriores según el historial real, sin reset/force.

## Contratos comunes antes de abrir slices

- Mantener `docs/project/GAP_ANALYSIS.md` como matriz de alcance y estado por evidencia.
- API base `/api/v1`, UUID, hora `America/Guatemala`, dinero `BigDecimal`/NUMERIC, errores consistentes y estados nombrados en inglés.
- No conectar UI a fixture como fallback silencioso cuando una llamada real falla. Mostrar indisponibilidad y conservar el borrador local.
- Cambios de modelo empiezan en `database/design/generate.py` cuando correspondan al esquema candidato; cambios ejecutables van en nueva migración Flyway numerada. No regenerar/borrar migraciones ya aplicadas.
- Los adaptadores mock no representan proveedor productivo. Los cambios compartidos a schema/API se acuerdan primero y se integran mediante PR a `development`.

## Ramas de canal

| Rama destino                   | Dueño funcional | Entrega siguiente                                                                                                                                                         | Criterio de aceptación                                                                                                                         |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature/frontend-client`      | Barrera y Chan  | Conectar menú, carrito, reserva, pickup, delivery, checkout, pedidos, mensajes y perfil al contrato API; conservar el calendario mínimo de 3 h; estados online degradados | Flujos responsive con datos API, errores visibles, ownership y pruebas por recorrido; el backend revalida importes, stock, horario y capacidad |
| `feature/frontend-operational` | Antony y Tomy   | Mesas, reservas pendientes, servicio/capacidad, pedidos/KDS, delivery, caja e inventario conectados a use cases                                                           | Cambios persistentes con actor/estado/historial, acciones protegidas por permiso, sin aceptar capacidad sólo desde UI                          |
| `feature/frontend-admin`       | Edgar y Beto    | Usuarios/roles/sesiones, estados de servicio y overrides auditados, seguridad/integraciones, reportes/auditoría                                                           | RBAC/ownership del lado API; estados externos separados del health del core; vistas no confunden métricas simuladas con reales                 |

## Trabajo de plataforma pendiente en ramas existentes

Las ramas especializadas ya existen y contienen los cambios iniciales listados arriba. El trabajo pendiente debe continuar en esas ramas, no en nombres hipotéticos. Las ramas de backend por dominio contienen slices y dependen de integrar primero la base backend y las migraciones correspondientes.

| Rama existente | Continuación sugerida | Dependencias/aceptación |
| --- | --- | --- |
| `feature/database-schema` y `feature/database-migrations` | Completar catálogo, pedidos/KDS, inventario, producción y movimientos financieros según decisiones aprobadas. | Modelo generado, migraciones nuevas numeradas, seeds confirmados y constraints/concurrencia probadas. |
| `feature/backend-foundation` | Completar health de dependencias, credenciales separadas, backups/restauración, observabilidad y pruebas de WAN/LAN. | Mantener DB y Spring sin puertos públicos; LAN operativa durante falla WAN. |
| `feature/backend-auth` y `feature/backend-api` | Endurecer verify/login/refresh/reuse, ownership/RBAC, límites y contrato HTTP; preparar Google OIDC cuando existan credenciales. | Pruebas HTTP con DB, linking sin fusión automática y revocación comprobada. |
| `feature/reservations` y `feature/availability` | Evaluación y creación transaccional, capacidad, horarios, ocupación, alternativas y aprobación humana. | Persistencia, mínimo 3 h, no solape y pruebas concurrentes. |
| `feature/payments` | Conectar `SALE`/`TIP_PAYOUT` desde pedidos/cobros al ledger; pagos mixtos y adapters/outbox/reconciliación externos. | Verificar totales desde servidor; separar dinero y propina; no declarar integración bancaria/FEL real. |
| `feature/ai` | Mensajería asistida, autorización de tools, handoff, feedback y revisión de comprobantes. | Firma/ownership/minimización/límites; runtime sin DB y sin autorizar acciones críticas. |
| `feature/mobile-shell` | App Expo Cliente sobre API tipada, SecureStore, cache/borradores offline y recorridos Cliente. | Depende de identidad/API estable; ninguna confirmación offline; pruebas con red degradada. |
| `feature/frontend-client`, `feature/frontend-operational`, `feature/frontend-admin` | Continuar los flujos de cada canal conectándolos al contrato aprobado. | No reportar éxito sin persistencia; validar permisos y ownership del lado API. |

Orden recomendado: schema y migraciones → backend-foundation → auth/API y slices de dominio → canales web y app. Cada equipo conserva su rama y abre su PR hacia `development`; coordinación integra después de revisar dependencias.

## Integración a `development`

1. Coordinación actualiza `development` y abre PRs independientes de cada área; canales consumen el contrato acordado, no copias de DTOs.
2. Revisar primero DB + backend de una capacidad, luego cliente/operativo/admin que la consume y al final app móvil. No mergear UI que reporte éxito sin persistencia.
3. En cada PR exigir: alcance y trazabilidad a HU/RN; migración desde DB vacía; pruebas de autorización/ownership/idempotencia aplicables; tests del canal; captura de `docker compose config`; nota de mock vs real; actualizar GAP y progreso.
4. Smoke de integración: Compose limpio → health core → register/verify/login/refresh → lectura catálogo → evaluar/crear reserva → pedido de prueba → evento KDS → caja/pago mock → outbox; probar sin WAN/reconexión antes de pilotear.
5. El PR de integración a `development` se abre sólo después de validar desde estado limpio. La promoción a `production`, proveedores reales y exposición pública siguen sus propias decisiones y aprobación.
