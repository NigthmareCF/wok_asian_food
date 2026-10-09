# Inventario E0 — Administración y control financiero

## Metadatos

| Campo                | Valor                                                     |
| -------------------- | --------------------------------------------------------- |
| Responsable          | Beto                                                      |
| Fecha del inventario | 8 de octubre de 2026                                      |
| Rama base            | `development`                                             |
| Hash base            | `9eab32352b33adc0d4b6a77f6ebee21e9724ed98`                |
| Plan de referencia   | Plan de trabajo del 5 de octubre de 2026                  |
| Estado               | Trabajo individual listo; integración todavía no validada |

## Alcance de Beto

El paquete comprende Administración, datos mantenibles, consulta de cuenta
financiera, pagos, caja, reportes, inventario y producción cuando el piloto los
incluya, además de comprobantes internos y revisión de facturación. Un
comprobante interno, una preferencia de pago, el registro de un pago externo,
un cobro mediante pasarela y una factura fiscal son capacidades distintas y no
se consideran equivalentes.

Beto es propietario de las rutas BFF específicas de administración, cuenta
financiera, pagos y caja. Puede implementarlas usando el transporte existente y
solicitar a Fernando la revisión de compatibilidad y seguridad. Fernando es
propietario del transporte BFF compartido, autenticación común, configuración
transversal, lockfile e infraestructura. Chan conserva la responsabilidad del
backend y sus contratos. Barrera debe pasar el `accountId` real desde la vista
operativa de cuenta.

## Pantallas inventariadas

| Función                   | Ruta                                     | Archivos principales                            | Fuente actual          | Estado                         | Permiso visual            | Pruebas                       | Brecha                                                     |
| ------------------------- | ---------------------------------------- | ----------------------------------------------- | ---------------------- | ------------------------------ | ------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Dashboard administrativo  | `/admin`                                 | `modules/admin`, `data/fixtures/admin.ts`       | Fixture                | Simulada; carga, vacío y error | Contexto ADMIN            | `admin-dashboard.test.tsx`    | Sin métricas reales                                        |
| Usuarios                  | `/admin/users`                           | `modules/users`, `data/fixtures/users.ts`       | Fixture                | Simulada                       | `users.read`              | `user-management.test.tsx`    | API disponible sin conexión Web                            |
| Roles y permisos          | `/admin/roles`                           | `modules/roles-permissions`, fixture homónimo   | Fixture                | Simulada; conflicto artificial | `roles.read`              | `roles-permissions.test.tsx`  | Contrato backend parcial                                   |
| Personal y horarios       | `/admin/staff`                           | `modules/staff`, `data/fixtures/staff.ts`       | Fixture                | Simulada                       | `staff.read`              | `staff-schedule.test.tsx`     | Sin contrato backend completo                              |
| Catálogo administrativo   | `/admin/menu`                            | `modules/menu`, `modules/admin-workspace`       | Fixture del workspace  | Simulada                       | `menu.read`               | `admin-workspace.test.tsx`    | Solo existe lectura pública backend                        |
| Recetas                   | `/admin/recipes`                         | `modules/recipes`                               | Fixture del workspace  | Simulada                       | `recipes.read`            | Tests del workspace/modelos   | Contrato administrativo incompleto                         |
| Proveedores               | `/admin/suppliers`                       | `modules/suppliers`                             | Fixture del workspace  | Simulada                       | `suppliers.read`          | Test del workspace            | Sin backend                                                |
| Compras                   | `/admin/purchases`                       | `modules/purchases`                             | Fixture del workspace  | Simulada                       | `purchases.read`          | Tests del workspace/modelos   | Recepción local no actualiza inventario real               |
| Producción administrativa | `/admin/production`                      | `modules/production/production-plan-view.tsx`   | Fixture del workspace  | Simulada                       | `production.read`         | Test del workspace            | No consume la API disponible                               |
| Reportes                  | `/admin/reports`                         | `modules/reports`                               | Fixture del workspace  | Simulada; CSV local            | `reports.read`            | Test del workspace            | Sin contrato backend                                       |
| Cierres históricos        | `/admin/cash-closings`                   | `modules/cash/cash-closings-view.tsx`           | Fixture del workspace  | Simulada                       | `cash.read`               | Test del workspace            | No consulta cierres reales                                 |
| Configuración             | `/admin/settings`                        | `modules/settings`                              | Fixture del workspace  | Simulada; error y reintento    | `settings.read`           | Test del workspace            | Sin contrato backend completo                              |
| Auditoría                 | `/admin/audit`                           | `modules/audit`                                 | Fixture del workspace  | Simulada                       | `audit.read`              | Test del workspace            | Backend escribe auditoría, pero no la expone para consulta |
| Pagos                     | `/operation/payments` y detalle          | `modules/payments`, `data/fixtures/payments.ts` | Fixture/provider React | Simulada                       | `payments.read`           | `payments-views.test.tsx`     | No usa `accountId` real ni API                             |
| Precuenta                 | `/operation/payments/[recordId]/prebill` | `modules/payments/components/prebill-view.tsx`  | Fixture                | Simulada                       | Hereda `payments.read`    | Cobertura indirecta           | Calcula importes localmente; no es factura fiscal          |
| Caja                      | `/operation/cash`                        | `modules/cash`, `data/fixtures/cash.ts`         | Fixture/provider React | Simulada                       | `cash.read`               | `cash-view.test.tsx`          | API disponible sin conexión Web                            |
| Inventario                | `/operation/inventory` y detalle         | `modules/inventory`, fixture homónimo           | Fixture/provider React | Simulada                       | `inventory.read`          | `inventory-views.test.tsx`    | El frontend deriva existencias y disponibilidad            |
| Producción operativa      | `/operation/production` y detalles       | `modules/production`, fixture homónimo          | Fixture/provider React | Simulada                       | `production.read`         | `production-views.test.tsx`   | API disponible sin conexión Web                            |
| Facturación/outbox        | Sin pantalla Web                         | Sin módulo Web específico                       | No aplica              | Ausente                        | Backend `invoices:manage` | `InvoiceIntegrationTest.java` | Faltan UI, BFF específico y proveedor fiscal real          |

