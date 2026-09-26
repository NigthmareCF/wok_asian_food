# Progreso de diseño de datos

## 2026-09-26 — Reparto por ramas de modelo y migraciones

- `feature/database-schema` mantiene generador/modelo/SQL candidato; `feature/database-migrations` tiene V1–V4 y pruebas; `docs/database` contiene diccionario, ERD, requisitos y validación. Los tres worktrees parten de `3bbd0ed` y quedan sin commit.
- Flyway V1–V4 sigue probado desde cero en PostgreSQL 16. El modelo completo continúa siendo candidato, no migración aplicada.
- Integrar DB primero, luego backend foundation/slices. Ver [handoff](../project/BRANCH_HANDOFF.md) en `feature/project-foundation`.

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
