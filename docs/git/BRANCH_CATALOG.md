# Catálogo de ramas

Estado verificado el 9 de septiembre de 2026: `origin` está configurado y todas las ramas enumeradas están publicadas en GitHub.

La tabla conserva el catálogo de nombres creado al preparar el repositorio. Su última columna registra el estado que tenían en ese momento; no representa el estado remoto actual. Las ramas de trabajo reservan nombres posibles y no implican implementación ni deben tratarse como ramas permanentes.

| Branch                        | Type      | Purpose                           | Base                    | Phase             | Estado inicial               |
| ----------------------------- | --------- | --------------------------------- | ----------------------- | ----------------- | ---------------------------- |
| production                    | principal | Línea estable                     | master (commit inicial) | Permanente        | Local; publicación pendiente |
| development                   | principal | Integración                       | production              | Permanente        | Local; publicación pendiente |
| feature/project-foundation    | feature   | Trabajo de project-foundation     | development             | Foundation        | Local; publicación pendiente |
| feature/frontend-foundation   | feature   | Trabajo de frontend-foundation    | development             | Foundation        | Local; publicación pendiente |
| feature/database-foundation   | feature   | Trabajo de database-foundation    | development             | Foundation        | Local; publicación pendiente |
| feature/frontend-global       | feature   | Trabajo de frontend-global        | development             | Frontend layers   | Local; publicación pendiente |
| feature/frontend-auth         | feature   | Trabajo de frontend-auth          | development             | Frontend layers   | Local; publicación pendiente |
| feature/frontend-public       | feature   | Trabajo de frontend-public        | development             | Frontend layers   | Local; publicación pendiente |
| feature/frontend-private      | feature   | Trabajo de frontend-private       | development             | Frontend layers   | Local; publicación pendiente |
| feature/frontend-shared       | feature   | Trabajo de frontend-shared        | development             | Frontend layers   | Local; publicación pendiente |
| feature/frontend-client       | feature   | Trabajo de frontend-client        | development             | Frontend contexts | Local; publicación pendiente |
| feature/frontend-operational  | feature   | Trabajo de frontend-operational   | development             | Frontend contexts | Local; publicación pendiente |
| feature/frontend-admin        | feature   | Trabajo de frontend-admin         | development             | Frontend contexts | Local; publicación pendiente |
| feature/web-shell             | feature   | Trabajo de web-shell              | development             | Platform          | Local; publicación pendiente |
| feature/mobile-shell          | feature   | Trabajo de mobile-shell           | development             | Platform          | Local; publicación pendiente |
| feature/desktop-shell         | feature   | Trabajo de desktop-shell          | development             | Platform          | Local; publicación pendiente |
| feature/auth                  | feature   | Trabajo de auth                   | development             | Modules           | Local; publicación pendiente |
| feature/users                 | feature   | Trabajo de users                  | development             | Modules           | Local; publicación pendiente |
| feature/roles-permissions     | feature   | Trabajo de roles-permissions      | development             | Modules           | Local; publicación pendiente |
| feature/clients               | feature   | Trabajo de clients                | development             | Modules           | Local; publicación pendiente |
| feature/staff                 | feature   | Trabajo de staff                  | development             | Modules           | Local; publicación pendiente |
| feature/tables                | feature   | Trabajo de tables                 | development             | Modules           | Local; publicación pendiente |
| feature/reservations          | feature   | Trabajo de reservations           | development             | Modules           | Local; publicación pendiente |
| feature/menu                  | feature   | Trabajo de menu                   | development             | Modules           | Local; publicación pendiente |
| feature/recipes               | feature   | Trabajo de recipes                | development             | Modules           | Local; publicación pendiente |
| feature/inventory             | feature   | Trabajo de inventory              | development             | Modules           | Local; publicación pendiente |
| feature/suppliers             | feature   | Trabajo de suppliers              | development             | Modules           | Local; publicación pendiente |
| feature/purchases             | feature   | Trabajo de purchases              | development             | Modules           | Local; publicación pendiente |
| feature/production            | feature   | Trabajo de production             | development             | Modules           | Local; publicación pendiente |
| feature/availability          | feature   | Trabajo de availability           | development             | Modules           | Local; publicación pendiente |
| feature/orders                | feature   | Trabajo de orders                 | development             | Modules           | Local; publicación pendiente |
| feature/kitchen               | feature   | Trabajo de kitchen                | development             | Modules           | Local; publicación pendiente |
| feature/delivery              | feature   | Trabajo de delivery               | development             | Modules           | Local; publicación pendiente |
| feature/messaging             | feature   | Trabajo de messaging              | development             | Modules           | Local; publicación pendiente |
| feature/billing               | feature   | Trabajo de billing                | development             | Modules           | Local; publicación pendiente |
| feature/payments              | feature   | Trabajo de payments               | development             | Modules           | Local; publicación pendiente |
| feature/cash                  | feature   | Trabajo de cash                   | development             | Modules           | Local; publicación pendiente |
| feature/operations            | feature   | Trabajo de operations             | development             | Modules           | Local; publicación pendiente |
| feature/reports               | feature   | Trabajo de reports                | development             | Modules           | Local; publicación pendiente |
| feature/settings              | feature   | Trabajo de settings               | development             | Modules           | Local; publicación pendiente |
| feature/ai                    | feature   | Trabajo de ai                     | development             | Modules           | Local; publicación pendiente |
| feature/vision                | feature   | Trabajo de vision                 | development             | Modules           | Local; publicación pendiente |
| feature/audit                 | feature   | Trabajo de audit                  | development             | Modules           | Local; publicación pendiente |
| feature/database-schema       | feature   | Trabajo de database-schema        | development             | Database          | Local; publicación pendiente |
| feature/database-auth         | feature   | Trabajo de database-auth          | development             | Database          | Local; publicación pendiente |
| feature/database-business     | feature   | Trabajo de database-business      | development             | Database          | Local; publicación pendiente |
| feature/database-seeds        | feature   | Trabajo de database-seeds         | development             | Database          | Local; publicación pendiente |
| feature/database-migrations   | feature   | Trabajo de database-migrations    | development             | Database          | Local; publicación pendiente |
| feature/database-indexing     | feature   | Trabajo de database-indexing      | development             | Database          | Local; publicación pendiente |
| feature/backend-foundation    | feature   | Trabajo de backend-foundation     | development             | Future backend    | Local; publicación pendiente |
| feature/backend-auth          | feature   | Trabajo de backend-auth           | development             | Future backend    | Local; publicación pendiente |
| feature/backend-rbac          | feature   | Trabajo de backend-rbac           | development             | Future backend    | Local; publicación pendiente |
| feature/backend-api           | feature   | Trabajo de backend-api            | development             | Future backend    | Local; publicación pendiente |
| feature/backend-realtime      | feature   | Trabajo de backend-realtime       | development             | Future backend    | Local; publicación pendiente |
| feature/backend-observability | feature   | Trabajo de backend-observability  | development             | Future backend    | Local; publicación pendiente |
| test/frontend-unit            | test      | Trabajo de frontend-unit          | development             | Testing           | Local; publicación pendiente |
| test/frontend-integration     | test      | Trabajo de frontend-integration   | development             | Testing           | Local; publicación pendiente |
| test/frontend-e2e             | test      | Trabajo de frontend-e2e           | development             | Testing           | Local; publicación pendiente |
| test/frontend-responsive      | test      | Trabajo de frontend-responsive    | development             | Testing           | Local; publicación pendiente |
| test/frontend-accessibility   | test      | Trabajo de frontend-accessibility | development             | Testing           | Local; publicación pendiente |
| test/frontend-touch           | test      | Trabajo de frontend-touch         | development             | Testing           | Local; publicación pendiente |
| test/mobile                   | test      | Trabajo de mobile                 | development             | Testing           | Local; publicación pendiente |
| test/desktop                  | test      | Trabajo de desktop                | development             | Testing           | Local; publicación pendiente |
| test/api                      | test      | Trabajo de api                    | development             | Testing           | Local; publicación pendiente |
| test/database                 | test      | Trabajo de database               | development             | Testing           | Local; publicación pendiente |
| test/cross-module             | test      | Trabajo de cross-module           | development             | Testing           | Local; publicación pendiente |
| test/realtime                 | test      | Trabajo de realtime               | development             | Testing           | Local; publicación pendiente |
| test/regression               | test      | Trabajo de regression             | development             | Testing           | Local; publicación pendiente |
| docs/architecture             | docs      | Trabajo de architecture           | development             | Documentation     | Local; publicación pendiente |
| docs/database                 | docs      | Trabajo de database               | development             | Documentation     | Local; publicación pendiente |
| docs/frontend                 | docs      | Trabajo de frontend               | development             | Documentation     | Local; publicación pendiente |
| docs/api                      | docs      | Trabajo de api                    | development             | Documentation     | Local; publicación pendiente |
| docs/testing                  | docs      | Trabajo de testing                | development             | Documentation     | Local; publicación pendiente |
| docs/ux                       | docs      | Trabajo de ux                     | development             | Documentation     | Local; publicación pendiente |
| docs/scrum                    | docs      | Trabajo de scrum                  | development             | Documentation     | Local; publicación pendiente |
| security/auth-hardening       | security  | Trabajo de auth-hardening         | development             | Security          | Local; publicación pendiente |
| security/access-control       | security  | Trabajo de access-control         | development             | Security          | Local; publicación pendiente |
| security/api-hardening        | security  | Trabajo de api-hardening          | development             | Security          | Local; publicación pendiente |
| security/database-hardening   | security  | Trabajo de database-hardening     | development             | Security          | Local; publicación pendiente |
| security/session-security     | security  | Trabajo de session-security       | development             | Security          | Local; publicación pendiente |
| security/security-testing     | security  | Trabajo de security-testing       | development             | Security          | Local; publicación pendiente |
| chore/ci                      | chore     | Trabajo de ci                     | development             | Tooling           | Local; publicación pendiente |
| chore/tooling                 | chore     | Trabajo de tooling                | development             | Tooling           | Local; publicación pendiente |
| chore/dependencies            | chore     | Trabajo de dependencies           | development             | Tooling           | Local; publicación pendiente |