Las vistas A-05 a A-16 ofrecen estados artificiales normal, cargando, sin
datos y error mediante `AdminWorkspaceProvider`; no representan respuestas de
red.

## Contratos existentes y ausentes

| Operación                       | BFF específico | Backend                                                             | Método       | Permiso backend     | Idempotencia o versión                     | Estado              | Dependencia                       |
| ------------------------------- | -------------- | ------------------------------------------------------------------- | ------------ | ------------------- | ------------------------------------------ | ------------------- | --------------------------------- |
| Consultar cuenta financiera     | Ausente        | `/api/v1/operational/accounts/{accountId}`                          | GET          | `accounts:manage`   | No aplica                                  | Disponible          | BFF de Beto; revisión de Fernando |
| Registrar pago                  | Ausente        | `/api/v1/operational/accounts/{accountId}/payments`                 | POST         | `payments:manage`   | `Idempotency-Key`; `X-Request-Id` opcional | Disponible          | BFF de Beto; revisión de Fernando |
| Abrir caja                      | Ausente        | `/api/v1/operational/cash-sessions`                                 | POST         | `cash:manage`       | `Idempotency-Key`                          | Disponible          | BFF de Beto; revisión de Fernando |
| Consultar caja actual           | Ausente        | `/api/v1/operational/cash-sessions/current`                         | GET          | `cash:manage`       | No aplica                                  | Disponible          | BFF de Beto; revisión de Fernando |
| Registrar movimiento            | Ausente        | `/api/v1/operational/cash-sessions/{id}/movements`                  | POST         | `cash:manage`       | `Idempotency-Key`                          | Disponible          | BFF de Beto; revisión de Fernando |
| Cerrar o conciliar caja         | Ausente        | `/api/v1/operational/cash-sessions/{id}/close` y `/reconciliations` | POST         | `cash:manage`       | Versión/request ID según operación         | Disponible          | BFF de Beto; revisión de Fernando |
| Inventario                      | Ausente        | `/api/v1/operational/inventory/items...`                            | GET/POST/PUT | `inventory:manage`  | Movimientos idempotentes                   | Disponible          | Confirmar piloto                  |
| Producción                      | Ausente        | `/api/v1/operational/production/batches...`                         | GET/POST     | `production:manage` | Registro idempotente                       | Disponible          | Confirmar piloto                  |
| Listar usuarios                 | Ausente        | `/api/v1/admin/users`                                               | GET          | Rol `ADMIN`         | Paginación                                 | Disponible          | BFF administrativo de Beto        |
| Cambiar roles                   | Ausente        | `/api/v1/admin/users/{id}/roles/{role}`                             | PUT          | Rol `ADMIN`         | `expectedVersion`                          | Parcial             | Solo gestiona ADMIN/OPERATIONAL   |
| Menú público                    | `/bff/menu`    | `/api/v1/public/menu`                                               | GET          | Público             | Sin caché                                  | Conectado           | No sustituye CRUD administrativo  |
| Borradores fiscales             | Ausente        | `/api/v1/operational/accounts/{id}/invoices`                        | GET/POST     | `invoices:manage`   | `Idempotency-Key`                          | Disponible          | BFF específico y decisión fiscal  |
| Solicitar emisión               | Ausente        | `/api/v1/operational/invoices/{id}/issue`                           | POST         | `invoices:manage`   | Idempotencia y outbox                      | Disponible con mock | Proveedor FEL real ausente        |
| CRUD de catálogo administrativo | Ausente        | Ausente                                                             | —            | Por definir         | Por definir                                | Ausente             | Chan                              |
| Reportes reales                 | Ausente        | Ausente                                                             | —            | Por definir         | Por definir                                | Ausente             | Chan                              |
| Consulta de auditoría           | Ausente        | Ausente                                                             | —            | Por definir         | Paginación por definir                     | Ausente             | Chan                              |

