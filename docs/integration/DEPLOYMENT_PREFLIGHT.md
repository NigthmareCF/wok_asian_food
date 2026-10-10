# Preflight de despliegue

No ejecutar la propuesta de trazabilidad ni asignarle versión hasta completar el inventario. No modificar V26/V27 ni sus checksums. No usar `flyway repair` para ocultar discrepancias.

El responsable de cada despliegue persistente ejecuta `database/tests/migration-history-inventory.sql` con una conexión autorizada de solo lectura. La consulta exporta historial Flyway e índices financieros; no contiene credenciales ni datos de clientes. Recoger además las versiones reservadas por ramas pendientes, porque no aparecen en Flyway. Registrar el nombre del entorno y responsable fuera de las credenciales de conexión.

Comprobar que V26/V27 financieras coinciden con el candidato, si se aplicó V26 de PR35 en algún entorno y si hay migraciones posteriores o fallidas. Las historias divergentes requieren un plan por entorno antes de elegir una versión futura. Un inventario de una base local no equivale a un inventario global.

La propuesta `proposals/cash-movement-traceability.sql` y su comprobación se prueban como contrato SQL sobre PostgreSQL temporal, fuera de las migraciones activas. Su prueba no autoriza el despliegue.

DELIVERY: los PR actuales no aportan verificación persistente de teléfono, cotización logística completa, ETA/anticipación independientes y autorización de override con motivo. La recepción pendiente, consulta y rechazo siguen disponibles; la aceptación permanece bloqueada. Habilitarla exige implementar y probar ese contrato completo, sin generar pedido/pago/producción antes de las validaciones. No se declara completado por aceptar únicamente la capacidad DELIVERY.

Decisión del responsable recibida en esta ejecución: conservar PR36/50 como base móvil y excluir PR34. No se fusionan ni cierran PR automáticamente. Los cambios visuales exclusivos de PR32 no sustituyen la base móvil comprobada.
