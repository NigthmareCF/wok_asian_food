# Candidato combinado: integración funcional compatible

Este informe y sus manifiestos registran la verificación previa a la publicación del PR. Las referencias a cambios sin commit describen ese momento; el commit publicado identifica el árbol final. La publicación no autoriza fusión ni despliegue, y no incorpora PR51.

Rama: `feature/integration-compatible-core`. Base y HEAD sin commits nuevos: `1339d740320741050b1131dd9880491d1adffefc`, development con PR36 fusionado. Los cambios del candidato siguen sin commit; HEAD por sí solo no identifica su contenido. El manifiesto COMBINED_FILES.json identifica los archivos mediante SHA256. No se ha publicado ni fusionado en development.

El checkout original y el candidato anterior se conservan. CANDIDATE_STATUS.md, TEST_RESULTS.json y CANDIDATE_FILES.json son evidencia histórica del candidato anterior; este informe y COMBINED_TEST_RESULTS.json corresponden al candidato nuevo.

## Selección y dependencias

Los SHA fuente y responsables propuestos están en CURRENT_PR_INTEGRATION_PLAN.md. Se incorporó el delta de PR39, que contiene PR37, sobre development actual; PR36 no se reaplica. Se conservaron las correcciones locales de API, perfil, finanzas, reservas e idempotencia. PR50 aporta las mejoras móviles reconciliadas con la política real de reservas. PR49 aporta el selector de direcciones, conservando el perfil protegido. De PR41 se integran capacidades; de PR44, inventario y lectura de producción; de PR45, dashboards y estados honestos de funcionalidad bloqueada. Se adaptan las correcciones compatibles de PR47/48 sin activar su renumeración V28. PR43 no se superpone sobre la implementación financiera de PR39. Next y eslint-config-next quedan alineados en 16.4.0; Expo conserva las versiones de development.

PR32 está cerrado sin fusionar y su rescate exclusivo requiere decisión del responsable. PR34 está cerrado sin fusionar: el rollback queda excluido del candidato; su exclusión fue confirmada por el responsable en esta ejecución. No se cerraron ni fusionaron PR automáticamente. PR42 documenta funcionalidades bloqueadas; no autoriza ampliar IA o Vision.

## Contratos comunes

- Existe un único GET `/api/v1/operational/order-requests`: filtros query `status` y `type`, lista limitada y detalle protegido. `fulfillmentType` es un campo de respuesta, no el nombre del filtro. Se conservan necesidades de la web y de operación.
- Un único perfil protegido: identidad verificada, normalización opcional, direcciones y sesiones; bloqueo inmediato de doble envío, aislamiento por usuario/sesión, versiones esperadas y tratamiento correcto de DELETE 204.
- Roles como unión de capacidades; registro público sin roles operativos. Pruebas negativas comprueban propiedad y separación cliente/operación/administración.
- PICKUP usa horarios y anticipación configurados en backend. Reservas usan mínimo real de dos horas y suplemento configurable por grupos, hora civil Guatemala y reloj conservador del servidor/dispositivo. Las vistas consumen la política real.
- DELIVERY permanece con aceptación bloqueada: faltan garantías completas de teléfono, cotización/ETA, anticipación y autorización del override. No se deducen permisos nuevos de un botón o de capacidades parciales.
- Entrada de inventario y compra siguen siendo operaciones diferentes. Los cambios de receta guardan snapshots completos antes/después con actor, fecha e identificador de auditoría; no borran el historial nuevo. No se presenta un editor de recetas o compras todavía no implementado.

## Migraciones y despliegue

Se conservan V26/V27 financieras y su dependencia; no se renombraron migraciones aplicadas ni se activó V28 por suposición. La funcionalidad de trazabilidad de PR35 queda documentada como propuesta fuera del directorio activo. La historia local autorizada no acredita otros despliegues. **Bloqueado para despliegue:** inventario de historias persistentes y reservas de versiones, responsable de despliegue y versión futura aprobada para la propuesta.

## Verificación del candidato

API: 273 pruebas aprobadas; BFF móvil: 30; web: 897 en 108 archivos; móvil: 109. Lint, tipos y build web pasan. Se ejecutaron pruebas con PostgreSQL y Next reales, permisos negativos, filtros, propiedad, perfil/direcciones/sesiones, recetas históricas y límites temporales. Ver COMBINED_TEST_RESULTS.json para el cierre del smoke.

El smoke usa PostgreSQL temporal separado: cocina → servicio → pago parcial (cierre rechazado) → pago total/saldo cero → cierre de pedido → cierre de mesa → retiro idempotente → conciliación y cierre de caja → rechazo de movimiento posterior. Transferencias no incrementan el efectivo. Nunca se ejecuta contra el proyecto persistente `wok`.

Verificación visual web: dashboard y listado real de inventario; dashboard sin desbordamiento horizontal en 390/768/1280/1440. Se generaron correctamente bundles Android e iOS (Hermes) y exportación web móvil con 17 rutas. No se certifica ejecución en dispositivos, compilación nativa firmada/EAS ni todas las interacciones táctiles.

Auditoría posterior a correcciones: 26 vulnerabilidades de producción (23 high, 3 moderate, 0 critical); auditoría del workspace web reporta 2 high. Se corrigieron postcss-selector-parser (7.1.6) y UUID usado por xcode (11.1.1) mediante overrides acotados y bundles verificados. La puerta local de seguridad del repositorio pasa con las dos excepciones exactas ya presentes en development para braces/node-forge, sin ampliar la lista. Se añadieron pruebas de caducidad y prohibición de alertas críticas (8 pruebas de puerta aprobadas). Las excepciones vencen tras 2026-11-02. npm audit sigue reportando vulnerabilidades; no se declara auditoría limpia ni CI remoto ejecutado. Ver docs/security/DEPENDENCY_EXCEPTIONS.md.

## Coordinación y comprobaciones obligatorias

Responsables propuestos, pendientes de aceptación: Barrezzi12 integra; Chuansi232 revisa API/capacidades/inventario/perfil; AVillatoroG17 revisa web/finanzas; TomyAnva revisa móvil/BFF; responsable del despliegue valida migraciones. Ningún mensaje externo fue enviado.

Un solo escritor en esta rama: integrador. Los demás trabajan en ramas y checkouts separados, entregando parches con SHA congelados. Controllers, lockfile y documentación común se reconcilian secuencialmente. Antes de liberar: resolver el inventario de migraciones y DELIVERY si se habilita, conservar las excepciones de seguridad únicamente durante su vigencia y la decisión confirmada de base móvil/rollback, congelar commit del candidato y repetir comprobaciones sobre ese commit, incluyendo smoke de DELIVERY autorizado y validación nativa cuando aplique.
