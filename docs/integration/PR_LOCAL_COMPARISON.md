# Comparación actual de PR y candidatos locales

Revisión estática realizada tras actualizar origin y consultar GitHub. No se han ejecutado pruebas del PR51 ni se ha integrado su código. Las pruebas anteriores certifican el candidato PR32–50, no este PR nuevo.

## Referencias verificadas

- Original: `feature/barrera-table-orders`, `bbcb773b7f19804d54d04e69bc2d2410e46364a2`, sin cambios locales; corresponde al head de PR39.
- Candidato: `feature/integration-compatible-core`, HEAD/base `1339d740320741050b1131dd9880491d1adffefc` más cambios sin commit identificados en COMBINED_FILES.json.
- Nuevo PR51: `feature/consolidated-core-review`, `8e47ddbc346de73b949dce7404343fd80cde2d8a`; cinco commits sobre development, 363 archivos modificados. No contiene PR50 como ancestro Git; su código móvil requiere comparación y reconciliación, aunque pueda contener aportes equivalentes.
- Los heads de PR32–50 siguen iguales a la revisión anterior. PR33/36 fusionados; PR32/34 cerrados sin fusionar. La decisión de conservar PR36/50 y excluir PR34 sigue vigente.
- Rama adicional sin PR identificado: `fix-pickup-quote-flow`, commit `78b665f`; cambio exclusivo observado: comparación con Duration.ofDays(1), equivalente a 86.400 segundos. No resuelve los bloqueos de DELIVERY.

## Hallazgos

| Tema | Candidato local | PR51 | Conclusión |
|---|---|---|---|
| Teléfono | Sin verificación persistente | Provider, desafíos OTP, digest, caducidad, límites, ownership, trigger de invalidación, auditoría y requisito de posesión real | Ya existe una base implementada aprovechable; no hace falta rehacer el servicio desde cero. |
| Transporte telefónico | No conectado | Único provider de producción disponible declara available=false; el transporte de pruebas declara provesRealPossession=false | No hay SMS real conectado. Su propia documentación reconoce el bloqueo. Un test o adapter falso no autoriza marcar posesión real. |
| Logística | Aceptación bloqueada | Endpoint auditado/idempotente registra actor, fecha y motivo de confirmación; override con ADMIN activo | Resuelve parte del contrato, pero confirmar mediante motivo no acredita tarifa, agencia/repartidor ni ETA de traslado estructurados. |
| Horarios | PICKUP configurado | service_policy configurable, cutoff DELIVERY por recepción, revisión/override | ServiceHoursPolicy usa business_hours RESTAURANT para ambos servicios. No se observan parámetros independientes de anticipación máxima DELIVERY. La ETA de quote es preparación/cola, no transporte. |
| Aceptación | DELIVERY 422 | RequestAcceptancePolicy exige teléfono real, logística, hold vigente, override vigente y revalida precio/stock; crea pedido DELIVERY | Avance sustancial que debe integrarse como unidad junto con quotes, holds y migraciones. No habilitar por copiar únicamente la rama ACCEPT. |
| Migraciones | V1–V27; propuesta financiera sin versión activa | Añade V56–V60 y reconoce explícitamente numeración local con promoción bloqueada | No obtiene inventario global ni resuelve la colisión financiera de PR35. V26/V27 son iguales tras normalizar LF/CRLF; Git no presenta cambios respecto al candidato. No asignar nuevas versiones ni aplicar V56–V60 sin inventario autorizado. |
| Bandeja | Filtros status/type y GET detalle | Lista filtra solamente status; incluye más campos logísticos en resumen | Una sustitución completa perdería filtro type y contrato de detalle local. Reconciliar un solo controller/query que conserve ambos. |
| Recetas/inventario | Historial completo antes/después; reintento incierto conserva cuerpo/clave | No incorpora la corrección local de snapshots; provider de inventario difiere | Preservar las correcciones y sus pruebas. No reemplazar el candidato entero con PR51. |
| Seguridad | Overrides parser/UUID y caducidad de excepciones probados | Difiere del endurecimiento local de la puerta | Mantener lockfile/overrides y política local; repetir instalación, auditoría y bundles sobre el nuevo conjunto. |

## Integración recomendada

Un solo integrador y checkout escritor. Congelar PR51 en el SHA anterior. Crear otro candidato aislado conservando el actual y reconciliar, en orden: contratos de quotes/holds y modelos, migraciones como cadena temporal aún no promovible, teléfono, política, logística/aceptación, BFF y consumidores. Mantener perfil protegido, snapshots de recetas, filtros/detalle operativos y protecciones móviles de PR50. No fusionar PR51 completo sobre development ni sobreponer sus archivos al candidato a ciegas.

Repetir pruebas reales de PostgreSQL/Next/BFF, upgrades de historias conocidas, autenticación/propiedad, OTP vencido/cambio de número/límites/transportes falsos, override revocado, logística incompleta, expiración y doble aceptación de holds, pagos y cierre; lint/tipos/build/bundles y smoke combinado. La aprobación de despliegue sigue requiriendo inventario de bases y versiones reservadas. La verificación telefónica real requiere proveedor autorizado. La tarifa y ETA de traslado, anticipación DELIVERY y condición de pago deben quedar en contrato probado antes de certificar el recorrido completo.
