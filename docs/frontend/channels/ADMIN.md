# Canal Administrativo

Responsables: Edgar y Beto. Rama de canal disponible: `feature/frontend-admin`.

El canal Administrativo concentra configuración, catálogos, usuarios, reportes y auditoría. Debe favorecer comparación, búsqueda y edición controlada; no debe parecer una página promocional.

## Ubicación técnica

- Rutas: `apps/web/src/app/(private)/(admin)/admin`.
- Dominios principales: `modules/users`, `modules/roles-permissions`, `modules/staff`, `modules/menu`, `modules/recipes`, `modules/suppliers`, `modules/purchases`, `modules/reports`, `modules/settings`, `modules/audit`, `modules/ai` y `modules/vision`.
- Navegación: `apps/web/src/config/navigation.ts`.

## Referencias visuales

- [Prototipo A-11 a A-16](https://www.figma.com/proto/KrN3PSudQXxQsbtc4coyOg/Sin-t%C3%ADtulo?node-id=16-1875): contiene 26 marcos. Se verificaron visualmente Cierres de Caja Históricos, Clientes/Incidencias/Restricciones y Configuración del Restaurante; su navegación incluye también IA y Mensajería, Cámaras y Auditoría.
- [Roles y permisos](https://www.figma.com/make/LkyX09v8NvSDyDH61OMHmL/Roles-y-permisos-interface): referencia para A-03.

Los valores, personas, correos, importes y fechas visibles en los prototipos son datos demostrativos; no deben copiarse como configuración ni fixtures definitivos.

## Catálogo de vistas

| ID   | Ruta inicial                     | Controles y acciones mínimas                                        | Estados mínimos                                        |
| ---- | -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| A-01 | `/admin`                         | Abrir alertas, críticos, compras y producciones sugeridas           | Cargando, sin datos, error y período seleccionado      |
| A-02 | `/admin/users` propuesta         | Buscar, crear, editar, activar, suspender y consultar roles         | Activo, suspendido, desactivado y acceso pendiente     |
| A-03 | `/admin/roles` propuesta         | Crear/editar rol, marcar permisos, guardar y ver permisos efectivos | Sin cambios, cambios pendientes, guardando y conflicto |
| A-04 | `/admin/staff` propuesta         | Editar horario, turno especial, auxiliar y ausencia                 | Previsto, disponible, ausente y cambio pendiente       |
| A-05 | `/admin/menu` propuesta          | CRUD de categorías, platos, fotos, opciones y visibilidad           | Publicado, borrador, no disponible y restringido       |
| A-06 | `/admin/recipes` propuesta       | Crear versión, editar componentes, rendimiento y vigencia           | Borrador, vigente, histórica y dependencia inválida    |
| A-07 | `/admin/suppliers` propuesta     | Buscar, crear, editar, marcar preferido y ver historial             | Activo, incidencia y sin productos asociados           |
| A-08 | `/admin/purchases` propuesta     | Editar cantidades, guardar y registrar ingreso                      | Solicitada, parcial, comprada, recibida y cancelada    |
| A-09 | `/admin/production` propuesta    | Revisar sugerencias, aceptar, rechazar y consultar tiempos          | Sugerida, aceptada, activa y descartada                |
| A-10 | `/admin/reports` propuesta       | Elegir período, filtros, reporte y exportar si está autorizado      | Cargando, sin datos, error y exportación pendiente     |
| A-11 | `/admin/cash-closings` propuesta | Buscar, filtrar, abrir desglose y consultar diferencia              | Correcto, con diferencia y revisión pendiente          |
| A-12 | `/admin/clients` propuesta       | Consultar historial, incidencias y aplicar/retirar restricción      | Activo, eliminado, suspendido y restringido            |
| A-13 | `/admin/settings` propuesta      | Editar horarios, límites, propina, tolerancia y políticas           | Sin cambios, cambios pendientes, guardando y error     |
| A-14 | `/admin/ai` propuesta            | Administrar plantillas y revisar capacidades autorizadas            | Alcance pendiente; no habilitar acciones autónomas     |
| A-15 | `/admin/vision` propuesta        | Consultar señales, confianza y confirmar/rechazar detección         | No disponible, baja confianza y confirmada             |
| A-16 | `/admin/audit` propuesta         | Buscar, filtrar, ordenar, paginar y abrir evento                    | Cargando, vacío, error y detalle de evento             |

## Reglas que no se pueden omitir

- Un usuario puede tener varios roles y ve la unión de capacidades permitidas.
- El registro público nunca puede asignarse roles operativos.
- Los cambios sensibles deben registrar actor, fecha, operación y motivo cuando aplique.
- Horarios, propina, tolerancias y cierres son configurables; no se hardcodean en las vistas.
- Cambios de receta conservan versiones históricas.
- Compra registrada y entrada a inventario son operaciones diferentes.
- Restricciones de clientes son internas, específicas y auditables.
- IA puede proponer; las acciones restringidas requieren autorización humana.
- Visión es una señal complementaria y debe mostrar nivel de confianza.
- No implementar AI o Vision más allá del alcance confirmado.

## Patrones de interfaz

En escritorio, usar navegación lateral, toolbar, tabla o lista y detalle contextual. En móvil, usar encabezado compacto, tarjetas, filtros en panel y detalle en pantalla o sheet. La acción primaria debe ser única y clara; acciones secundarias o sensibles van en menú contextual o confirmación.

Las tablas incluyen búsqueda, filtros, orden y paginación cuando el volumen lo requiera. Deben conservar filtros durante la navegación y ofrecer estados vacío y error útiles.

## Entrega del canal

El PR debe indicar los permisos representados, acciones sensibles, datos simulados y decisiones pendientes. Para Roles y permisos se usa el mockup identificado como referencia visual, pero el catálogo real de permisos debe confirmarse con backend antes de declararlo definitivo.
