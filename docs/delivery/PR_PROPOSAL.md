# Entrega consolidada para revisión

Rama publicada como Draft hacia `development`: `feature/consolidated-core-review`. Se preparó sobre `development` en `1339d740320741050b1131dd9880491d1adffefc`. El Draft no implica aprobación ni merge. Es un candidato acumulado que incluye el contenido de #39 y reconciliaciones; coordinar con Barrezzi para evitar integrar esa base dos veces si #39 cambia o se incorpora por separado.

PR39: `bbcb773b7f19804d54d04e69bc2d2410e46364a2`; PR37 está contenido en PR39. No se cherry-pickearon los commits originales: el candidato se reconcilió por contenido y contratos sobre la base acordada. El manifiesto y la decisión de archivos están en `docs/delivery/STAGING_MANIFEST.md`; los detalles de reconciliación y migraciones, en `docs/consolidated/`.

## Título

feat: integra el core consolidado de pedidos, reservas y operación

## Descripción

Integra recorridos de Cliente, Operativo y móvil con contratos API/BFF, cotizaciones y holds, preórdenes, reservas, disponibilidad, sustituciones con decisión explícita del cliente, documentos imprimibles y dependencias financieras. Mantiene el flujo presencial explícito: mesa → pedido → cocina → servido → pago → cierre/liberación.

Incluye el trabajo de #39 y sus correcciones relacionadas; no es un PR aislado de #37. Se conserva la identidad del perfil y checkout, se descartan respuestas obsoletas y los reintentos inciertos mantienen clave y contenido. Las políticas de pedidos se centralizan en backend y se exponen a Web y móvil.

## Verificación reportada

- API: 322 pruebas; BFF: 32; Web: 902; móvil: 73.
- Tipos y lint aprobados; build Web y export Android aprobados en copias/servicios aislados.
- Smoke y Mobile previos tienen su evidencia y límites en `docs/delivery/COMPATIBILITY_CHECK.md`.

Estos resultados son del candidato reconciliado y no sustituyen CI remoto ni auditoría independiente final.

## Pendientes y límites

- Transporte OTP real: requiere proveedor/hardware y configuración operativa. Existe el contrato, pero no se afirma entrega real de SMS.
- Sustituciones después de pagos: falta resolver el contrato de diferencias financieras antes de habilitar esos casos.
- V56–V60 son candidatas; su promoción requiere comparar el historial Flyway real de los entornos destino. No ejecutar estas migraciones en producción desde este Draft.
- Revisión visual completa y prueba en Android físico pendientes.
- CI remoto y gate actualizado de vulnerabilidades pendientes de revisión en GitHub.

No declara terminadas todas las tareas del plan ni autoriza despliegue productivo. Antes del merge, coordinar la cadena con Barrezzi, revisar migraciones contra el historial real, completar la auditoría independiente y resolver los bloqueos anteriores.