## Fixtures que todavía alimentan el runtime

| Archivo                              | Datos contenidos                        | Pantallas consumidoras      | Sustitución posible       | Aprobación requerida              |
| ------------------------------------ | --------------------------------------- | --------------------------- | ------------------------- | --------------------------------- |
| `data/fixtures/admin.ts`             | Métricas, alertas y críticos            | `/admin`                    | API de dashboard/reportes | Contrato de Chan                  |
| `data/fixtures/users.ts`             | Usuarios, roles y estados               | `/admin/users`              | API AdminUser             | Revisión BFF de Fernando          |
| `data/fixtures/roles-permissions.ts` | Roles y capacidades                     | `/admin/roles`              | Contrato ampliado         | Chan                              |
| `data/fixtures/staff.ts`             | Personal, turnos y ausencias            | `/admin/staff`              | Contrato nuevo            | Chan                              |
| `data/fixtures/admin-workspace.ts`   | Datos de A-05 a A-16                    | Doce vistas administrativas | Endpoints por dominio     | Chan y decisiones del restaurante |
| `data/fixtures/menu.ts`              | Menú, precios y disponibilidad simulada | Menú y configuradores       | Menú público parcial      | Catálogo real aprobado            |
| `data/fixtures/payments.ts`          | Cuentas, pagos, propinas y descuentos   | Pagos y precuenta           | Cuenta y Payment API      | BFF de Beto; enlace de Barrera    |
| `data/fixtures/cash.ts`              | Sesión, movimientos y esperado          | Caja                        | Cash API                  | BFF de Beto                       |
| `data/fixtures/inventory.ts`         | Stock, reservas, lotes y costes         | Inventario                  | Inventory API             | Decisión del piloto               |
| `data/fixtures/production.ts`        | Lotes, rendimiento y sugerencias        | Producción                  | Production API            | Decisión del piloto               |

`AppProviders` mantiene `DataSource = "mock"` como valor actual. Los providers
financieros y operativos almacenan cambios únicamente en memoria.

