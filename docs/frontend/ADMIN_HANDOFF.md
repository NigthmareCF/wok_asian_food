# Entrega administrativa A-05 a A-16

Responsable: Edgar. A-01 a A-04 corresponden a Roberto y no se modificaron en esta entrega. Base: `feature/frontend-admin` en `51964d2`, con development `95f678a` incluido.

## Rutas y comportamiento

| ID   | Ruta                   | Comprobación principal                                                                                                                 |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A-05 | `/admin/menu`          | Crear/editar/eliminar platillo, foto local de hasta 2 MB, opciones y visibilidad; categoría usada no se puede eliminar.                |
| A-06 | `/admin/recipes`       | Crear versión desde una receta, editar borrador y marcar vigente conservando versiones históricas; validar ingredientes y rendimiento. |
| A-07 | `/admin/suppliers`     | Crear/editar contacto y productos, marcar preferido y consultar compras relacionadas.                                                  |
| A-08 | `/admin/purchases`     | Registrar compra sin alterar stock; recibir cantidades parciales con confirmación y motivo; no recibir más de lo pendiente.            |
| A-09 | `/admin/production`    | Modificar sugerencia, aceptar/descartar y avanzar manualmente el plan simulado.                                                        |
| A-10 | `/admin/reports`       | Filtrar fechas/canal, elegir ventas o margen estimado y exportar CSV con capacidad simulada de gestión.                                |
| A-11 | `/admin/cash-closings` | Filtrar cierres y verificar apertura + ventas + ingresos − gastos − retiros frente a efectivo contado.                                 |
| A-12 | `/admin/clients`       | Consultar pedidos/incidencias, registrar incidencia, aplicar restricción específica y retirarla sin borrar historial.                  |
| A-13 | `/admin/settings`      | Editar parámetros, revisar/confirmar con motivo; probar error de guardado, conservar formulario y reintentar.                          |
| A-14 | `/admin/ai`            | Crear/editar/previsualizar/eliminar plantillas locales. No hay modelo conectado ni envío.                                              |
| A-15 | `/admin/vision`        | Consultar confianza y registrar confirmación/rechazo humano de señales sintéticas, sin efectos operativos.                             |
| A-16 | `/admin/audit`         | Buscar actor/entidad/acción/fecha, filtrar, ordenar, paginar y abrir antes/después/motivo.                                             |

## Organización técnica

Las páginas solo componen vistas de `modules/<domain>`. `modules/admin-workspace` expone el provider de estado de demostración y patrones comunes de UI; `shared` no depende de estos módulos. `data/fixtures/admin-workspace.ts` contiene datos sintéticos tipados.

El provider se monta en el layout administrativo, conserva datos y filtros al navegar y los reinicia al recargar. No hay localStorage, transporte real ni dependencia del estado Operativo. Las recepciones modifican únicamente existencias administrativas de demostración. Cada mutación guarda un evento de auditoría local.

Las opciones de demostración de cada vista permiten cargar estados normal, carga, vacío, error y solo lectura. No sustituyen permisos de backend. La navegación móvil ofrece enlaces a todas las secciones, además de la barra existente.

## Verificación y límites

- Suite completa: 91 pruebas aprobadas. Casos nuevos cubren transiciones de compra, historial de receta, cancelaciones sin mutación, restricciones duplicadas, errores de configuración, auditoría, catálogo, proveedores, producción, plantillas y señales.
- Lint, TypeScript, formato de Web y build aprobados. No se omitieron chequeos del build. El sandbox de la sesión produjo salida vacía del proceso TypeScript; ejecutar fuera de él permitió verificar el build.
- Pruebas de navegador a 390, 768, 1280 y 1440 px, teclado, foco, Escape, touch y navegación entre vistas.
- `format:check` global incluye un blueprint local preexistente con formato pendiente. Ese archivo no pertenece a la entrega ni fue modificado.
- Recursos de Menú descargados del nodo Figma `16:551`; se conservan localmente sin depender de URLs temporales. Producción referencia `16:1419`. La cuota de Figma impidió completar el contraste de las demás vistas.
- IA y Visión permanecen limitadas a plantillas y revisión de ejemplos. La política real de confianza, permisos, configuración por día y horario nocturno requiere definición; no hay integración real.

Antes de integrar, revisar los cambios de navegación con Roberto y contrastar visualmente las vistas cuyos nodos no se pudieron consultar. Commit, publicación y revisión del PR corresponden a la autorización de Edgar/SM.
