# Evaluación de Liquibase frente a Flyway

Fecha: 2026-10-04  
Estado: evaluación solamente; no se cambió el motor de migraciones.

## Conclusión

Liquibase es técnicamente viable con la base actual: Spring Boot ofrece integración automática y PostgreSQL está soportado. Sin embargo, el proyecto no obtiene una ventaja funcional inmediata que compense convertir el historial existente. Se recomienda mantener Flyway mientras WOK continúe usando PostgreSQL y migraciones SQL versionadas.

## Evidencia del repositorio

- `apps/api/pom.xml` declara `spring-boot-starter-flyway` y `flyway-database-postgresql`.
- `apps/api/src/main/resources/application.yml` habilita Flyway y lee `database/migrations` desde el sistema de archivos.
- Hay 26 archivos Flyway (`V1`–`V26`), escritos como SQL PostgreSQL bajo `database/migrations`; Docker monta esa carpeta en `/database/migrations` y Testcontainers aplica la secuencia.
- El acceso de negocio usa JDBC y SQL explícito; no hay changelogs Liquibase ni Hibernate/JPA que justifiquen cambios declarativos.
- La especificación del proyecto se orienta a PostgreSQL, no a varios motores.

## Comparación para WOK

| Tema | Flyway actual | Liquibase posible |
|---|---|---|
| Migraciones SQL | Encaja directamente con los `Vn__name.sql` ya existentes | Admite SQL formatted y otros changelog. Se pueden reutilizar sentencias SQL, pero hay que definir y versionar changesets y su identidad |
| Spring Boot | Configurado y usado por pruebas/Compose | Starter oficial, `spring.liquibase.change-log` y ejecución automática disponibles |
| PostgreSQL | Ya es el motor y las migraciones actuales están escritas para él | Soportado; no elimina la dependencia de revisar SQL específico PostgreSQL |
| Rollback | Se gestiona con migraciones compensatorias SQL | El rollback automático aplica a tipos de changelog modelados para ciertos cambios; con SQL formatted hay que escribir rollback manual |
| Historial | `flyway_schema_history` | `DATABASECHANGELOG` y `DATABASECHANGELOGLOCK`; es otro historial, no compatible de forma transparente con Flyway |
| Beneficio diferencial aquí | Flujo sencillo y alineado al SQL manual existente | Contextos/labels y changelogs declarativos pueden ayudar con varios entornos, motores o generación de documentación/diffs si se adoptan realmente |

## Riesgo y esfuerzo estimado

La conversión es factible, pero el riesgo principal está en el historial ya aplicado, no en agregar la dependencia. Liquibase no debe arrancar sobre una base existente suponiendo que sus 26 cambios no se ejecutaron: intentaría crear objetos ya presentes. Antes de cualquier conversión se necesita inventariar bases y versiones, comparar cada esquema con una base limpia construida desde V1–V26 y acordar un baseline Liquibase. `changelog-sync` puede marcar changesets como ejecutados, pero sólo debe ejecutarse después de verificar que el esquema real coincide con ellos; no corrige ni detecta por sí solo divergencias de modelo.

Estimación de planificación, no compromiso: 1–2 días para una conversión controlada con bases de desarrollo desechables; 3–5 días si hay que conservar y migrar varias bases con datos, validar historia, Compose/CI, pruebas desde cero y procedimiento de vuelta. Una base desplegada con datos reales requiere además respaldo restaurable y ventana de mantenimiento.

## Si se decide migrar en el futuro

1. Congelar cambios de esquema durante la conversión y enumerar todos los entornos y versiones Flyway aplicadas.
2. Elegir una sola fuente de verdad y un formato (SQL formatted para conservar SQL, o XML/YAML sólo si se desea modelado declarativo). No mantener Flyway y Liquibase aplicando cambios en paralelo.
3. Generar una base PostgreSQL limpia con Flyway V1–V26 y comparar tablas, índices, constraints, funciones, permisos y seeds relevantes con cada entorno.
4. Crear changelog baseline y probarlo en DB limpia y copia de datos; usar `changelog-sync` únicamente en copias verificadas, tras revisar el SQL generado.
5. Probar arranque, idempotencia operacional, fallos a mitad de changeset, restore desde backup y migraciones futuras; cambiar Compose, configuración Spring, tests y documentación juntos.
6. Retirar Flyway sólo cuando todos los entornos tengan el historial Liquibase consistente y un rollback operativo probado. No editar ni borrar migraciones Flyway ya aplicadas como parte de cambios rutinarios.

## Fuentes oficiales

- [Spring Boot: inicialización de base de datos y soporte Flyway/Liquibase](https://docs.spring.io/spring-boot/how-to/data-initialization.html)
- [Liquibase: changesets, ejecución transaccional y formatos](https://docs.liquibase.com/concepts/changelogs/changeset.html)
- [Liquibase: changelog SQL formatted](https://docs.liquibase.com/community/user-guide-5-0-2/sql-changelog-example)
- [Liquibase: rollback para SQL formatted](https://docs.liquibase.com/secure/reference-guide-6-0/rollback)
- [Liquibase: tablas de seguimiento y bloqueo](https://docs.liquibase.com/community/user-guide-5-0-3/what-is-the-database-changelog-lock-table)
- [Liquibase: `changelog-sync`](https://docs.liquibase.com/secure/reference-guide-5-1/database-inspection-change-tracking-and-utility-commands/changelog-sync)
