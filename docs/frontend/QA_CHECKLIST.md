# Frontend QA Checklist

Checklist manual para validar los canales Cliente y Operativo antes de integrar
PRs en `development`. Marcar cada punto únicamente después de probarlo en el
navegador y anotar cualquier incidencia en el PR correspondiente.

## Preparación

- [ ] Partir de la versión más reciente de `development`.
- [ ] Ejecutar `npm run lint`.
- [ ] Ejecutar `npm run typecheck`.
- [ ] Ejecutar `npm run test`.
- [ ] Ejecutar `npm run build:web`.
- [ ] Confirmar que no existen secretos, archivos generados ni cambios fuera del alcance.

## Viewports

- [ ] Móvil estrecho: 390 px.
- [ ] Tablet: 768 px.
- [ ] Escritorio: 1280 px.
- [ ] Escritorio amplio: 1440 px.
- [ ] No existe desbordamiento horizontal.
- [ ] Los botones, formularios, tablas y tarjetas conservan contenido legible.
- [ ] El menú operativo se puede plegar y la navegación móvil permanece accesible.

## Canal Cliente

- [ ] C-07: reservar con datos válidos muestra confirmación simulada.
- [ ] C-08: seleccionar una hora posterior a la permitida exige preorden según la regla definida.
- [ ] C-09: checkout muestra productos, total, método de pago, propina y revalidación.
- [ ] C-09: el checkout indica claramente que el pago es demostrativo y no fiscal.
- [ ] C-10: seguimiento muestra los estados del pedido en el orden esperado.
- [ ] C-11: ubicación no inventa dirección, mapa ni proveedor de navegación.
- [ ] C-12: mensajería permite seleccionar una conversación y enviar un mensaje local.
- [ ] Las rutas de detalle y los botones de regreso funcionan.

## Canal Operativo

- [ ] O-01: dashboard muestra métricas, alertas y estado del servicio sin saturación visual.
- [ ] O-02/O-03: mesas se pueden abrir, unir, separar y consultar.
- [ ] O-04/O-05: la mesa se conserva al crear el pedido y el detalle permite actualizarlo.
- [ ] O-04/O-05: varias cuentas se guardan y se envían como un único pedido.
- [ ] O-06: Cocina permite filtrar por estación y estado, cambiar ETA y marcar comandas.
- [ ] O-07/O-08: reservas permiten crear, consultar y revisar detalles.
- [ ] O-09/O-10: mensajes y solicitudes muestran filtros, estados e iconos correctos.
- [ ] O-11: Delivery permite filtrar, asignar repartidor, avanzar estado y reprogramar.
- [ ] O-12/O-13: Pagos y Precuenta muestran desglose, métodos, propina, descuentos y confirmaciones.
- [ ] O-14: Caja calcula esperado, contado y diferencia; las acciones financieras confirman resultado.
- [ ] O-15: Inventario permite buscar, filtrar y abrir el detalle de un insumo.
- [ ] O-15: el botón “Nueva entrada” apunta a una ruta existente o está deshabilitado/documentado.
- [ ] O-16: Producción permite revisar, completar y descartar batches con motivo.
- [ ] O-17: disponibilidad representa stock menos reservado.
- [ ] O-18: Estado del servicio exige motivo y muestra historial de cambios.

## Estados y navegación

- [ ] Se validan estados normal, carga, vacío y error cuando la vista los ofrece.
- [ ] Los filtros actualizan el contenido y mantienen un estado seleccionado visible.
- [ ] Los formularios validan campos obligatorios y muestran mensajes en español.
- [ ] Las confirmaciones no ejecutan acciones financieras reales.
- [ ] Los datos simulados indican que se reinician al recargar.
- [ ] Los enlaces no llevan a rutas 404.
- [ ] La navegación con teclado mantiene foco visible y orden lógico.
- [ ] Las acciones táctiles tienen un área cómoda en móvil.

## Resultado

Fecha de revisión: ____

Revisor: ____

PR revisado: ____

Resultado: `Pendiente` / `Aprobado` / `Requiere cambios`

Incidencias o pendientes:

-
