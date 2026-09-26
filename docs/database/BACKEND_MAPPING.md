# Correspondencia ERD → backend Java/Spring

Estado: propuesta de adopción del modelo recuperado el 2026-09-17. El modelo físico contiene más alcance que la entrega de 5–6 semanas; sus tablas no son una lista de endpoints CRUD obligatorios.

## Propiedad por dominio

| Página ERD                 | Tablas | Módulo Spring propuesto                    | Casos de uso                                                              |
| -------------------------- | -----: | ------------------------------------------ | ------------------------------------------------------------------------- |
| 01 Auth IAM                |     12 | `identity`                                 | Registro, login, sesiones, renovación, permisos y bloqueo                 |
| 02 Customers Staff         |      7 | `customers`, `staff`                       | Perfiles, restricciones, direcciones, horarios y excepciones              |
| 03 Tables Reservations     |      5 | `tables`, `reservations`                   | Asignar capacidad, llegar, liberar, cancelar y conservar historial        |
| 04 Menu                    |      7 | `catalog`                                  | Categorías, platillos, áreas, modificadores y precios                     |
| 05 Recipes Items           |      7 | `recipes`                                  | Unidades, artículos, presentaciones, recetas y versiones                  |
| 06 Inventory               |      7 | `inventory`                                | Lotes, saldos, movimientos, reservas y transferencias                     |
| 07 Suppliers Purchases     |      8 | `purchasing`                               | Proveedores, compromisos y recepción parcial                              |
| 08 Production              |      6 | `production`                               | Planes, lotes de producción, consumos, rendimientos e historiales         |
| 09 Availability Operations |      4 | `availability`, `service`                  | Suspensión/override, capacidad y estado del restaurante                   |
| 10 Orders Kitchen          |      9 | `orders`, `kitchen`                        | Pedido, artículos, cambios, comanda por área y estados                    |
| 11 Delivery Messaging      |      7 | `delivery`, `messaging`                    | Despacho, conversaciones separadas y asignación humana                    |
| 12 Billing Payments Cash   |     19 | `billing`, `payments`, `cash`, `invoicing` | Cuentas, cobros, comprobantes, propinas, caja y documentos de facturación |
| 13 AI Vision               |      6 | `ai`, `vision`                             | Contexto/herramientas limitadas, handoff y revisión de detecciones        |
| 14 Audit Settings Events   |      5 | `audit`, `settings`, `integration`         | Auditoría, configuración, horarios, outbox e idempotencia                 |

Propiedad financiera: `billing` mantiene `bills`, `bill_orders`, `bill_items`; `payments` mantiene métodos, pagos, asignaciones, devoluciones, comisiones y comprobantes; `cash` mantiene cajas, sesiones, movimientos y arqueos; `invoicing` mantiene `invoices` e `invoice_items`. Propinas y moneda deben tener un dueño acordado, no copias por módulo.

Un caso de uso que cruza módulos coordina una sola transacción local cuando debe ser atómico. Los módulos se llaman por servicios internos; no se necesitan microservicios ni una DB por canal. Web Cliente, app Cliente, Operativo y Administrativo consultan proyecciones distintas con permisos sobre los mismos registros.

## Correspondencia de tipos y repositorios

| PostgreSQL      | Java candidato                                   | Consideración                                                  |
| --------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `UUID`          | `UUID`                                           | DTO serializa string; el identificador no concede acceso       |
| `NUMERIC`       | `BigDecimal`                                     | Moneda/unidad y redondeo explícitos; evitar `double` en dinero |
| `TIMESTAMPTZ`   | `Instant` u `OffsetDateTime` según contrato      | Fecha operativa/horario local se calculan con zona configurada |
| `DATE` / `TIME` | `LocalDate` / `LocalTime`                        | No usarlos como sustitutos de un instante de auditoría         |
| `JSONB`         | Mapeo JSON compatible con Hibernate seleccionado | Snapshots/configuración; no serializar entidades JPA completas |
| `TSTZRANGE`     | Mapeo específico o SQL parametrizado             | Exclusión de reservas debe preservarse en Flyway/PostgreSQL    |
| `row_version`   | Campo de control de concurrencia                 | Revisar versión inicial y CHECK antes de usar `@Version`       |

Cada módulo puede organizarse como `api`, `application`, `domain` y `infrastructure`, sin crear capas vacías. Controladores aceptan DTO validados; servicios autorizan y coordinan transacciones; repositorios persisten; respuestas no exponen la gráfica JPA ni datos internos.

No aplicar `CascadeType.REMOVE`/`orphanRemoval` de forma general a libros e históricos. Las FK actuales usan RESTRICT; una anulación de negocio conserva el registro y sus compensaciones. Índices, CHECK, restricciones parciales y exclusión GiST deben estar en migraciones explícitas.

Spring Data JPA permite especificar modos de bloqueo en repositorios. La política concreta se prueba dentro del caso transaccional; una anotación aislada no demuestra ausencia de sobreventa. [Documentación de bloqueos](https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html).

## Transacciones que hay que implementar