La rama master se conserva como referencia del commit inicial; no pertenece al flujo de integración.

## Estado de la fase frontend

| Rama                           | Responsables          | Estado actual                                                                    |
| ------------------------------ | --------------------- | -------------------------------------------------------------------------------- |
| `production`                   | Coordinación          | Estable; no admite trabajo directo                                               |
| `development`                  | Coordinación          | Integración mediante pull requests; contiene el cambio de `.gitignore` del PR #1 |
| `feature/frontend-foundation`  | Coordinación frontend | Base web en validación antes de abrir PR hacia `development`                     |
| `feature/frontend-client`      | Barrera y Carlos Chan | Publicada; debe actualizarse desde `development` después de integrar la base     |
| `feature/frontend-operational` | Antony y Tomy         | Publicada; debe actualizarse desde `development` después de integrar la base     |
| `feature/frontend-admin`       | Edgar y Beto          | Publicada; debe actualizarse desde `development` después de integrar la base     |

La base incluye rutas navegables y datos simulados. La comprobación real de correos, contraseñas, persistencia, permisos y servicios externos queda pendiente hasta integrar el backend.

## Uso durante el sprint

1. Integrar primero `feature/frontend-foundation` en `development` mediante PR y revisión.
2. Actualizar las ramas de los tres canales desde `development` antes de comenzar cambios.
3. Abrir los PR de Cliente, Operativo y Administrativo hacia `development`.
4. Activar otras ramas reservadas sólo cuando exista una tarea concreta.
5. Preferir ramas temporales con alcance específico para trabajos futuros, por ejemplo `feature/client-cart` o `fix/client-menu-navigation`.

El flujo completo se encuentra en [BRANCHING.md](BRANCHING.md) y [CONTRIBUTING.md](../../CONTRIBUTING.md).
