# Hallazgos del diseño recuperado

## Estado tras la decisión integral del propietario (2026-09-25)

Este archivo conserva los hallazgos originales como evidencia histórica. La decisión nueva reemplaza la exclusión de FEL, pagos online y mensajería del alcance objetivo. `DB-01` queda **SUPERSEDED** como decisión de recorte; la integración productiva sigue bloqueada por certificador y reglas fiscales verificadas. `DB-05` ya tiene entidad candidata `dining_sessions` y asignaciones históricas, pero aún no caso de uso ni migración. `DB-06` y `DB-08` se corrigieron **en el modelo candidato** con estados FEL, intentos, artefactos y numeración opcional antes de certificar; no están en V1. `DB-02`, `DB-03`, `DB-04`, `DB-07`, `DB-09`, `DB-10`, `DB-11` y las invariantes transaccionales `DB-12` siguen requiriendo diseño/implementación o pruebas. `DB-09` no se considera cerrado hasta probar Hibernate `@Version` contra el CHECK real.

La fuente vigente y el corte Flyway se explican en [README](README.md); tener 128 tablas candidatas no acredita 128 funciones. La prueba real sólo cubre las 23 tablas V1.

Fecha: 2026-09-17. La lectura completa ahora es posible. Se regeneró el diseño existente sin cambiar su semántica. **No se presenta como modelo definitivo**: estos puntos requieren decisiones o implementación antes de usarlo como base operativa.

## Diferencias y riesgos concretos

| ID    | Evidencia                                                                                                                                       | Consecuencia                                                                                                   | Acción antes de implementar                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB-01 | Hay `invoices` e `invoice_items`, pero el plan dejó fiscalización fuera del corte y no se encontró UI de emisión                                | Facturación existe como diseño de datos, no como módulo entregado                                              | PM/ingeniero confirman modalidad académica o fiscal real y prioridad; agregar historias/pantallas/contrato                                           |
| DB-02 | No existe `order_requests`; `orders` admite DRAFT/SUBMITTED/ACCEPTED/IN_PREPARATION/READY/COMPLETED/CANCELLED                                   | El contrato propuesto de solicitud separada no tiene correspondencia directa para espera, rechazo y expiración | Elegir solicitud como agregado propio o adaptar contrato sobre SUBMITTED con estados/historial suficientes. No duplicar ambas entidades sin decisión |
| DB-03 | No hay entidades explícitas de trabajos e intentos de impresión                                                                                 | Outbox genérico no acredita historial de intento/reimpresión/resultado incierto de RT-012–015/048–053          | Definir `print_jobs`/`print_attempts` o contrato persistente equivalente antes de habilitar impresoras                                               |
| DB-04 | `kitchen_tickets.sequence_number` distingue secuencias; no hay referencia explícita de sustitución/revisión completa                            | Un número por sí solo no expresa anulación parcial, sustitución total ni relación entre revisiones             | Definir contrato de revisión e inmutabilidad y evaluar columnas/entidad de revisión según RN-059–062                                                 |
| DB-05 | `orders.table_id` apunta a una mesa; reservas permiten varias asignaciones, pero no hay sesión/grupo de mesas explícito para consumo presencial | Unir/separar/trasladar mesas de EP-01 no está resuelto sólo por esa FK                                         | Evaluar sesión de consumo y relación de mesas, o documentar una alternativa que conserve historia y saldos                                           |
| DB-06 | `invoices.status` sólo tiene DRAFT/ISSUED/VOID; autorización externa es un campo opcional                                                       | Emisión fiscal con timeouts/rechazos/reintentos requeriría estado técnico y conciliación adicionales           | Si hay proveedor, diseñar intentos de emisión, idempotencia, callbacks y resultado incierto. No marcar ISSUED sólo por enviar                        |
| DB-07 | Nota de crédito referencia factura original; `invoice_items` no referencia la línea original acreditada                                         | Limitar cantidades/importes acreditados por línea puede ser ambiguo con varias facturas de una cuenta          | Acordar trazabilidad de línea correctiva a línea original y sus restricciones; no añadir FK definitiva sin validar política                          |
| DB-08 | `series` y `document_number` son obligatorios y únicos incluso con estado DRAFT                                                                 | El esquema presupone numeración disponible antes de emitir                                                     | Confirmar quién asigna números y cuándo; separar identificador interno y fiscal si corresponde                                                       |
| DB-09 | `row_version` parte de 1 y exige `> 0`                                                                                                          | La inicialización de versión numérica de JPA/Hibernate puede no coincidir con ese contrato                     | Probar entidad/versión inicial con Hibernate elegido; decidir ajuste de constraint/inicialización antes de usar `@Version` automáticamente           |
| DB-10 | `users.email` es único, estado CLOSED conserva identidad y `customer_profiles.user_id` también es único                                         | RN-114 exige perfil funcional nuevo; reutilizar el mismo correo puede chocar con unicidad                      | Definir archivo/anonimización o estrategia de identidad que permita el flujo autorizado sin recuperar datos antiguos                                 |
| DB-11 | `bill_items` puede clasificar conceptos, pero no se observa agregado específico de liquidación de cuentas de personal                           | EP-18 no se acredita sólo por tener employee_profiles y movimientos                                            | Definir deuda/liquidación por trabajador y su relación con venta/merma/cortesía si entra en alcance                                                  |
| DB-12 | DDL tiene CHECK/FK, pero no triggers/servicios/procedimientos de integridad transaccional                                                       | Balance=libro, aciclicidad, totales de factura, cobro y distribución no quedan todos garantizados              | Implementar contratos R01–R13 y pruebas concurrentes contra PostgreSQL                                                                               |