| Caso                | Agregados principales                                                     | Invariante y referencia                                                                         |
| ------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Aceptar solicitud   | Pedido/artículos, capacidad, saldos/asignaciones, idempotencia, auditoría | Revalidar; reservar atómicamente; confirmar después del commit. RN-089–097, RN-108–112, R07/R11 |
| Modificar comanda   | Artículos, historial, tickets, asignaciones                               | Original/reemplazo trazables; cocina recibe revisión. RN-056–064/071–074                        |
| Recibir compra      | Recepción/líneas, lotes, movimientos/saldos                               | Compra no aumenta stock hasta recepción contabilizada. RN-083/084, R05                          |
| Terminar producción | Batch, consumos/salidas, lotes, movimientos                               | Consumir ingredientes y registrar rendimiento real una vez. RN-085–087, R06                     |
| Cobrar              | Cuenta, pago/asignaciones, propina, movimiento efectivo si corresponde    | No sobreaplicar venta; idempotencia; estado financiero separado. RN-021/022/046–049, R08/R09    |
| Emitir factura      | Cuenta/líneas, factura/líneas, auditoría y operación idempotente          | Congelar datos; evitar doble facturación; emisión externa es integración separada               |
| Acreditar/anular    | Factura original/correctiva, líneas, auditoría                            | No exceder lo acreditable; nota de crédito no ejecuta automáticamente reembolso                 |
| Asignar reserva     | Reserva, mesas e intervalos                                               | Sin solape/capacidad incompatible, incluyendo ocupación real. RN-009–016, R02                   |

En todos: autenticar/autorizar, validar estado actual bajo bloqueo o versión, guardar historia y resultado, y responder tras commit. Un pago o emisor externo necesita idempotencia/conciliación; no mantener transacción DB abierta durante la llamada de red. Las sumas entre filas no quedan garantizadas por CHECK de una sola fila. [Restricciones PostgreSQL](https://www.postgresql.org/docs/18/ddl-constraints.html).

## Adopción incremental

1. Recuperar el avance backend del equipo, elegir versiones Java/Spring/PostgreSQL y resolver los hallazgos que afectan al corte.
2. Aprobar contrato API y estados: el plan usa nombres distintos del borrador físico; elegir mapeo documentado o migración explícita.
3. Calcular dependencias FK del corte. `users`, `currencies`, catálogos y auditoría suelen ser base, pero el orden final se deriva del DDL y sus ciclos.
4. Crear tablas y después agregar FK cuando existan ciclos. El borrador original sigue ese patrón; no ordenar sólo por nombre de archivo.
5. Versionar migraciones Flyway y probar creación desde cero, actualización y restricciones sobre PostgreSQL real. No usar la exportación completa como una migración repetible de producción.
6. Implementar el recorrido que quepa en las 2–3 semanas funcionales: seguridad básica, catálogo, solicitud/aceptación coherente, KDS y cobro sólo si está en alcance.
7. Usar semanas finales para revisión, concurrencia, recuperación, seguridad y pruebas web/app; no para incorporar las 109 tablas como funciones nuevas.

Las referencias físicas a tablas futuras pueden requerir tablas soporte tempranas. Si se elimina una dependencia para simplificar el corte, registrar la decisión y volver a validar modelo/DDL/ERD; no borrar FK silenciosamente para que JPA arranque.

## Relación con las 21 épicas

| Épica                 | Dominios de datos principales    | Observación de cobertura                                                |
| --------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| EP-01 Mesas           | 03, 10, 12                       | Agrupación de mesas/ocupación requiere revisión adicional               |
| EP-02 Reservas        | 03, 09, 10                       | Ventanas/estado existen; reglas horarias viven también en servicios     |
| EP-03 Pedidos         | 10, 06, 12                       | Solicitud pendiente versus pedido aceptado debe acordarse               |
| EP-04 Enrutamiento    | 04, 10, 14                       | Revisión de comanda e impresión requieren contratos explícitos          |
| EP-05 Delivery        | 11, 10, 12                       | Dirección histórica e ingresos separados; integración externa pendiente |
| EP-06 Comunicación    | 11, 13                           | Identidad confirmada y aislamiento de canal requieren API               |
| EP-07 Clientes        | 01, 02                           | Reutilización de identidad tras cierre necesita decisión                |
| EP-08 Usuarios/roles  | 01                               | Modelo multirol; autorización no se implementa por tener tablas         |
| EP-09 Personal        | 02, 09                           | Turnos/excepciones y capacidad operativa                                |
| EP-10 Menú            | 04, 05, 09                       | Modificadores y publicación/disponibilidad                              |
| EP-11 Recetas         | 05                               | Versiones y relaciones; aciclicidad debe validarse                      |
| EP-12 Inventario      | 06, 05                           | Libros, lotes y saldos; sumas/consumo transaccionales                   |
| EP-13 Compras         | 07, 06                           | Compromiso y recepción separados                                        |
| EP-14 Producción      | 08, 05, 06                       | Consumos y salidas versionadas                                          |
| EP-15 Disponibilidad  | 09, 05, 06, 08, 10               | Cálculo derivado; no es sólo una columna de stock                       |
| EP-16 Cocina          | 10, 09, 02                       | Estados/ETA; simulación de carga no nace automáticamente del ERD        |
| EP-17 Pagos/caja      | 12                               | Cuentas/pagos/arqueos; facturación existe como diseño adicional         |
| EP-18 Consumo interno | 06, 12, 02                       | Revisar liquidación por empleado antes de declarar historia completa    |
| EP-19 IA              | 13, 11                           | Herramientas autorizadas; sin acceso directo a DB                       |
| EP-20 Visión          | 13                               | Señales y revisión humana; no sustituye estado operativo                |
| EP-21 Administración  | 14 y consultas de otros dominios | Requiere políticas, auditoría y operación, no una tabla por reporte     |

Esta es correspondencia por dominio, no una certificación de cumplimiento de las 308 historias o las 221 RN/RT. El [informe de hallazgos](REVIEW_FINDINGS.md) establece lo pendiente antes de congelar el diseño.
