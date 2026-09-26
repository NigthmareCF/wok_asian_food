# Base de datos y ERD — WOK Asian Food

Revisión del 2026-09-25. **Diseño objetivo candidato de 128 tablas; V1 y V3 migran 31 tablas explícitas, con V2 de referencia. Se probaron aisladas en PostgreSQL 16. No es un esquema aprobado para producción.**

La nueva lectura del disco externo fue satisfactoria. Se recuperaron completos el modelo, generador, SQL, diccionario, contratos de integridad, diagramas y los tres documentos funcionales originales. Se conservaron copias locales con hashes para que la próxima revisión no dependa del disco externo.

## Archivos para el equipo

**Antes de cerrar el ERD:** revisar el [desglose funcional completo](FUNCTIONAL_SCOPE.md) y la [matriz de 529 requisitos](REQUIREMENTS_REVIEW.csv). Cubren el inventario de las 21 épicas y separan comportamiento documentado, decisiones pendientes y evidencia de implementación aún por verificar.

| Archivo                                                                                   | Utilidad                                                                                  |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [ERD completo editable](erd/wok-complete-erd.drawio)                                      | 128 tablas candidatas; 17 páginas: vista general, dominios y ERD completo                 |
| [Índice por dominio](erd/README.md)                                                       | 14 archivos Mermaid con columnas y relaciones físicas                                     |
| [Facturación editable](erd/invoicing-focus.drawio) y [vista SVG](erd/invoicing-focus.svg) | Vista parcial de pedido, cuenta, factura, nota de crédito y cobro                         |
| [SQL declarativo](../../database/schema/postgresql.sql)                                   | Exportación completa candidata; no aplicar directamente en producción                     |
| [Migraciones Flyway V1–V3](../../database/migrations/V1__identity_and_core.sql)           | Identidad/core, seeds y [mesas/reservas](../../database/migrations/V3__tables_and_reservations.sql) |
| [Diccionario de datos](data-dictionary.md)                                                | Columnas, tipos, nulabilidad, claves, CHECK e índices                                     |
| [Contratos de integridad](design-decisions.md)                                            | R01–R13 del diseño original: transacciones, conservación y reglas entre entidades         |
| [Correspondencia con backend Spring](BACKEND_MAPPING.md)                                  | Propiedad de tablas, casos de uso, orden de adopción y precauciones JPA                   |
| [Hallazgos y decisiones pendientes](REVIEW_FINDINGS.md)                                   | Brechas que impiden declarar cerrado el diseño                                            |
| [Validación](VALIDATION.md) y [resultado estructurado](VALIDATION.json)                   | Alcance y resultados comprobados en esta revisión                                         |
| [Manifiesto de fuentes](SOURCE_MANIFEST.json)                                             | Procedencia lógica, tamaños y SHA-256 de las copias recuperadas                           |

Abrir el archivo `.drawio` con diagrams.net/Draw.io. Empezar por la página del dominio que se va a implementar. La vista general sirve para localizar entidades; el detalle completo requiere zoom. El SVG de facturación se abre en navegador.

## Qué se verificó

- 128 tablas candidatas, 1,345 columnas, 341 FK simples y una FK compuesta contextual.
- 206 índices explícitos; adicionalmente PostgreSQL crea índices asociados a PK/UNIQUE.
- 17 páginas reales del Draw.io. El informe externo antiguo hablaba de 16; el archivo actual añade `16 - ERD Completo`.
- Modelo, DDL, diccionario y XML coinciden en los controles estructurales ejecutados.
- El manifiesto conserva hashes de la recuperación original y registra hashes actuales para artefactos evolucionados.
- Fuentes originales completas: 21 épicas, 308 historias, RN-001–145 y RT-001–076.

Contar requisitos no acredita su cobertura. V1→V2→V3 se ejecutaron en PostgreSQL 16 desechable, sin publicar puertos; pasaron [V1_constraints.sql](../../database/tests/V1_constraints.sql) y [V3_reservations.sql](../../database/tests/V3_reservations.sql). La exportación completa de 128 tablas también se ejecutó en una segunda DB desechable y pasó [candidate_constraints.sql](../../database/tests/candidate_constraints.sql). Esto no acredita casos de uso ni pruebas concurrentes/proveedores. La revisión visual del ERD completo sigue pendiente.

## Aclaración sobre facturación

**Facturación ya estaba prevista en el diseño externo de datos:** existen `invoices` e `invoice_items`. La nota de crédito usa `invoices.document_type = CREDIT_NOTE` y referencia el documento original. `bills` representa cuentas de consumo, `payments` cobros y `payment_receipts` comprobantes de pago; ninguno sustituye una factura.

Esto precisa la revisión anterior: no se encontró módulo frontend de emisión ni tarea completa de backend en el plan; no significa que faltaran las entidades en el ERD externo. Este paquete las hace visibles, pero no aprueba una integración fiscal ni extiende silenciosamente el plazo del proyecto.

La decisión vigente exige FEL como dominio propio: se añadieron estados, intentos y artefactos candidatos. Siguen pendientes proveedor, reglas fiscales verificadas e integración productiva. No se establecen aquí tasas ni formatos legales.

## Fuentes funcionales completas

- [Épicas e historias](requirements/epics-and-user-stories.txt).
- [Reglas de negocio y requisitos técnicos](requirements/business-rules-and-requirements.txt).
- [Vistas y mockups textuales](requirements/views-and-mockups.txt).
- [Correspondencia del modelo preliminar](erd/legacy-mapping.md).

Los TXT se renombraron al inglés para las rutas técnicas, sin alterar su contenido. El diseño externo proviene de la documentación académica de Desarrollo Web suministrada como contexto. El modelo objetivo y el corte Flyway son distintos; una tabla candidata no demuestra una función entregada.

## Regeneración y validación local

Desde la raíz del repositorio, con Python estándar:

```bash
python3 database/design/generate.py
python3 database/design/generate_views.py
python3 database/design/refresh_manifest.py
python3 database/design/validate.py
```

El primer comando regenera artefactos desde la fuente declarativa; el segundo crea vistas derivadas; el tercero actualiza hashes de las copias actuales conservando el hash original; el cuarto valida estructura sin conectar a DB. **No editar directamente el JSON/SQL generado ni sobrescribir una migración aplicada.** `build_initial_migration.py` y `build_reservation_migration.py` documentan sus cortes y se niegan a sobrescribirlos.

Siguiente paso: ejecutar Flyway desde Spring sobre una DB desechable y probar transacciones/concurrencia reales, luego migrar dominios candidatos en cortes explícitos. El SQL completo crea esquema/tablas de una vez y falla si ya existen; no aplicarlo sobre una DB de trabajo con datos.
