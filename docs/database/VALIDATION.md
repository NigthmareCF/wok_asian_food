# Validación del modelo candidato y corte inicial

Fecha: 2026-09-25. Resultado: **PASS_STATIC** para los 128 candidatos, **PASS_DB_V1** para el corte Flyway y **PASS_DB_CANDIDATE** para la exportación completa en PostgreSQL 16 desechable. El resumen estructural reproducible está en [VALIDATION.json](VALIDATION.json).

## Comprobaciones realizadas

- Hashes originales conservados y hashes de artefactos evolucionados registrados por separado.
- Modelo, SQL, diccionario y ERD regenerados desde `generate.py`.
- 128 tablas y 1,345 columnas concordantes entre modelo/SQL; tipos, nulabilidad, defaults, CHECK, UNIQUE e índices contrastados mediante controles estructurales.
- 341 referencias FK simples a tablas existentes y una compuesta contextual; políticas RESTRICT conservadas.
- 206 índices explícitos y exclusión de solape en asignaciones de reserva del modelo candidato.
- Draw.io: 17 páginas coincidentes con el modelo, IDs únicos por página, referencias de aristas existentes, columnas visibles en XML y ausencia de solapes entre cajas de entidades locales.
- Regeneración de 14 diagramas Mermaid y foco de facturación editable/SVG.
- Foco SVG renderizado e inspeccionado visualmente; representa relaciones principales y omite explícitamente columnas/FK externas.
- Conteo de fuentes: 21 épicas, 308 historias, 145 RN y 76 RT.
- V1 creó 23 tablas y sus FK/índices en PostgreSQL 16 sin exponer puerto. V2 insertó 3 roles, 6 permisos, 11 asignaciones, GTQ y 9 capacidades.
- `database/tests/V1_constraints.sql` pasó: unicidad provider/subject, sucesor único de refresh, estado de capacidad válido y escritura en email outbox. La prueba se revierte con `ROLLBACK`.
- La exportación candidata de 128 tablas se ejecutó en una segunda DB desechable. `database/tests/candidate_constraints.sql` pasó: draft FEL sin número, rechazo de certificación sin referencias y exclusión de reserva solapada. Esto prueba DDL, no negocio completo.

## Qué no se verificó

- El SQL declarativo completo se ejecutó sólo en una DB desechable; sus entidades nuevas siguen siendo candidatas salvo V1, porque no existen migraciones ni casos de uso para ellas.
- El parser SQL opcional `pglast` no está disponible en este entorno; la validación por patrones/modelo no sustituye un parser completo ni el motor.
- No se probó aún la invocación Flyway desde Spring, transacciones concurrentes, mapeos JPA, emisión de facturas o proveedores.
- No se renderizaron visualmente las 17 páginas del ERD completo ni los 14 Mermaid; sus controles son estructurales. Páginas densas pueden necesitar ajuste manual de conectores.
- El conteo de requisitos no certifica cobertura funcional. Ver [hallazgos](REVIEW_FINDINGS.md).

## Comandos

```bash
python3 database/design/generate.py
python3 database/design/generate_views.py
python3 database/design/refresh_manifest.py
python3 database/design/validate.py
```

El validador no instala paquetes, ejecuta SQL ni abre conexiones. Si en una revisión futura se dispone de `pglast`, añade análisis sintáctico y lo informa expresamente; sigue sin demostrar ejecución o integridad de aplicación.

La aceptación final de la DB requiere migración Flyway desde Spring, actualización con datos existentes, concurrencia del último recurso, no solape de reservas, pago idempotente, conservación histórica, suma de líneas, corrección de factura y restauración. El corte V1 no debe presentarse como implementación de todos los dominios.
