# Cadena local y promoción bloqueada

Cadena probada en PostgreSQL desechable: V1–V27 → V56 → V57 → V58 → V59 → V60. Los bytes de V1–V27 y V56 se preservan respecto de la base manifestada. No se incorpora V36 equivalente a V56. No se usa repair, baseline ni out-of-order. No se renumera ninguna migración aplicada.

| Unidad local | Dependencias y procedencia | Datos |
|---|---|---|
| V57 | Base y V56; DDL seleccionado de C 83bb196f: V35, V38, V46, V47, V48, sin importar ramas | modificadores/snapshots, preorden, quotes, cola por estación, holds |
| V58 | V57 | política singleton, revisión/logística, recursos de inventario, OTP/desafíos, invalidación de número |
| V59 | V58 | quotes/reservas/preorden snapshot, leases de mesa/inventario, preorder_order_id |
| V60 | V59 y finanzas existentes | propuestas/eventos/consentimiento, sustitución de snapshot de preorden y origen de pedidos convertidos, resolución financiera bloqueada si falta contrato, snapshot original, receipts de configuración |

La copia bare local no demuestra historial remoto ni historial aplicado compartido. La promoción de esta numeración está bloqueada hasta obtener referencias/historial Flyway autorizados de cada destino. Antes de integrar: contrastar versión/description/checksum/success con estos hashes, identificar V36/V56 equivalentes y cualquier V57–V60 ya registrada. Si una de estas versiones está aplicada con otra semántica, no editarla ni renumerarla: preparar nuevas migraciones aditivas en versiones realmente libres tras coordinación. Si V36 equivalente está aplicada, no aplicar además V56 a ciegas; reconciliar explícitamente el historial con responsables, sin comandos que lo oculten. La cadena local es evidencia de candidato, no permiso de promoción.

El test PickupCancellationMigrationIntegrationTest comprueba upgrade desde V56 y limpio con esta cadena. Los tests financieros existentes comprueban compatibilidad del upgrade y saldos/intentos. Cada Testcontainer es nuevo; no se conecta a bases o volúmenes existentes.