## Pruebas existentes y cobertura faltante

| Dominio                   | Archivo de prueba                                                                      | Cobertura existente                                  | Cobertura faltante                             | Requiere backend/Docker |
| ------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------- | ----------------------- |
| Dashboard                 | `admin-dashboard.test.tsx`                                                             | Período y estados simulados                          | Datos y permisos reales                        | No                      |
| Usuarios                  | `user-management.test.tsx`                                                             | CRUD local, validación y accesibilidad               | API, concurrencia y RBAC real                  | No                      |
| Roles                     | `roles-permissions.test.tsx`                                                           | Edición local y conflicto simulado                   | Versionado backend                             | No                      |
| Personal                  | `staff-schedule.test.tsx`                                                              | Turnos y ausencias locales                           | Persistencia                                   | No                      |
| A-05 a A-16               | `admin-workspace.test.tsx`, `models.test.ts`                                           | Reglas de demostración                               | Contratos reales                               | No                      |
| Pagos Web                 | `payments-views.test.tsx`                                                              | Parcial, propina y filtros locales                   | Red, idempotencia y resultado incierto         | No                      |
| Caja Web                  | `cash-view.test.tsx`                                                                   | Movimiento y cierre local                            | API y concurrencia                             | No                      |
| Inventario/producción Web | `inventory-views.test.tsx`, `production-views.test.tsx`                                | Mutaciones locales                                   | Ledger y consumo reales                        | No                      |
| Cuenta/pagos API          | `PaymentIntegrationTest.java`                                                          | Saldo, mixtos, propina, doble cobro y permisos       | BFF/UI                                         | Sí                      |
| Caja API                  | `CashSessionIntegrationTest.java`                                                      | Apertura, movimientos, cierre, conciliación y replay | BFF/UI                                         | Sí                      |
| Inventario/producción API | `Inventory*Test.java`, `ProductionIntegrationTest.java`                                | Ledger, reservas, receta, consumo y permisos         | BFF/UI y decisión de piloto                    | Sí                      |
| Facturación API           | `InvoiceIntegrationTest.java`                                                          | Drafts, outbox, idempotencia y conflictos            | Proveedor FEL real y UI                        | Sí                      |
| Autorización API          | `PermissionAuthorizationIntegrationTest.java`, `RoleAuthorizationIntegrationTest.java` | Roles y permisos backend                             | Correspondencia completa con permisos visuales | Sí                      |

## Dependencias por responsable

| Necesidad                                                 | Responsable              | Evidencia                                                         | Impacto                                   | Trabajo independiente disponible                    |
| --------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| BFF específicos de administración, cuenta, pagos y caja   | Beto                     | Las rutas específicas no existen                                  | Impide conectar las vistas actuales       | Implementar por slice sobre el transporte existente |
| Transporte BFF compartido, auth, configuración y revisión | Fernando                 | Sesión y helpers comunes son transversales                        | Define compatibilidad y controles comunes | Beto puede avanzar y solicitar revisión             |
| Backend y contratos faltantes                             | Chan                     | Faltan catálogo admin, personal, reportes y consulta de auditoría | Mantiene módulos en simulación            | Preparar vistas/adaptadores sin inventar reglas     |
| `accountId` real desde la cuenta operativa                | Barrera                  | La navegación actual abre una lista basada en IDs de fixture      | Bloquea continuidad mesa-cuenta           | Vista financiera directa por URL                    |
| Confirmación del piloto                                   | Coordinación/restaurante | Inventario y producción existen, pero son alcance condicionado    | Riesgo de trabajo fuera de entrega        | Mantener inventario documental                      |
| Políticas comerciales y fiscales                          | Coordinación/restaurante | No están definidos proveedor FEL ni catálogo definitivo           | Impide declarar integración productiva    | Consulta interna claramente etiquetada              |

## Historial comprobado

