# Progreso de diseño de datos

## 2026-09-26 — Solicitudes idempotentes de reserva

- `feature/database-migrations` amplió el corte Flyway a V1–V5: el quinto cambio conserva usuario solicitante, hash de payload, duración mínima estimada y unicidad de `request_id` para proteger el replay.
- V1–V5 se aplicaron desde base vacía en PostgreSQL 18. El test SQL V5 pasó; no se tocó ninguna base persistente.
- El modelo general sigue siendo candidato de 128 tablas; V1–V5 implementan sólo identidad/core, referencias, mesas/reservas y horario.

## 2026-09-26 — Reparto por ramas de modelo y migraciones

- `feature/database-schema` mantiene generador/modelo/SQL candidato; `feature/database-migrations` tiene V1–V6 y pruebas; `docs/database` contiene diccionario, ERD, requisitos y validación. Las entregas previas y slices de reservas/caja están publicados por separado.
- Flyway V1–V5 pasó desde cero en PostgreSQL 18 temporal. El modelo completo continúa siendo candidato, no migración aplicada.
- Integrar DB primero, luego backend foundation/slices. Ver [handoff](../project/BRANCH_HANDOFF.md) en `feature/project-foundation`.

## 2026-09-26 — V6 caja

- `feature/database-migrations` agrega V6 con registros de caja, sesiones, libro de movimientos y conciliaciones finales, alineados con el modelo candidato existente; la semilla `MAIN` usa GTQ.
- PostgreSQL 18 temporal aplicó V1–V6 desde cero y el test SQL V6 validó ledger (Q200 apertura + Q50 ingreso − Q12.50 egreso = Q237.50), sesión única por caja abierta y diferencia de conciliación.
- Aún no se agrega FK desde `payment_id`/`refund_id` en caja: las tablas de pagos/reembolsos no forman parte del corte de migraciones. No hay ventas ni propinas registradas por API todavía.

## 2026-09-25 — Candidato más cortes Flyway ejecutables

- El modelo/generador alcanza 128 tablas candidatas. V1 identidad/core, V2 referencias, V3 mesas/reservas y V4 horarios de restaurante forman el corte Flyway actual.
- V1–V4 aplicaron con éxito vía Spring Flyway desde schema vacío PostgreSQL 16. También ejecutaron `V1_constraints.sql`, `V3_reservations.sql` y `V4_hours.sql` en DB efímera.
- Las 128 tablas no están implementadas: sólo V1–V4 migran; modelo restante necesita slices, seeds de datos reales y pruebas por invariante. No se aplicó ningún script a una DB preexistente.
- Próximo: reservar nuevas migraciones para catálogo/availability/orders/KDS/inventory/production/finance; DB generator permanece fuente para artefactos candidatos. Ver [gap](../project/GAP_ANALYSIS.md) y [handoff](../project/BRANCH_HANDOFF.md).

## 2026-09-17 — Recuperación y regeneración del ERD

- Resultado: lectura del disco externo satisfactoria; copias locales de requisitos y diseño con hashes. ERD completo regenerado de 109 tablas, 1,153 columnas, 306 FK simples y una compuesta, 181 índices explícitos y 17 páginas.
- Entregables: [entrada](../database/README.md), ERD Draw.io completo, 14 vistas Mermaid, foco de facturación Draw.io/SVG, SQL declarativo, diccionario, contratos, correspondencia con Spring y hallazgos.
- Hallazgo relevante: `invoices`/`invoice_items` ya existían en el diseño externo. Facturación sigue sin acreditarse como módulo implementado; la integración fiscal requiere decisión.
- Fuentes funcionales preservadas: 21 épicas, 308 historias, 145 RN y 76 RT; su conteo no equivale a cobertura funcional comprobada.
- Validación: generador original ejecutado localmente, controles estáticos aprobados, hashes de fuente conservados, foco SVG renderizado y revisado. No ejecución PostgreSQL, proveedor fiscal ni backend.
- Pendientes: decisiones sobre solicitudes online, impresión, revisiones de comanda, agrupación de mesas, facturación, versión JPA y reutilización de identidad. Detalle en REVIEW_FINDINGS.
- Git: trabajo documental local en rama existente; sin commit, push, merge o modificación de archivos frontend. Publicación posterior mediante rama de tarea/PR hacia development.
# Revisión funcional previa al cierre del ERD — 2026-09-17

- Ampliación solicitada: el desglose contiene ahora 21 casos de uso desarrollados con entradas, flujo, responsabilidades backend, datos, excepciones y aceptación propuesta; reproduce las 308 historias por épica y las 145 RN / 76 RT en anexos. Se verificaron los 529 textos exactos, sin duplicados, y los enlaces locales. Los contratos derivados están identificados como propuestas pendientes de validación.

- Se agregó `docs/database/FUNCTIONAL_SCOPE.md`: desglose de las 21 épicas, actores, operaciones, datos, recorridos completos, relaciones conceptuales y decisiones pendientes, incluida facturación.
- Se agregó `docs/database/REQUIREMENTS_REVIEW.csv`: 308 historias, 145 reglas de negocio y 76 requisitos técnicos, preservando texto e identificadores originales. Las 529 filas quedan pendientes de validación y evidencia; no acreditan implementación.
- Se verificaron conteos e identificadores únicos. No se ejecutó SQL ni se modificó el esquema candidato; no se redujo el alcance del producto al corte propuesto de entrega.
- Pendiente: revisión con PM/SM y responsables del negocio, asignación de fases y correspondencia requisito → caso de uso → API/entidad → prueba antes de aprobar ERD.
