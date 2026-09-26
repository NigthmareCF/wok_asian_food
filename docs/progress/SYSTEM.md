# Expediente integral del sistema

## 2026-09-26 — Distribución por ramas especializada

- Las referencias locales especializadas se adelantaron fast-forward a `origin/development` `3bbd0ed`; después se hicieron 18 commits/push normales con la distribución inicial. No hubo force ni merge a `development`.
- El mapa de commits, ramas y dependencias está en [BRANCH_HANDOFF.md](../project/BRANCH_HANDOFF.md). Los worktrees permanecen bajo `/tmp/wok-worktrees/`; el workspace Admin conserva sólo su guía.
- Slices publicados en ramas especializadas: reservas autenticadas/idempotentes con revisión auditada; capacidades de servicio con versionado; y caja con apertura, ledger, arqueo/cierre, claves idempotentes y auditoría. Flyway V5 cubre reservas y V6 caja.
- Validación de caja: `mvn verify` combinado 12/12; PostgreSQL 18 aplicó V1–V6 y pasó test SQL; smoke HTTP verificó ledger Q108, replay, rechazo 409 de cambios, diferencia −Q3 y protección de sesión cerrada.
- Los últimos commits de caja están en `feature/payments`, `feature/database-migrations`, `docs/database`, `docs/api` y `feature/project-foundation`; `development` continúa sin merges.

## 2026-09-25 — Base maestra ejecutable y handoff

- Rama observada `feature/frontend-admin`. No hubo cambio de rama, commit, push ni merge. El port 3000 está ocupado por `next-server` de WOK; HTML con título WOK y HTTP 200.
- Se amplió la auditoría a los tres canales, móvil, backend, DB, seguridad, IA, correo, infraestructura y diagramas. Estado observado frente a meta: [GAP_ANALYSIS.md](../project/GAP_ANALYSIS.md); report [IMPLEMENTATION_REPORT_2026-09-25.md](../project/IMPLEMENTATION_REPORT_2026-09-25.md); reparto por PR/ramas [BRANCH_HANDOFF.md](../project/BRANCH_HANDOFF.md).
- Evidencia: 219 pruebas web, 12 pruebas JUnit, API Spring compilada y arrancada contra PostgreSQL 16 desde cero; Flyway V1–V4 aplicó las cuatro migraciones; health/OpenAPI/service capabilities HTTP 200. SQL constraints V1/V3/V4 aprobaron. `docker compose config -q` validó con variables de prueba.
- Slices reales aún parciales: auth sin pruebas HTTP/DB completas, reservas sólo evaluación preliminar, catálogo/pedidos/finanzas/kitchen/inventory no implementados en backend, Google deshabilitado, integraciones externas mock, app móvil sólo plan, LAN/WAN sin ensayo físico.
- Para retomar: seleccionar ramas de [BRANCH_HANDOFF.md](../project/BRANCH_HANDOFF.md), mantener los contratos compartidos y comenzar por auth/RBAC/ownership, reservas transaccionales y catálogo real cuando llegue el menú. Las dependencias externas no bloquean sus mocks/puertos.
- Formato: no guardar prompts/chat completos ni razonamiento privado; vault personal sigue ignorado.

## 2026-09-18 — Consolidación para nueva planificación

- Se creó `docs/project/SYSTEM_MASTER.md` y su lector HTML: interpretación transversal, jornada operativa, ciclos conceptuales, discrepancias y ficha de planificación; incorpora 55 fuentes documentales/técnicas completas sin recortar contenido.
- Se creó `docs/project/SYSTEM_SOURCE_PATHS.md` con rutas absolutas y distinción entre originales externos previamente recuperados, copias locales y adjuntos.
- `docs/project/SYSTEM_MASTER_MANIFEST.json` identifica 62 fuentes por ruta, tamaño y SHA-256. El ZIP `WOK_SYSTEM_MASTER_2026-09-18.zip` incluye las 62 fuentes originales, maestro, lector HTML, inventario, manifiesto y generador.
- Validación: integridad ZIP y hashes de todas las fuentes incluidos; cobertura de identificadores originales 308 HU, 145 RN y 76 RT. No se ejecutó SQL ni se auditó nuevamente toda la implementación.
- El contenido distingue producto completo, interpretación propuesta, diseño candidato, planes previos de alcance reducido y reportes históricos. No se incluyeron notas privadas del vault ni se afirmó nueva lectura del disco externo.
- Reproducción opcional: `python3 scripts/docs/build-system-master.py`; requiere `markdown-it-py`, disponible en el entorno usado. El generador no instala dependencias ni debe confundirse con una tarea de la aplicación.
- Pendiente: validar expectativas y decisiones con responsables, auditar avance real del equipo y producir el nuevo plan por flujos completos.