| PR                                 | Commit de integración | Resultado comprobado                  |
| ---------------------------------- | --------------------- | ------------------------------------- |
| #23 — integración frontend/backend | `d53df42`             | Presente en `development`             |
| #27 — cierre de caja               | `236f90f`             | Presente en `development`             |
| #28 — inventario/producción        | `27769d9`             | Presente en `development`             |
| #29 — pagos mixtos/propinas        | `e938a86`             | Presente en `development`             |
| #30 — facturación/outbox           | `bdae09a`             | Presente en `development`             |
| #31 — QA/seguridad                 | `3611002`             | Presente y ancestro de la base actual |

Al realizar E0, `development` estaba en `9eab323`, correspondiente al PR #33.

## Riesgos

- Los fixtures y providers Web representan importes con `number`, mientras el
  backend usa tipos decimales.
- El saldo de pagos se calcula localmente y no debe convertirse en autoridad
  financiera.
- Los providers no persisten y pierden sus cambios al recargar.
- La Web no representa un resultado incierto tras una respuesta perdida.
- Los permisos visuales como `payments.read` no coinciden directamente con los
  permisos backend como `payments:manage`.
- Una precuenta o comprobante interno no es una factura fiscal.
- Registrar tarjeta o transferencia externa no equivale a una pasarela online.
- El frontend calcula existencias y disponibilidad que corresponden al backend.
- El proveedor fiscal actual es mock; no existe emisión FEL real validada.

## Entregas pequeñas priorizadas

| Orden | Entrega                           | Resultado verificable                                     | Dependencias                            | Rama sugerida                       |
| ----- | --------------------------------- | --------------------------------------------------------- | --------------------------------------- | ----------------------------------- |
| 1     | Consulta financiera de cuenta     | Total, pagos, propinas y saldo leídos por `accountId`     | Enlace de Barrera; revisión de Fernando | `feature/beto-account-summary`      |
| 2     | Registro seguro de pago           | Pago idempotente sin duplicación por doble clic/reintento | Contrato de Chan; revisión de Fernando  | `feature/beto-payment-capture`      |
| 3     | Pagos parciales/mixtos y propinas | Saldo restante siempre devuelto por backend               | Contrato existente                      | `feature/beto-mixed-payments`       |
| 4     | Apertura y consulta de caja       | Sesión actual persistente e idempotente                   | Revisión de Fernando                    | `feature/beto-cash-open-read`       |
| 5     | Movimientos y cierre/conciliación | Conflictos de versión y diferencias visibles              | Revisión de Fernando                    | `feature/beto-cash-close`           |
| 6     | Administración conectable         | Un dominio administrativo por PR                          | Contratos de Chan                       | `feature/beto-admin-users-data`     |
| 7     | Reportes                          | Períodos y totales conciliables                           | Contrato nuevo de Chan                  | `feature/beto-admin-reports`        |
| 8     | Inventario/producción             | Lectura y operaciones respaldadas por ledger              | Decisión del piloto                     | `feature/beto-inventory-production` |
| 9     | Comprobantes/facturación          | Estados internos separados de emisión fiscal              | Política fiscal y contrato              | `feature/beto-invoice-review`       |

## Primera entrega recomendada

La siguiente entrega recomendada es la **consulta financiera de cuenta por
`accountId`**, exclusivamente de lectura. Debe mostrar total, pagos, propinas y
saldo provenientes del backend; no debe incluir botones de cobro ni cálculos
financieros autoritativos en el frontend.

El BFF específico pertenece a Beto y debe construirse sobre el transporte y la
autenticación existentes. Fernando revisará compatibilidad y seguridad. Chan
mantiene el contrato backend y Barrera debe entregar el `accountId` real desde
la vista operativa.

## Limitaciones de E0

- No se ejecutaron pruebas Web ni Java durante E0.
- No se validó integración contra base de datos.
- Inventario y producción dependen de la decisión de incluirlos en el piloto.
- La emisión FEL real no está disponible.
- Catálogo administrativo, personal, reportes y auditoría carecen de contratos
  completos.
- La existencia de controladores y pruebas backend no demuestra que las vistas
  Web estén integradas.