Los hallazgos DB-02–11 son brechas o decisiones de diseño, no afirmaciones de que una implementación existente esté fallando. El usuario informó trabajo backend en curso fuera de lo inspeccionado: compararlo antes de diseñar entidades duplicadas.

## Facturación: alcance que sí está representado

- Cuenta comercial: `bills` con artículos en `bill_items`, relacionada con pedidos por `bill_orders`.
- Documento: `invoices` conserva emisor/receptor, moneda, importes, autorización, ubicación del documento y estado.
- Detalle: `invoice_items` congela descripción, cantidad, precio, descuento e impuesto por línea.
- Documento correctivo: `document_type = CREDIT_NOTE`, con `original_invoice_id`.
- Cobro: `payments`, asignaciones, comisiones y reembolsos son operaciones distintas.
- Comprobante de cobro: `payment_receipts`, único por pago, no sustituye factura.

No existe garantía de que un documento emitido sea válido fiscalmente por guardarlo en estas tablas. Política/proveedor y requisitos legales se confirman por separado; no se inventan tasas, números, obligatoriedad de identificadores ni procedimiento de anulación.

## Requisitos y evidencia

Las copias locales contienen íntegramente 21 épicas, 308 historias, 145 RN y 76 RT. Se revisaron estructura y contratos críticos; no se completó una matriz de aceptación por cada historia/regla. No confundir estas tres afirmaciones:

1. **Documentado:** la fuente describe el comportamiento.
2. **Representado:** existen entidades/campos o un contrato de servicio que lo soportan.
3. **Implementado y probado:** un backend/frontend ejecuta la regla y hay evidencia.

Este paquete acredita recuperación, generación y controles estáticos, no el punto 3. La corrección de recorridos frontend detectada en la revisión anterior sigue siendo trabajo separado.

## Orden de resolución

Primero DB-02/09/10 y alcance de DB-01: afectan contrato, sesiones y base del proyecto. Después las brechas correspondientes a las funciones habilitadas. Impresión, agrupación de mesas, cuentas de personal o emisión externa pueden diferirse sólo si se deshabilita ese alcance y lo acepta PM/ingeniero.

Registrar cada resolución como decisión, cambiar fuente declarativa/contratos juntos, regenerar ERD/DDL/diccionario y validar sobre PostgreSQL desechable antes de adoptar la migración. No cambiar la base externa recuperada sin conservar procedencia.
