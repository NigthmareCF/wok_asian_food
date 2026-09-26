# Desglose funcional para validar backend y base de datos

Fecha: 2026-09-17. Estado: **levantamiento consolidado para revisión; no aprobación de alcance, ERD ni implementación**.

## 1. Qué es WOK y qué se está verificando

WOK Asian Food gestiona la atención del restaurante desde la solicitud del cliente hasta preparación, entrega, cobro y control de recursos. Incluye administración, personal, proveedores, producción y herramientas de apoyo. Web, app y eventual escritorio son canales del mismo negocio, no bases de datos ni reglas independientes. La app prevista ofrece sólo funciones de Cliente; Operativo y Administrativo corresponden a la web en la fase actual.

Se desglosa el producto completo de **21 épicas, 308 historias, 145 reglas de negocio y 76 requisitos técnicos**. Los planes de entrega proponen un corte menor para 5–6 semanas; no eliminan requisitos del producto ni acreditan que se implementen todos. Las últimas 2–3 semanas reservadas para seguridad y ajustes limitan la construcción inicial. Seguridad, permisos y consistencia deben diseñarse desde el comienzo.

Fuentes: [historias originales](requirements/epics-and-user-stories.txt), [reglas y requisitos originales](requirements/business-rules-and-requirements.txt), [vistas originales](requirements/views-and-mockups.txt). El [modelo recuperado](README.md) de 109 tablas es candidato para contraste. No determina por sí solo lo que el negocio necesita.

Este documento desarrolla todos los módulos, incluye un caso de uso detallado por épica y reproduce las 308 historias completas, además de las 145 reglas y 76 requisitos en sus anexos. La [matriz completa](REQUIREMENTS_REVIEW.csv) conserva literalmente cada una de las 529 historias/reglas/requisitos, con su ID y campos para validar, asignar entrega y registrar evidencia. Las 308 historias están asociadas a sus 21 épicas originales. Las asociaciones individuales RN/RT → historia, API, entidad y prueba aún deben completarse; las referencias por módulo de abajo son orientativas, no una certificación exhaustiva de cobertura.

**Documentado, representado en datos e implementado/probado son estados diferentes.** Esta revisión acredita inventario documental. No vuelve a auditar todas las pantallas ni prueba un backend desplegado. Los casos de uso siguientes se derivan de historias; no se atribuye una numeración CU inexistente a la fuente.

## 2. Actores y límites

| Actor | Responsabilidades |
|---|---|
| Cliente | Consultar menú, solicitar pedidos/reservas, elegir medio de pago, ver seguimiento e historial propios, comunicarse y gestionar su cuenta. |
| Atención / mesero | Mesas, reservas, pedidos, cambios, comunicación y coordinación de entrega según permisos. |
| Cocina / sushi / barra | Comandas de su área, preparación, producción, estado y ETA. |
| Cajero | Cuentas, cobros, propinas, comprobantes y caja según permisos. |
| Inventario / compras / empaque | Recursos, recepciones, conteos, empaques y proveedores según permisos. |
| Encargado / administrador | Autorizaciones, cierres, usuarios, configuración, auditoría y reportes. |
| Repartidor externo | Participante de logística; no se presupone una app ni acceso autenticado propio. |
| IA, cámaras e integraciones | Apoyo controlado; no sustituyen decisiones autorizadas ni fuente transaccional. |

Son funciones del negocio, no una lista definitiva de roles. Una persona puede reunir varias; el backend autoriza cada acción y el acceso al recurso específico.

## 3. Desglose por épica

### EP-01. Mesas y sala — 12 historias

**Actores:** Atención y encargado.

**Qué hace:** Ver estados y capacidades; abrir atención indicando comensales; unir, separar y trasladar mesas; identificar reserva próxima; controlar tiempo ocupado y responsables; consultar quién añadió, modificó y cobró. Los cambios excepcionales necesitan permiso. Una mesa con deuda no se libera sin autorización.

**Qué debe conservar la BD:** Mesa, capacidades, ocupación o sesión de atención, mesas vinculadas, responsables e historial de movimientos. La relación entre grupo, pedidos y cuentas debe conservarse al trasladar mesas.

**Reglas y referencias:** RN-015–016, RN-048; HU-MES-01–12.

**Verificación pendiente antes del ERD:** Definir sesión de consumo y agrupación temporal de mesas. Una sola FK de pedido a mesa no acredita unión/separación ni su historia.

#### Desarrollo del caso de uso: Abrir, agrupar y trasladar una atención

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Identificador de mesa o mesas, número de comensales, usuario que abre, responsable actual y observaciones operativas.

**Flujo completo:** Consultar mesas y reservas próximas; elegir capacidad suficiente; comprobar que no exista ocupación incompatible; abrir la atención; vincular las mesas; permitir pedidos y cuentas asociados; registrar cambios de responsable, uniones y traslados; al terminar, comprobar saldos y liberar las asignaciones correspondientes.

**Responsabilidad del backend:** La capacidad debe evaluarse sobre el conjunto real, evitando contar dos veces una mesa. Toda mesa vinculada necesita un período de asignación para reconstruir su uso. Cambiar de mesa no cambia los productos consumidos ni extingue deudas. El cierre excepcional requiere permiso y motivo.

**Datos y vínculos que deben poder reconstruirse:** Atención o sesión: identificador, apertura, cierre, comensales, creador, responsable y estado. Asignación: mesa, inicio, fin y motivo del cambio. Mesa: nombre/código, capacidad estándar/máxima, estado operativo. Referencias a pedidos, cuentas e historial.

**Errores, alternativas y decisiones:** Dos empleados intentan ocupar la misma mesa; parte del grupo se retira; una mesa queda fuera de servicio; se traslada una cuenta parcialmente pagada. Definir reglas para estos casos antes de escoger cardinalidades.

**Criterio de aceptación propuesto:** Dos operaciones simultáneas no deben abrir ocupaciones incompatibles. Trasladar un grupo debe conservar exactamente sus pedidos, pagos y saldo.

#### Historias originales completas de EP-01

- HU-MES-01. Como personal de atención, quiero visualizar todas las mesas y su estado para identificar rápidamente cuáles están disponibles.

- HU-MES-02. Como personal de atención, quiero asignar una mesa a un grupo indicando el número de comensales.

- HU-MES-03. Como personal de atención, quiero unir o separar mesas cuando la capacidad de una sola mesa no sea suficiente.

- HU-MES-04. Como personal de atención, quiero conocer la capacidad estándar y máxima de cada mesa.

- HU-MES-05. Como personal de atención, quiero trasladar una cuenta o pedido de una mesa a otra.

- HU-MES-06. Como personal de atención, quiero conocer el tiempo transcurrido desde que una mesa fue ocupada.

- HU-MES-07. Como sistema, quiero registrar quién abrió inicialmente una mesa y quién figura como responsable operativo actual.

- HU-MES-08. Como sistema, quiero conservar el historial de usuarios que agregaron, modificaron o cobraron productos asociados a una mesa.

- HU-MES-09. Como personal de atención, quiero marcar una mesa como libre, ocupada, reservada, en preparación o fuera de servicio.

- HU-MES-10. Como personal autorizado, quiero forzar un cambio de estado de mesa cuando exista una situación excepcional.

- HU-MES-11. Como personal de atención, quiero consultar si una mesa tiene una reservación próxima antes de asignarla.

- HU-MES-12. Como sistema, quiero impedir liberar una mesa mientras existan cuentas con saldo pendiente, salvo autorización especial.

### EP-02. Reservaciones y preórdenes — 25 historias

**Actores:** Cliente, atención y encargado.

**Qué hace:** Solicitar o registrar reserva por cualquier canal; consultar agenda diaria/semanal/mensual; asignar combinación de mesas; registrar decoración y solicitudes especiales; reservar con o sin preorden; distinguir llegada de hora objetivo de servicio; programar envío a cocina. Liberar el espacio tras tolerancia sin borrar la reserva. Validar cambios de comensales y preorden; el cliente pierde modificación directa al alcanzar la hora acordada, pero personal autorizado puede intervenir.

**Qué debe conservar la BD:** Reserva, cliente/contacto/canal, comensales, llegada, servicio objetivo, mesas asignadas, preorden, solicitudes especiales, decisiones e historial.

**Reglas y referencias:** RN-009–016, RN-042–043, RN-065–069, RN-080.

**Verificación pendiente antes del ERD:** Precisar duración de ocupación, solapamientos, cancelación, no presentación y vencimiento de preórdenes. Preorden completa no autoriza una hora posterior al último ingreso.

#### Desarrollo del caso de uso: Solicitar y atender una reservación

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Cliente o contacto, canal de origen, fecha, llegada prevista, hora objetivo de servicio, comensales, solicitudes especiales y preorden si aplica.

**Flujo completo:** Validar horario y restricciones; buscar capacidad; proponer mesas al personal; registrar reserva y condiciones informadas; asociar preorden; planificar preparación y envío a cocina; registrar llegada; si vence tolerancia, liberar espacio conservando el historial; permitir reasignación posterior sólo si hay capacidad.

**Responsabilidad del backend:** El cliente no elige directamente el área física. Llegada y servicio objetivo son horas diferentes. Una reserva sin preorden espera la carga del momento. Preorden obligatoria por horario no habilita reservas después del último ingreso. Cambios cercanos a la hora requieren revisar viabilidad; alcanzada la hora, el cliente no modifica directamente.

**Datos y vínculos que deben poder reconstruirse:** Número de reserva, cliente/contacto, canal, fechas/horas, comensales, condiciones, estado, mesas asignadas, preorden asociada, autor de cada decisión, llegada real, liberación de espacio y motivos.

**Errores, alternativas y decisiones:** Más comensales al llegar; retraso que supera 20 minutos configurados; cancelación con preparación iniciada; mesas simultáneamente solicitadas; cambio de preorden cerca del cierre. Política de cancelaciones y duración del espacio pendiente.

**Criterio de aceptación propuesto:** Una reserva tardía inválida debe proponer la última hora permitida. Vencer tolerancia elimina la asignación vigente, no la evidencia de la reserva.

#### Historias originales completas de EP-02

- HU-RES-01. Como cliente, quiero solicitar una reservación indicando fecha, hora y número de comensales.

- HU-RES-02. Como personal de atención, quiero registrar manualmente una reservación recibida por WhatsApp, Instagram, chat interno u otro canal.

- HU-RES-03. Como cliente, quiero reservar con varios días de anticipación.

- HU-RES-04. Como personal de atención, quiero consultar una agenda diaria, semanal y mensual de reservaciones.

- HU-RES-05. Como sistema, quiero sugerir una combinación de mesas según la cantidad de comensales.

- HU-RES-06. Como personal de atención, quiero modificar manualmente la asignación sugerida por el sistema.

- HU-RES-07. Como cliente, quiero realizar una preorden asociada a mi reservación.

- HU-RES-08. Como cliente, quiero reservar sin preorden, aceptando el tiempo de espera normal al llegar.

- HU-RES-09. Como sistema, quiero informar que una reservación sin preorden está sujeta a la carga de cocina al momento del servicio.

- HU-RES-10. Como sistema, quiero manejar una tolerancia configurable posterior a la hora acordada.

- HU-RES-11. Como sistema, quiero liberar las mesas reservadas al superar la tolerancia sin eliminar el registro de la reservación.

- HU-RES-12. Como personal de atención, quiero conservar una reservación retrasada para atender al cliente si posteriormente llega y existe disponibilidad.

- HU-RES-13. Como personal de atención, quiero registrar solicitudes especiales como decoración, cumpleaños o eventos.

- HU-RES-14. Como sistema, quiero mostrar la política aplicable a decoraciones cuando el cliente indique que desea decorar.

- HU-RES-15. Como personal de atención, quiero visualizar cuándo debe prepararse físicamente una mesa reservada.

- HU-RES-16. Como sistema, quiero impedir reservaciones posteriores al último horario válido de ingreso y proponer la última hora permitida.

- HU-RES-17. Como sistema, quiero exigir preorden completa cuando una reservación tardía se encuentre bajo reglas que así lo requieran.

- HU-RES-18. Como sistema, quiero evaluar carga, tamaño del pedido y tiempo restante antes de recomendar aceptar una reservación cercana al cierre.

- HU-RES-19. Como encargado, quiero aceptar o rechazar una reservación tardía basándome en la recomendación del sistema.

- HU-RES-20. Como reservante, quiero indicar una hora de llegada y una hora objetivo de servicio cuando sean distintas.

- HU-RES-21. Como personal de atención, quiero programar el envío de una preorden a cocina según la hora objetivo de servicio.

- HU-RES-22. Como cliente, quiero ser informado si llego con más personas de las reservadas y los pedidos adicionales tendrán un tiempo distinto.

- HU-RES-23. Como personal de atención, quiero modificar la cantidad de comensales cuando la capacidad real del restaurante lo permita.

- HU-RES-24. Como sistema, quiero restringir cambios de preorden cercanos a la hora reservada cuando ya no puedan completarse en el tiempo previsto.

- HU-RES-25. Como sistema, quiero impedir modificaciones directas del cliente una vez alcanzada la hora acordada, manteniendo la posibilidad de modificación por personal autorizado.

### EP-03. Pedidos, solicitudes y cambios — 21 historias

**Actores:** Cliente, atención y encargado.

**Qué hace:** Crear pedidos de local, recoger, delivery y preorden. Capturar productos, cantidades, extras válidos y notas; calcular ETA preliminar; aceptar solicitudes digitales después de revalidarlas. Registrar autor por operación y línea. Permitir ampliaciones con ETA propio. Antes de confirmar se edita el borrador; después de comandar se anula o reemplaza, conservando vínculo e historia. Pedidos fuera de menú requieren permiso.

**Qué debe conservar la BD:** Solicitud remota y decisión de aceptación, pedido, líneas, modificadores, precios y recetas históricos, canal, tipo de servicio, ETA, cambios, reemplazos y responsables.

**Reglas y referencias:** RN-039–045, RN-056–064, RN-075–076, RN-081, RN-088–111, RN-125–126.

**Verificación pendiente antes del ERD:** Decidir si solicitud es entidad independiente o parte del ciclo de orders. Definir espera, rechazo, expiración, consentimiento y cancelación. No convertir solicitudes en ventas por reconexión.

#### Desarrollo del caso de uso: Aceptar pedido y modificarlo con trazabilidad

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Tipo de servicio, canal, cliente/contacto cuando corresponda, mesa/reserva/dirección según modalidad, productos, cantidades, opciones, notas, horario solicitado y clave de operación.

**Flujo completo:** Validar estructura y permiso; resolver precios y opciones desde catálogo; calcular recursos/ETA; recibir solicitud o crear borrador; obtener aceptación; revalidar capacidad y reservar recursos dentro de transacción; confirmar; enviar a áreas; conservar cambios posteriores como operaciones identificadas; completar o cancelar según preparación y entrega.

**Responsabilidad del backend:** El backend calcula importes: no acepta como verdad los totales del navegador. Confirmar requiere recursos materiales y capacidad operativa. Un borrador se edita; una línea comandada se anula/reemplaza sin borrarse. Cada ampliación puede tener ETA independiente. Idempotencia de creación y modificación se distingue del control de versión.

**Datos y vínculos que deben poder reconstruirse:** Pedido y referencia a solicitud si se separa; tipo, canal, cliente, destino, estado operativo, tiempos y actores. Líneas con cantidad, nombre/precio históricos, receta/version, modificadores, notas, estado, referencia a reemplazo y motivo. Historial de aceptación y cambios.

**Errores, alternativas y decisiones:** Producto agotado al confirmar; precio cambió desde carrito; pedido extraordinario; solicitud pendiente al volver Internet; edición concurrente; cancelación después de preparación. Debe acordarse vigencia de cotización y aceptación del cliente ante precio/ETA nuevo.

**Criterio de aceptación propuesto:** Reintentar la misma aceptación produce un solo pedido. Una edición obsoleta se rechaza o resuelve explícitamente, nunca borra la edición de otro empleado.

#### Historias originales completas de EP-03

- HU-PED-01. Como personal de atención, quiero crear pedidos para consumo en local, recoger, domicilio o preorden de reservación.

- HU-PED-02. Como personal de atención, quiero agregar platillos, cantidades, extras, modificadores y observaciones.

- HU-PED-03. Como cliente, quiero realizar un pedido desde los canales digitales habilitados.

- HU-PED-04. Como sistema, quiero diferenciar el tipo de pedido y aplicar reglas específicas según local, recoger, delivery o reservación.

- HU-PED-05. Como personal autorizado, quiero editar un pedido antes o después de comandarlo cuando la operación real lo permita.

- HU-PED-06. Como sistema, quiero conservar el historial completo de modificaciones.

- HU-PED-07. Como sistema, quiero registrar fecha y hora de creación, confirmación, cambios y cierre del pedido.

- HU-PED-08. Como personal de atención, quiero saber quién creó inicialmente el pedido.

- HU-PED-09. Como sistema, quiero registrar quién añadió o modificó cada elemento del pedido.

- HU-PED-10. Como personal de atención, quiero conocer un ETA preliminar antes de confirmar el pedido al cliente.

- HU-PED-11. Como personal autorizado, quiero anular uno o más artículos sin borrarlos del historial.

- HU-PED-12. Como personal autorizado, quiero reemplazar un artículo por otro mediante una operación de cambio.

- HU-PED-13. Como sistema, quiero relacionar el artículo reemplazado con el artículo nuevo.

- HU-PED-14. Como personal autorizado, quiero elegir entre emitir una actualización parcial de comanda o una comanda completa actualizada.

- HU-PED-15. Como cocina/barra, quiero identificar claramente cuál revisión de una comanda es la vigente.

- HU-PED-16. Como personal autorizado, quiero indicar si una anulación generó merma, cortesía, consumo interno o cargo al personal.

- HU-PED-17. Como personal de atención, quiero agregar una ampliación posterior al pedido sin reiniciar el tiempo estimado de los artículos anteriores.

- HU-PED-18. Como sistema, quiero calcular ETA independiente para ampliaciones o nuevas cuentas agregadas posteriormente.

- HU-PED-19. Como sistema, quiero permitir pedidos especiales solo a usuarios autorizados.

- HU-PED-20. Como personal autorizado, quiero registrar una excepción especial sin modificar el menú oficial.

- HU-PED-21. Como sistema, quiero impedir que una corrección posterior sobrescriba silenciosamente cambios realizados por otro usuario.

### EP-04. Comandas por área e impresión — 10 historias

**Actores:** Cocina sushi, cocina caliente, barra y atención.

**Qué hace:** Separar un pedido por áreas de preparación. Enviar cambios parciales sólo a áreas afectadas o una revisión completa que sustituya la anterior. Si el cambio cruza áreas, cancelar en origen y añadir en destino. Reimprimir el mismo documento con identificación visible; un fallo de impresora no revierte un pedido confirmado ni impide usar KDS.

**Qué debe conservar la BD:** Área, comanda, líneas, revisión vigente, documento sustituido, trabajo de impresión, intentos, destino, resultado y reimpresiones.

**Reglas y referencias:** RN-059–062, RN-071–073, RN-127–130; RT-012–015, RT-048–053.

**Verificación pendiente antes del ERD:** Faltan contratos explícitos de revisiones y trabajos/intentos de impresión en el modelo recuperado. Elegir cuándo y cómo se genera cada revisión.

#### Desarrollo del caso de uso: Distribuir, revisar y reimprimir comandas

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Pedido confirmado o modificación autorizada, áreas afectadas, selección de actualización parcial/completa y destino de impresión.

**Flujo completo:** Clasificar líneas por área; construir comanda con revisión identificable; persistir documento/evento; actualizar KDS; encolar impresión por destino; registrar cada intento y resultado; permitir reimpresión explícita del mismo documento. Una revisión completa señala qué versión sustituye.

**Responsabilidad del backend:** Cambiar un producto a otra área exige anulación en origen y adición en destino. La actualización parcial sólo afecta las áreas pertinentes. El registro del pedido se confirma independientemente de disponibilidad de impresora. Una copia debe poder reconocerse como reimpresión.

**Datos y vínculos que deben poder reconstruirse:** Comanda, área, pedido, revisión, tipo de actualización, referencia sustituida, líneas y contenido emitido. Trabajo de impresión con ID, documento, destino, estado, fecha; intentos con resultado/error; usuario/motivo de reimpresión.

**Errores, alternativas y decisiones:** Timeout después de que la impresora pudo imprimir; impresora desconectada; revisión llega antes que otra; petición repetida por red. Precisar deduplicación y política ante resultado incierto; no prometer impresión física exactamente una vez sin soporte del dispositivo.

**Criterio de aceptación propuesto:** Fallar impresión deja pedido disponible en KDS. La revisión vigente y las copias anteriores son distinguibles, sin duplicar consumos.

#### Historias originales completas de EP-04

- HU-CMD-01. Como sistema, quiero asociar cada producto del menú a un área de preparación o despacho.

- HU-CMD-02. Como cocina sushi, quiero recibir únicamente los artículos que corresponden a mi área.

- HU-CMD-03. Como cocina caliente, quiero recibir únicamente los artículos que corresponden a mi área.

- HU-CMD-04. Como barra, quiero recibir únicamente las bebidas y productos asignados a barra.

- HU-CMD-05. Como sistema, quiero dividir automáticamente un pedido en comandas por área.

- HU-CMD-06. Como sistema, quiero generar una anulación al área original y una adición al área nueva cuando un cambio cruza áreas.

- HU-CMD-07. Como sistema, quiero permitir que una modificación dentro de la misma área se muestre como cambio en una sola comanda.

- HU-CMD-08. Como personal, quiero reimprimir una comanda sin crear un pedido nuevo.

- HU-CMD-09. Como cocina/barra, quiero identificar una reimpresión para no preparar el pedido dos veces.

- HU-CMD-10. Como sistema, quiero mantener separado el procesamiento del pedido del trabajo de impresión.

### EP-05. Delivery y logística externa — 19 historias

**Actores:** Cliente, atención, encargado y repartidor externo.

**Qué hace:** Validar datos de entrega; registrar depósito/comprobante o autorización de pago contra entrega; evaluar carga y horario; coordinar pedido listo y llegada del repartidor; marcar llegada y entrega al transportista. Comunicar sólo datos necesarios. Registrar espera, ausencia, reprogramación o cancelación y devolución autorizada. Diferenciar preparación de traslado externo.

**Qué debe conservar la BD:** Entrega, dirección y contacto históricos, proveedor/repartidor, pedido, horas previstas/reales, estados, costo externo, autorización y referencias de cobro/reembolso.

**Reglas y referencias:** RN-006–007, RN-017–020, RN-138; HU-DEL-01–19.

**Verificación pendiente antes del ERD:** Definir datos mínimos, medio contra entrega, quién cobra cada importe y hasta dónde se confirma el recorrido. No prometer GPS ni tiempo de traslado garantizado.

#### Desarrollo del caso de uso: Coordinar pedido a domicilio

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Pedido, destinatario, teléfono, dirección/referencias, costo de envío, pago previsto, comprobante permitido y proveedor externo.

**Flujo completo:** Comprobar datos y restricciones; autorizar anticipo o contra entrega; evaluar preparación y horario; aceptar pedido; coordinar hora de recogida; registrar llegada/espera del repartidor; entregar y conservar evidencia operativa; gestionar ausencia, reprogramación o devolución autorizada.

**Responsabilidad del backend:** No confundir hora de pedido listo con hora de llegada al domicilio. Separar importe restaurante y servicio externo. Compartir sólo datos necesarios. Cambiar dirección de perfil no cambia automáticamente la dirección de una entrega ya pactada.

**Datos y vínculos que deben poder reconstruirse:** Entrega ligada al pedido; snapshot de destino/contacto, proveedor, estado, horas previstas/reales, importe externo, responsable de cobro, autorización contra entrega e historial de incidencias.

**Errores, alternativas y decisiones:** Repartidor no llega; llega temprano; cliente cambia dirección; entrega no puede completarse; comprobante aún no validado. Definir responsabilidad y condición de devolución sin deducirla sólo del estado logístico.

**Criterio de aceptación propuesto:** El cierre muestra venta del restaurante separada del envío cobrado por tercero. Entregar al repartidor no marca por sí mismo un pago como recibido.

#### Historias originales completas de EP-05

- HU-DEL-01. Como personal de atención, quiero registrar mediante formulario los datos requeridos para un pedido a domicilio.

- HU-DEL-02. Como sistema, quiero validar que los datos mínimos del delivery estén completos.

- HU-DEL-03. Como personal de atención, quiero registrar comprobantes de depósito asociados al pedido.

- HU-DEL-04. Como personal autorizado, quiero registrar cuando un pedido esté autorizado para pago contra entrega.

- HU-DEL-05. Como sistema, quiero evaluar carga de trabajo y ETA antes de confirmar un pedido cercano al cierre del delivery.

- HU-DEL-06. Como personal de atención, quiero registrar la hora estimada en que el pedido estará listo para solicitar repartidor.

- HU-DEL-07. Como personal de atención, quiero registrar la hora estimada de llegada del repartidor.

- HU-DEL-08. Como cocina, quiero visualizar la hora objetivo vinculada al repartidor cuando sea relevante.

- HU-DEL-09. Como personal de atención, quiero compartir con el servicio externo solo los datos necesarios del pedido.

- HU-DEL-10. Como personal de atención, quiero marcar cuando el repartidor haya llegado.

- HU-DEL-11. Como personal de atención, quiero marcar cuando el pedido haya sido entregado al repartidor.

- HU-DEL-12. Como cliente, quiero conocer el estado del pedido antes de ser entregado al repartidor.

- HU-DEL-13. Como sistema, quiero diferenciar tiempo de preparación del restaurante y tiempo de traslado externo.

- HU-DEL-14. Como cliente, quiero recibir una aclaración de que el tiempo de traslado depende de factores externos.

- HU-DEL-15. Como sistema, quiero mantener el costo de delivery separado del ingreso del restaurante.

- HU-DEL-16. Como sistema, quiero informar al repartidor cuando el pedido sea contra entrega y el monto que debe cobrarse.

- HU-DEL-17. Como personal, quiero registrar si el repartidor llega antes y debe esperar.

- HU-DEL-18. Como personal, quiero cancelar o reprogramar un delivery cuando el repartidor no llegue.

- HU-DEL-19. Como sistema, quiero permitir devolución del importe del restaurante si una entrega no puede completarse según autorización del encargado.

### EP-06. Comunicación y atención — 17 historias

**Actores:** Cliente, agentes de atención e IA asistida.

**Qué hace:** Centralizar bandeja de WhatsApp, Instagram y chat interno sin fusionar conversaciones. Vincular canales a perfil sólo con identidad confirmada. Gestionar plantillas por canal, asignación, intervención humana, resumen e historial cronológico. Comunicar cambios de pedidos/reservas. Aceptar texto y únicamente comprobantes permitidos; rechazar contenido restante conservando metadatos mínimos.

**Qué debe conservar la BD:** Conversación, canal, identidad verificada, mensajes, asignaciones, plantillas, vínculos a operaciones y metadatos de adjuntos permitidos.

**Reglas y referencias:** RN-030–036; RT-023–025, RT-038–041, RT-070.

**Verificación pendiente antes del ERD:** Acordar integraciones efectivas frente a demostración, política de adjuntos/retención, verificación de identidad y entregas/reintentos de mensajes.

#### Desarrollo del caso de uso: Atender conversación multicanal

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Canal, identificador externo de conversación/mensaje, remitente, texto o comprobante permitido, relación verificada con cliente si existe.

**Flujo completo:** Recibir y deduplicar mensaje; identificar conversación del canal; aplicar política de contenido; guardar texto/metadatos permitidos; asignar agente o asistencia; responder por el mismo canal; vincular operaciones relevantes; registrar entrega y transferencia a humano con resumen.

**Responsabilidad del backend:** No fusionar conversaciones de WhatsApp, Instagram y chat. Una coincidencia de nombre no verifica identidad. Las plantillas pueden variar por canal. Adjuntos prohibidos no se conservan permanentemente. Tomar control humano debe impedir respuestas automáticas conflictivas.

**Datos y vínculos que deben poder reconstruirse:** Conversación, canal, identidad externa, cliente verificado opcional, mensajes, dirección entrante/saliente, identificadores de proveedor, timestamps, asignaciones, plantilla usada, vínculos y estado de envío propuesto.

**Errores, alternativas y decisiones:** Mensaje duplicado; integración caída; cliente no identificado; archivo no permitido; dos agentes responden; humano toma control mientras IA está procesando. Acordar orden y deduplicación de respuestas.

**Criterio de aceptación propuesto:** Dos clientes simultáneos nunca reciben contexto cruzado. Caída de WhatsApp no impide crear pedidos presenciales.

#### Historias originales completas de EP-06

- HU-COM-01. Como personal de atención, quiero consultar conversaciones de WhatsApp, Instagram y chat interno desde una interfaz centralizada.

- HU-COM-02. Como sistema, quiero mantener cada canal como conversación independiente.

- HU-COM-03. Como sistema, quiero asociar diferentes canales a un mismo cliente solo cuando la identidad esté confirmada.

- HU-COM-04. Como cliente, quiero elegir el canal por el que deseo comunicarme.

- HU-COM-05. Como cliente, quiero solicitar rápidamente menú, horario y ubicación.

- HU-COM-06. Como personal autorizado, quiero crear, editar y desactivar respuestas predefinidas.

- HU-COM-07. Como sistema, quiero seleccionar plantillas distintas según canal.

- HU-COM-08. Como personal, quiero tomar control manual de una conversación atendida inicialmente por IA.

- HU-COM-09. Como personal, quiero recibir un resumen breve del contexto antes de asumir una conversación.

- HU-COM-10. Como IA, quiero proponer una respuesta o solución que el personal pueda aceptar, editar o rechazar.

- HU-COM-11. Como sistema, quiero identificar conversaciones que requieren intervención humana.

- HU-COM-12. Como cliente, quiero recibir actualizaciones importantes del pedido o reservación.

- HU-COM-13. Como sistema, quiero aceptar texto como medio normal para toma de pedidos.

- HU-COM-14. Como sistema, quiero aceptar imágenes únicamente cuando sean comprobantes permitidos.

- HU-COM-15. Como sistema, quiero rechazar o eliminar contenido no permitido manteniendo únicamente metadatos mínimos de auditoría.

- HU-COM-16. Como sistema, quiero mantener historial cronológico amplio de conversaciones.

- HU-COM-17. Como sistema, quiero usar el nombre del cliente en saludos cuando su identidad esté confirmada.

### EP-07. Clientes, historial y restricciones — 15 historias

**Actores:** Cliente y personal autorizado.

**Qué hace:** Registro público con privilegios de Cliente; historial de pedidos y reservas; preferencias explícitas y atención a frecuentes. Registrar incidencias y restricciones por servicio: anticipo obligatorio, sin delivery, reservas o mensajería, o bloqueo total. Eliminar cuenta revoca acceso y sesiones conservando sólo el histórico definido por política. Nueva cuenta tras eliminación inicia perfil funcional nuevo; suspensión se maneja por separado.

**Qué debe conservar la BD:** Identidad, perfil, direcciones, preferencias, incidencias, restricciones con vigencia/autor, estado de cuenta y sesiones revocadas.

**Reglas y referencias:** RN-037–038, RN-113–116; RT-034, RT-066–070.

**Verificación pendiente antes del ERD:** Resolver reutilización de correo e identidad archivada; no restaurar historial visible por coincidencia de correo. Acordar compra invitada y datos mínimos: no están resueltos aquí.

#### Desarrollo del caso de uso: Gestionar identidad y restricciones del cliente

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Datos de registro/perfil, contacto verificable según política, preferencias expresas, solicitud de eliminación o incidencia autorizada.

**Flujo completo:** Crear identidad con rol Cliente; gestionar sesión y perfil; mostrar sólo historial propio; registrar incidencias internas; aplicar restricciones por capacidad; comprobarlas al solicitar servicio; al eliminar, revocar sesiones y archivar según política; al recrear, iniciar perfil nuevo y evaluar restricciones internas autorizadas.

**Responsabilidad del backend:** Restricción de delivery no implica necesariamente prohibición de reservas. Estado de acceso y restricción comercial son dimensiones distintas. No mostrar observaciones internas al cliente. Las políticas de retención y recuperación deben ser explícitas.

**Datos y vínculos que deben poder reconstruirse:** Usuario, perfil, estado, contactos/verificaciones, direcciones, preferencias, sesiones, incidentes y restricciones con servicio, vigencia, motivo, autor y retiro. Referencias históricas que sobrevivan a cierre autorizado.

**Errores, alternativas y decisiones:** Correo de cuenta archivada reutilizado; identidad suspendida recreada; solicitud de eliminación con pedido pendiente; canal externo vinculado erróneamente. Resolver sin borrar registros económicos ni divulgar información ajena.

**Criterio de aceptación propuesto:** Una sesión previa deja de funcionar tras eliminación. Crear cuenta nueva no restaura automáticamente preferencias e historial visible antiguo.

#### Historias originales completas de EP-07

- HU-CLI-01. Como cliente, quiero crear una cuenta para acceder a funciones digitales.

- HU-CLI-02. Como sistema, quiero asignar automáticamente el rol Cliente a todo registro público.

- HU-CLI-03. Como sistema, quiero mantener historial de pedidos de clientes identificados.

- HU-CLI-04. Como sistema, quiero mantener historial de reservaciones.

- HU-CLI-05. Como sistema, quiero registrar preferencias explícitas del cliente.

- HU-CLI-06. Como sistema, quiero reconocer clientes frecuentes para personalizar la atención.

- HU-CLI-07. Como personal autorizado, quiero registrar incidencias relevantes de servicio.

- HU-CLI-08. Como administrador, quiero aplicar restricciones específicas a un cliente.

- HU-CLI-09. Como sistema, quiero soportar restricciones como solo pago anticipado, no delivery, no reservaciones, no mensajería o bloqueo total.

- HU-CLI-10. Como sistema, quiero registrar quién creó, modificó o retiró una restricción.

- HU-CLI-11. Como cliente, quiero eliminar mi cuenta y perder acceso al sistema.

- HU-CLI-12. Como sistema, quiero conservar internamente el histórico de una cuenta eliminada según las políticas definidas.

- HU-CLI-13. Como sistema, quiero tratar una cuenta nueva posterior a una eliminación voluntaria como un perfil funcional nuevo.

- HU-CLI-14. Como sistema, quiero diferenciar claramente cuenta eliminada y cuenta suspendida.

- HU-CLI-15. Como sistema, quiero alertar cuando una nueva cuenta se relacione con una identidad previamente suspendida.

### EP-08. Usuarios, roles y permisos — 10 historias

**Actores:** Administrador y todos los usuarios autenticados.

**Qué hace:** Crear usuarios operativos, activar/suspender/desactivar, crear roles y asignar permisos independientes. Un usuario puede tener varios roles; sus capacidades efectivas se calculan en backend. Separar facultades de cierre, anulación, descuentos, override y asignación de roles. Auditar operaciones sensibles.

**Qué debe conservar la BD:** Usuario, credenciales protegidas, roles, permisos, asociaciones, sesiones y eventos de seguridad.

**Reglas y referencias:** RN-025–026; RT-033–035, RT-042–043, RT-055–056.

**Verificación pendiente antes del ERD:** Cerrar matriz permiso × acción × recurso y acceso a datos propios. Recuperación/verificación de cuenta y límites de sesión requieren contrato, no sólo pantallas.

#### Desarrollo del caso de uso: Administrar privilegios y autorizar operaciones

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Usuario objetivo, roles/permisos solicitados, actor administrativo y estado deseado.

**Flujo completo:** Autenticar actor; comprobar permiso de administración; crear/editar usuario o rol; actualizar asignaciones; recalcular capacidades efectivas; registrar auditoría; aplicar cambios de acceso a solicitudes posteriores conforme a política de sesiones.

**Responsabilidad del backend:** La UI no concede permisos. El registro público no puede incluir roles operativos aceptables por backend. Validar tanto acción como objeto: poder consultar pedidos no implica leer todos los clientes desde cualquier contexto.

**Datos y vínculos que deben poder reconstruirse:** Usuarios, credenciales, roles, permisos, asignaciones, sesiones, cambios y eventos de seguridad. Definir si asignaciones requieren vigencia e historial además de estado actual.

**Errores, alternativas y decisiones:** Usuario suspendido con sesión activa; permiso retirado durante operación; cambio que elimina el último administrador; escalamiento de privilegios por campos manipulados. Último administrador es política propuesta a validar.

**Criterio de aceptación propuesto:** Invocar directamente una API sensible sin permiso se rechaza aunque el botón esté oculto o el cliente altere la petición.

#### Historias originales completas de EP-08

- HU-USR-01. Como administrador, quiero crear usuarios operativos.

- HU-USR-02. Como administrador, quiero asignar uno o varios roles a un usuario.

- HU-USR-03. Como administrador, quiero crear y editar roles.

- HU-USR-04. Como administrador, quiero asociar permisos a cada rol.

- HU-USR-05. Como sistema, quiero calcular permisos efectivos a partir de todos los roles asignados.

- HU-USR-06. Como administrador, quiero activar, suspender o desactivar usuarios operativos.

- HU-USR-07. Como sistema, quiero impedir que un usuario público se autoasigne roles operativos.

- HU-USR-08. Como administrador, quiero consultar los permisos efectivos de cada usuario.

- HU-USR-09. Como sistema, quiero auditar operaciones delicadas realizadas por usuarios con permisos.

- HU-USR-10. Como administrador, quiero conceder permisos granulares como cerrar servicio, suspender online, anular artículos o hacer override de disponibilidad.

### EP-09. Personal, horarios y turnos — 8 historias

**Actores:** Administrador y encargado.

**Qué hace:** Registrar horarios base, cambios por fecha, turnos extraordinarios, auxiliares, ausencias, tardanzas y salidas relevantes. Distinguir personal previsto del disponible realmente y usar disponibilidad en carga/ETA. Conservar historial.

**Qué debe conservar la BD:** Perfil de empleado, horarios, excepciones, disponibilidad y registros de asistencia pertinentes.

**Reglas y referencias:** RN-027–028; HU-PER-01–08.

**Verificación pendiente antes del ERD:** Precisar cómo se registra asistencia real. Estas historias no equivalen a un módulo completo de nómina.

#### Desarrollo del caso de uso: Calcular personal disponible

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Empleado, horario base, fecha, excepción de turno, asistencia relevante y área/capacidad si se acuerda.

**Flujo completo:** Consultar horario base; aplicar excepciones por fecha; registrar ausencia o ajuste real; derivar personal disponible en período; comunicar cambio al cálculo de carga; conservar quién alteró el turno.

**Responsabilidad del backend:** Programado no es igual a presente. Un auxiliar sólo aumenta capacidad cuando la política de disponibilidad lo considera. Cambios históricos no deben reescribir tiempos reales de pedidos atendidos.

**Datos y vínculos que deben poder reconstruirse:** Empleado, horario recurrente, intervalos, excepciones, motivo, disponibilidad efectiva y registro de asistencia necesario. Alcance de fichaje formal pendiente.

**Errores, alternativas y decisiones:** Turno cruza fecha; ausencia durante servicio; solapamiento de horarios; salida anticipada; cambio retroactivo. Definir zona horaria e intervalos para cálculos reproducibles.

**Criterio de aceptación propuesto:** Una ausencia reduce la capacidad considerada y provoca reestimación cuando corresponda, sin eliminar el turno previsto del historial.

#### Historias originales completas de EP-09

- HU-PER-01. Como administrador, quiero registrar el horario base habitual de cada trabajador.

- HU-PER-02. Como administrador, quiero registrar turnos extraordinarios o cambios por fecha.

- HU-PER-03. Como encargado, quiero indicar cuándo un auxiliar asistirá a un turno.

- HU-PER-04. Como encargado, quiero registrar ausencias, llegadas tardías o salidas anticipadas cuando sea relevante.

- HU-PER-05. Como sistema, quiero conocer qué personal está previsto y disponible en un período.

- HU-PER-06. Como sistema, quiero considerar disponibilidad de personal en el cálculo de carga.

- HU-PER-07. Como administrador, quiero consultar el historial de turnos y cambios.

- HU-PER-08. Como sistema, quiero diferenciar horario previsto de control de asistencia real.

### EP-10. Menú y modificadores — 16 historias

**Actores:** Administrador, cliente y personal.

**Qué hace:** Gestionar categorías, platillos, fotos, descripciones, precios y área. Configurar grupos de extras obligatorios/opcionales con mínimos y máximos; modificadores pueden cambiar precio, receta, recursos y tiempo. Mostrar disponibilidad simplificada al cliente y aproximada al personal. Suspender/reactivar productos con permiso. Configurar restricción de edad cuando aplique y recomendaciones/prioridad visual sin cambiar precios automáticamente.

**Qué debe conservar la BD:** Categorías, productos, imágenes referenciadas, precios, áreas, grupos/opciones, reglas de selección e impactos de modificadores.

**Reglas y referencias:** RN-070–074, RN-119–124, RN-144–145.

**Verificación pendiente antes del ERD:** Definir vigencia de precios, comprobación de edad, límites de modificadores y si se ocultan agotados. Congelar lo vendido para no alterar pedidos históricos al editar menú.

#### Desarrollo del caso de uso: Configurar producto vendible

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Categoría, nombre, descripción, imagen, precio, área, receta si aplica, grupos de opciones, restricciones y prioridad visual.

**Flujo completo:** Crear o modificar catálogo con permiso; validar opciones y dependencias; publicar; exponer disponibilidad según canal; al seleccionar, validar mínimos/máximos y compatibilidad; resolver efectos de extras; conservar versión comercial utilizada por la venta.

**Responsabilidad del backend:** No aceptar extras ajenos al producto. Una opción puede modificar varios recursos, precio y tiempo. La desactivación manual domina la disponibilidad calculada. Recomendación o popularidad no cambia precio ni crea descuentos.

**Datos y vínculos que deben poder reconstruirse:** Producto, categoría, recursos de imagen, precio vigente, área, grupos/opciones, selección mínima/máxima, obligatoriedad e impactos. Snapshot de nombre/precio/opciones pertenece a la operación histórica.

**Errores, alternativas y decisiones:** Extra agotado pero producto base disponible; grupo obligatorio sin opciones vendibles; cambio de precio con carrito abierto; producto retirado con pedido activo. Definir comportamiento publicado sin alterar operaciones ya pactadas.

**Criterio de aceptación propuesto:** El backend rechaza una combinación manipulada y recalcula su precio. Editar catálogo no modifica el importe de un pedido histórico.

#### Historias originales completas de EP-10

- HU-MEN-01. Como administrador, quiero crear y editar categorías del menú.

- HU-MEN-02. Como administrador, quiero crear y editar platillos.

- HU-MEN-03. Como administrador, quiero asociar fotografías a los platillos.

- HU-MEN-04. Como administrador, quiero definir precio, descripción, categoría y área de preparación.

- HU-MEN-05. Como administrador, quiero crear grupos de modificadores y extras.

- HU-MEN-06. Como administrador, quiero definir opciones obligatorias u opcionales con mínimos y máximos.

- HU-MEN-07. Como sistema, quiero limitar los extras visibles a los configurados para cada producto.

- HU-MEN-08. Como sistema, quiero permitir que un modificador afecte precio, receta, disponibilidad y tiempo.

- HU-MEN-09. Como cliente, quiero ver únicamente los platillos disponibles según la política de visualización.

- HU-MEN-10. Como cliente, quiero consultar fotografías, precio y descripción.

- HU-MEN-11. Como personal operativo, quiero visualizar disponibilidad aproximada directamente en cada categoría.

- HU-MEN-12. Como personal autorizado, quiero marcar manualmente un producto como no disponible.

- HU-MEN-13. Como personal autorizado, quiero reactivar un producto previamente suspendido.

- HU-MEN-14. Como administrador, quiero definir productos con restricción de edad cuando aplique.

- HU-MEN-15. Como sistema, quiero mostrar productos más pedidos o recomendados sin crear promociones automáticas.

- HU-MEN-16. Como administrador, quiero poder priorizar visualmente determinados productos sin alterar su precio.

### EP-11. Recetas y versiones — 8 historias

**Actores:** Administrador y cocina.

**Qué hace:** Crear recetas de platillos y producciones; incorporar ingredientes y otras preparaciones; definir unidades, rendimientos y merma esperada. Versionar y conservar versión usada en cada operación. Nuevas operaciones utilizan la vigente. Resolver dependencias para producir desde cero.

**Qué debe conservar la BD:** Receta, versiones, componentes, cantidades, unidades, rendimientos, vigencia y referencias históricas.

**Reglas y referencias:** RN-087; RT-029–030, RT-045.

**Verificación pendiente antes del ERD:** Definir conversiones y prohibir ciclos en dependencias. Distinguir preparación almacenada de descomposición a insumos para no descontar ambos.

#### Desarrollo del caso de uso: Versionar receta y resolver componentes

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Receta de platillo/preparación, componentes, cantidades, unidad, rendimiento, merma esperada y vigencia.

**Flujo completo:** Crear versión; validar componentes/unidades; detectar ciclos; establecer vigencia; usar versión vigente en operaciones nuevas; conservar referencia exacta en producción/pedido; resolver recursos según existencias de preparaciones y elaboración necesaria.

**Responsabilidad del backend:** Una receta no puede depender indirectamente de sí misma. Las conversiones deben ser compatibles. Consumir preparación existente y descontar nuevamente todos sus ingredientes produciría doble consumo. Versiones usadas no se modifican retroactivamente sin un mecanismo histórico explícito.

**Datos y vínculos que deben poder reconstruirse:** Receta, versión, fechas/estado, salida/rendimiento, componentes con cantidad/unidad y referencia a artículo o preparación. Decidir cómo se fija la versión de las subrecetas.

**Errores, alternativas y decisiones:** Receta sin versión vigente; conversión desconocida; rendimiento cero; dependencia circular; nueva versión durante producción. Acordar redondeo y tolerancias.

**Criterio de aceptación propuesto:** Un pedido de ayer conserva su versión aunque hoy cambie la receta. Un ciclo se detecta antes de activar la configuración.

#### Historias originales completas de EP-11

- HU-REC-01. Como administrador, quiero crear recetas para platillos y producciones.

- HU-REC-02. Como administrador, quiero permitir que una receta use materias primas, producciones u otras preparaciones.

- HU-REC-03. Como sistema, quiero admitir estructuras recursivas tipo BOM para preparaciones compuestas.

- HU-REC-04. Como administrador, quiero versionar recetas.

- HU-REC-05. Como sistema, quiero conservar la versión de receta usada históricamente en pedidos y producciones.

- HU-REC-06. Como sistema, quiero utilizar únicamente la versión vigente para nuevas operaciones.

- HU-REC-07. Como administrador, quiero indicar rendimientos, unidades y mermas estimadas.

- HU-REC-08. Como sistema, quiero detectar dependencias de producción necesarias para fabricar un platillo desde cero.

### EP-12. Inventario, lotes y empaques — 16 historias

**Actores:** Inventario, cocina, empaque y encargado.

**Qué hace:** Registrar entradas, salidas, transferencias si se habilitan ubicaciones, responsables, mínimos/objetivos/máximos, conteos y ajustes. Distinguir físico, reservado y disponible. Manejar lotes, caducidad y sugerencia FEFO. Clasificar materia prima, producción, producto comercial, empaque y consumibles. Asociar empaque estándar y registrar consumo real; gestionar merma, daño, cortesía e interno con motivos. Las tolerancias estimadas no alteran el físico.

**Qué debe conservar la BD:** Artículos, tipos, unidades/presentaciones, ubicaciones, lotes, saldos, movimientos, reservas, umbrales y referencias de origen.

**Reglas y referencias:** RN-029, RN-086, RN-089–095; RT-062–065; HU-INV-01–16.

**Verificación pendiente antes del ERD:** Definir momento exacto de reserva/consumo/empaque, caducados, devoluciones físicas y fracciones. Anular un cobro no devuelve ingredientes consumidos.

#### Desarrollo del caso de uso: Registrar recursos y conciliar existencias

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Artículo, lote/ubicación cuando aplica, cantidad/unidad, tipo de movimiento, origen, responsable y motivo.

**Flujo completo:** Validar operación y conversión; verificar lote/saldo; bloquear recursos necesarios; registrar movimiento y actualizar saldo coherentemente; reservar para confirmaciones; consumir al evento acordado; liberar reservas no consumidas; registrar conteos y diferencias autorizadas.

**Responsabilidad del backend:** El libro de movimientos debe explicar el saldo. Caducidad y FEFO afectan lotes elegibles según política. Reservado no es vendido ni físicamente consumido. No compensar faltantes alterando silenciosamente consumos históricos. Ajustes requieren responsable.

**Datos y vínculos que deben poder reconstruirse:** Catálogo de artículos, unidades/presentaciones, lotes, ubicación, movimientos, saldos, reservas, conteos y ajustes; cantidades reales de empaque y motivos de diferencia.

**Errores, alternativas y decisiones:** Lote vence con reserva vigente; consumo mayor al estándar; conteo durante venta; faltante físico; traslado parcial; reserva cancelada tras consumo parcial. Precisar reglas de asignación y actualización concurrente.

**Criterio de aceptación propuesto:** El saldo concilia con movimientos y reservas vigentes. Anular un cobro no genera una entrada ficticia de inventario.

#### Historias originales completas de EP-12

- HU-INV-01. Como personal autorizado, quiero registrar entradas y salidas de inventario.

- HU-INV-02. Como sistema, quiero registrar quién ingresó, recibió o ajustó una existencia.

- HU-INV-03. Como administrador, quiero definir stock mínimo, objetivo, máximo y actual.

- HU-INV-04. Como sistema, quiero diferenciar stock físico, reservado y disponible.

- HU-INV-05. Como sistema, quiero reservar recursos al confirmar pedidos para evitar sobreventa.

- HU-INV-06. Como sistema, quiero liberar reservas cuando un pedido cancelado no haya consumido los recursos.

- HU-INV-07. Como sistema, quiero mantener consumidos los recursos ya usados aunque el artículo se anule económicamente.

- HU-INV-08. Como personal autorizado, quiero realizar conteos físicos y registrar ajustes.

- HU-INV-09. Como sistema, quiero administrar lotes y fechas de caducidad.

- HU-INV-10. Como sistema, quiero sugerir consumo FEFO para productos perecederos.

- HU-INV-11. Como administrador, quiero clasificar materias primas, productos comerciales, empaques, consumibles y otros tipos.

- HU-INV-12. Como sistema, quiero asociar empaques estándar a productos o tipos de pedido.

- HU-INV-13. Como personal de empaque, quiero corregir la cantidad real de empaques/consumibles utilizados.

- HU-INV-14. Como sistema, quiero descontar empaques al momento operativo definido para evitar descontarlos prematuramente.

- HU-INV-15. Como personal autorizado, quiero registrar merma, daño, consumo interno, cortesía o ajuste.

- HU-INV-16. Como sistema, quiero manejar tolerancias de consumo esperadas para insumos baratos sin alterar el stock físico registrado.

### EP-13. Compras y proveedores — 15 historias

**Actores:** Encargado, comprador y receptor.

**Qué hace:** Proponer lista de compras por fecha, editarla y registrar solicitado/comprado/pendiente. Comprar parcial o desde varios proveedores; distinguir compra y recepción. Registrar quién compra, recibe e ingresa; gestionar contactos, preferencia, precios históricos e incidencias. Sugerencia de proveedor nunca compra automática.

**Qué debe conservar la BD:** Proveedor, artículos/precios por proveedor, lista u orden de compra, líneas, cantidades, recepción parcial, responsables e incidencias.

**Reglas y referencias:** RN-083–084, RN-139–142.

**Verificación pendiente antes del ERD:** Verificar representación de incidencias de proveedor y recepción fraccionada. Acordar faltantes, devoluciones y precios desconocidos sin ampliar a contabilidad de proveedores automáticamente.

#### Desarrollo del caso de uso: Comprar y recibir parcialmente

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Lista por fecha, artículos y cantidades requeridas, proveedor real de cada parte, precio conocido, comprador y receptor.

**Flujo completo:** Generar sugerencia editable; aprobar lista; registrar compras parciales; conservar pendientes; recibir por artículo/proveedor/lote; registrar cantidad real y responsable; ingresar inventario mediante operación ligada a recepción; cerrar cuando proceda.

**Responsabilidad del backend:** Cantidad solicitada, comprada y recibida son distintas. No marcar recibido al registrar desembolso. Un mismo producto puede provenir de varios proveedores/precios. Toda sugerencia requiere decisión humana para convertirse en compra.

**Datos y vínculos que deben poder reconstruirse:** Proveedor, contactos/incidencias, catálogo/precios por proveedor, lista/orden, líneas, compras parciales, recepciones y referencias a movimientos. Acordar granularidad si compra y recepción usan documentos distintos.

**Errores, alternativas y decisiones:** Cantidad menor o mayor a solicitada; sustitución; precio desconocido; recepción repetida; producto dañado; compra cancelada después de recepción parcial. Política de devoluciones no definida completamente.

**Criterio de aceptación propuesto:** Repetir ingreso de una recepción no duplica existencias. Un pendiente refleja lo que falta sin perder cantidades compradas/recibidas.

#### Historias originales completas de EP-13

- HU-CMP-01. Como encargado, quiero recibir una lista sugerida de compras para el siguiente día de servicio.

- HU-CMP-02. Como encargado, quiero editar cantidades sugeridas antes de confirmar la lista.

- HU-CMP-03. Como encargado, quiero agregar o quitar productos manualmente.

- HU-CMP-04. Como encargado, quiero consultar listas de compras por fecha.

- HU-CMP-05. Como encargado, quiero registrar cantidad solicitada, comprada y pendiente.

- HU-CMP-06. Como sistema, quiero manejar estados como solicitado, parcial, comprado, recibido y cancelado.

- HU-CMP-07. Como sistema, quiero diferenciar producto comprado de producto recibido en inventario.

- HU-CMP-08. Como encargado, quiero registrar quién compró, quién recibió y quién ingresó el producto.

- HU-CMP-09. Como administrador, quiero registrar proveedores y sus datos de contacto.

- HU-CMP-10. Como administrador, quiero asociar varios proveedores a un mismo producto.

- HU-CMP-11. Como encargado, quiero indicar un proveedor habitual o preferido.

- HU-CMP-12. Como encargado, quiero registrar de qué proveedor se obtuvo cada cantidad cuando una compra se divide.

- HU-CMP-13. Como sistema, quiero conservar historial de precios por proveedor.

- HU-CMP-14. Como personal autorizado, quiero registrar incidencias operativas con proveedores.

- HU-CMP-15. Como sistema, quiero sugerir proveedor habitual sin comprar automáticamente.

### EP-14. Producción y preparaciones — 14 historias

**Actores:** Cocina y encargado.

**Qué hace:** Registrar producción, ingredientes según versión, cantidad obtenida, rendimiento real y merma. Consumir preparaciones previas sin doble contar recursos. Sugerir producción para próximo servicio; aprobar, rechazar o descartar. Registrar tiempos activos/pasivos y disponibilidad estimada; considerar remanentes por lote/caducidad. Evaluar viabilidad cerca del cierre.

**Qué debe conservar la BD:** Orden de producción, lote, receta/version, consumos, salidas, rendimientos, tiempos, estados y decisiones.

**Reglas y referencias:** RN-085–087, RN-101–107, RN-143.

**Verificación pendiente antes del ERD:** Definir inicio/consumo/finalización, producción parcial, suspensión y reserva compartida con ventas. Lista sugerida no equivale a producción aprobada.

#### Desarrollo del caso de uso: Ejecutar una producción

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Preparación, versión de receta, cantidad objetivo, lote, responsable y aprobación si surge de sugerencia.

**Flujo completo:** Evaluar insumos y tiempo; aprobar; reservar o asignar recursos según política; iniciar; registrar consumos reales; transcurrir etapas activas/pasivas; finalizar cantidad real y merma; crear salida/lote; recalcular disponibilidad dependiente.

**Responsabilidad del backend:** Producción sugerida no consume recursos. La finalización real puede diferir del rendimiento esperado. Preparaciones usadas como insumo deben tener lote/versión trazables. Suspender producción crítica modifica lo que puede prometerse al cliente.

**Datos y vínculos que deben poder reconstruirse:** Orden y lote de producción, receta/version, cantidades previstas/reales, consumo por recurso/lote, salidas, merma, inicio/fin, tiempos activos/pasivos, estado y autor de decisiones.

**Errores, alternativas y decisiones:** Faltan ingredientes después de aprobar; producción parcial; rendimiento menor; proceso detenido; preparación termina después del cierre. Definir cancelación y destino de recursos ya utilizados.

**Criterio de aceptación propuesto:** Ingredientes consumidos y producción obtenida quedan vinculados; el mismo recurso no se reserva simultáneamente para producción y venta incompatible.

#### Historias originales completas de EP-14

- HU-PRO-01. Como personal de cocina, quiero registrar cantidades producidas.

- HU-PRO-02. Como sistema, quiero descontar ingredientes según la receta vigente.

- HU-PRO-03. Como personal de cocina, quiero corregir el rendimiento real y registrar merma.

- HU-PRO-04. Como sistema, quiero permitir que una producción utilice otras producciones.

- HU-PRO-05. Como sistema, quiero calcular cuánto puede producirse con las existencias actuales.

- HU-PRO-06. Como sistema, quiero evitar doble conteo de recursos compartidos.

- HU-PRO-07. Como encargado, quiero recibir una lista de producciones sugeridas para el siguiente servicio.

- HU-PRO-08. Como cocina, quiero marcar producciones realizadas, pendientes o descartadas.

- HU-PRO-09. Como administrador, quiero registrar tiempo activo de preparación.

- HU-PRO-10. Como administrador, quiero registrar tiempos pasivos como cocción, reposo o enfriamiento.

- HU-PRO-11. Como sistema, quiero estimar cuándo una producción estará disponible.

- HU-PRO-12. Como sistema, quiero evaluar si conviene iniciar nueva producción según hora, demanda, carga y cierre.

- HU-PRO-13. Como personal autorizado, quiero aceptar o rechazar una producción sugerida.

- HU-PRO-14. Como sistema, quiero considerar producciones remanentes del último día de servicio según lote, caducidad y política.

### EP-15. Disponibilidad y reserva de recursos — 14 historias

**Actores:** Sistema, cliente y personal autorizado.

**Qué hace:** Calcular disponible inmediato, posible con producción, condicionado y agotado. Considerar recursos compartidos y capacidad operativa. Confirmar mediante reserva atómica; informar agotamiento concurrente y proponer alternativas. Actualizar al cambiar inventario/producción/carga. Mantener disponibilidad calculada separada de publicada; una suspensión manual autorizada prevalece.

**Qué debe conservar la BD:** Reservas de recursos, capacidades, dependencias, overrides con motivo/vigencia y resultados calculados si se decide persistirlos.

**Reglas y referencias:** RN-023, RN-050–055, RN-089–107, RN-119–124; RT-026–031.

**Verificación pendiente antes del ERD:** Cerrar fórmula y unidad de capacidad. No sumar el mismo insumo como si estuviera disponible para todos los platos a la vez. Carrito no reserva por defecto.

#### Desarrollo del caso de uso: Publicar disponibilidad y confirmar capacidad

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Producto y opciones, cantidad solicitada, servicio, hora, existencias, reservas, preparaciones y capacidad operativa.

**Flujo completo:** Resolver dependencias; calcular disponibilidad inmediata y potencial; considerar recursos compartidos; evaluar tiempo y cierre; aplicar suspensiones/overrides; publicar vista por canal; al aceptar, volver a validar y reservar atómicamente; invalidar cálculo ante cambios pertinentes.

**Responsabilidad del backend:** La consulta de menú es orientativa y no bloquea stock. Sumar máximos individuales de productos que comparten ingredientes sobreestima capacidad. Un override no autoriza saldos imposibles sin política explícita de excepción.

**Datos y vínculos que deben poder reconstruirse:** Reservas por operación/recurso, estado y cantidades; capacidad configurada; overrides con autor/motivo/vigencia. Valores calculados pueden ser derivados/cacheados, con invalidación definida, no necesariamente tablas maestras.

**Errores, alternativas y decisiones:** Cambió carga después de consultar; se agotó un extra; preparación crítica suspendida; existe materia prima pero no tiempo; dos confirmaciones compiten. Mostrar resultado controlado al perdedor, no pedido confirmado sin recursos.

**Criterio de aceptación propuesto:** Dos pedidos que comparten el último insumo no lo consumen ambos. Producto suspendido permanece no vendible aunque el cálculo físico sea positivo.

#### Historias originales completas de EP-15

- HU-DIS-01. Como sistema, quiero calcular disponibilidad aproximada de cada platillo.

- HU-DIS-02. Como sistema, quiero diferenciar disponible inmediato, disponible con producción, condicionado y no disponible.

- HU-DIS-03. Como sistema, quiero calcular la capacidad adicional que puede producirse desde cero.

- HU-DIS-04. Como sistema, quiero considerar recursos compartidos entre varios platillos.

- HU-DIS-05. Como sistema, quiero reservar atómicamente recursos al confirmar un pedido.

- HU-DIS-06. Como cliente, quiero recibir aviso si un producto se agotó mientras confirmaba el pedido.

- HU-DIS-07. Como sistema, quiero sugerir alternativas cuando un producto deja de estar disponible.

- HU-DIS-08. Como personal operativo, quiero ver el número aproximado disponible junto a cada producto.

- HU-DIS-09. Como cliente, quiero ver estados simples como disponible, pocas unidades o no disponible.

- HU-DIS-10. Como personal autorizado, quiero establecer un override manual de disponibilidad.

- HU-DIS-11. Como sistema, quiero registrar el motivo y usuario de un override.

- HU-DIS-12. Como sistema, quiero actualizar automáticamente productos dependientes cuando una producción crítica se suspende.

- HU-DIS-13. Como sistema, quiero calcular ETA adicional cuando sea necesario producir desde cero.

- HU-DIS-14. Como sistema, quiero excluir de venta productos cuya producción adicional no sea razonable por horario o carga.

### EP-16. Cocina, KDS y ETA — 14 historias

**Actores:** Cocina, barra y atención.

**Qué hace:** Ver comandas, tiempos, notas y cambios; marcar componentes listos; sugerir ETA con carga, tamaño, producciones y personal disponible. Cocina puede ajustar ETA, justificar ampliaciones importantes y reordenar por eficiencia. Usar tiempos históricos cuando haya datos. Mostrar carga general/por área sin exigir cada microestado; pedidos extraordinarios requieren intervención.

**Qué debe conservar la BD:** Tickets, estados por línea, tiempos estimados/reales, ajustes y motivos, capacidad por área e historial útil para estimaciones.

**Reglas y referencias:** RN-039–041, RN-051–052, RN-081–082, RN-096–097, RN-102; HU-COC-01–14.

**Verificación pendiente antes del ERD:** Definir fórmula inicial, umbral de cambio significativo y sincronización entre áreas. ETA es estimación confirmable, no garantía automática.

#### Desarrollo del caso de uso: Operar cocina y estimar salida

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Comandas por área, tamaño y complejidad, preparación pendiente, personal disponible, hora objetivo y ajustes manuales.

**Flujo completo:** Recibir revisión vigente; mostrar prioridad, antigüedad, notas y hora objetivo; estimar preparación; permitir corrección/reordenamiento; registrar avance útil; marcar componentes listos; coordinar pedido completo; propagar cambios significativos a atención/cliente conforme a política.

**Responsabilidad del backend:** La hora de ampliación no reinicia el ETA de artículos anteriores. No se fuerza un microestado por cada movimiento del cocinero. Toda promesa al cliente usa información confirmada o claramente estimada.

**Datos y vínculos que deben poder reconstruirse:** Tickets/líneas, áreas, tiempos previstos/reales, prioridad, estado, ajustes y motivos, capacidad y datos históricos para estimación.

**Errores, alternativas y decisiones:** Áreas terminan en momentos distintos; cambio tras preparación; pedido extraordinario; personal insuficiente; ETA excede horario de recoger. Definir completitud y comunicación, sin asumir entrega automática al quedar listo.

**Criterio de aceptación propuesto:** Completar sushi no completa bebidas pendientes. Una ampliación conserva ETA y progreso de los artículos originales.

#### Historias originales completas de EP-16

- HU-COC-01. Como cocina, quiero visualizar las comandas activas con hora de ingreso.

- HU-COC-02. Como cocina, quiero visualizar hora estimada de salida, recogida o llegada de repartidor según el tipo de pedido.

- HU-COC-03. Como cocina, quiero visualizar observaciones y modificaciones importantes.

- HU-COC-04. Como cocina, quiero marcar un pedido o componente como listo cuando sea útil para atención.

- HU-COC-05. Como cocina, quiero confirmar o modificar el ETA propuesto por el sistema.

- HU-COC-06. Como cocina, quiero indicar un motivo cuando amplío significativamente un ETA.

- HU-COC-07. Como sistema, quiero estimar tiempos usando carga, producciones, tamaño del pedido y personal disponible.

- HU-COC-08. Como sistema, quiero considerar tiempos históricos para mejorar estimaciones.

- HU-COC-09. Como sistema, quiero permitir que cocina altere la prioridad sugerida por eficiencia operativa.

- HU-COC-10. Como sistema, quiero calcular ETA de una producción desde cero más carga y preparación final.

- HU-COC-11. Como encargado, quiero modificar temporalmente la capacidad operativa cuando exista una limitación.

- HU-COC-12. Como sistema, quiero identificar pedidos de volumen extraordinario y solicitar confirmación humana.

- HU-COC-13. Como personal de atención, quiero consultar el ETA actual antes de prometer un horario.

- HU-COC-14. Como sistema, quiero mostrar carga general y por área sin obligar al mesero a marcar cada microestado.

### EP-17. Cuentas, precuentas, pagos y caja — 29 historias

**Actores:** Cajero, atención, cliente y encargado.

**Qué hace:** Cobrar efectivo/tarjeta/transferencia, combinar medios y aceptar pagos parciales. Dividir por productos, partes iguales o importes; una persona puede pagar consumo ajeno. Emitir precuenta diferenciada de cuenta cerrada. Propina opcional sugerida sólo en mesa, separada por método; comisiones separadas. Corregir medios con auditoría; autorizar descuentos/cortesías. Abrir/cerrar caja, registrar gastos/retiros y conciliar diferencias e históricos.

**Qué debe conservar la BD:** Cuenta, líneas/asignaciones de consumo, pago, distribución, propina, comisión, devolución, caja, sesión, movimiento, arqueo y comprobante.

**Reglas y referencias:** RN-021–022, RN-046–049, RN-077–079, RN-131–138; RT-009, RT-047.

**Verificación pendiente antes del ERD:** Precisar redondeo, saldo, exceso/cambio, devolución y pago contra entrega. Registrar pago no implica integrar una pasarela. Pedido preparado y cuenta pagada son estados independientes.

#### Desarrollo del caso de uso: Cobrar, repartir importes y cerrar caja

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Cuenta o líneas a pagar, importe, medios, propina aceptada, efectivo entregado si aplica, cajero y sesión de caja.

**Flujo completo:** Obtener saldo vigente; resolver división/asignación; validar importes; registrar pago idempotente; aplicar a deuda y separar propina/comisión/envío; generar comprobante; actualizar saldo; registrar movimientos; al cerrar caja comparar esperado con contado y conservar diferencias.

**Responsabilidad del backend:** Pago y preparación avanzan independientemente. Precuenta no cierra deuda. Dividir cuenta no duplica productos ni notas. Corrección del medio deja trazabilidad. Propina es opcional y su sugerencia corresponde a consumo en mesa. Una transferencia reportada requiere criterio de validación acordado.

**Datos y vínculos que deben poder reconstruirse:** Cuentas, líneas/asignaciones, pagos/medios/estado, aplicaciones, reembolsos, propinas, comisiones, comprobantes, caja/sesión, ingresos/egresos y conciliación. Importes decimales y regla de redondeo explícita.

**Errores, alternativas y decisiones:** Dos cajeros cobran el mismo saldo; pago incierto; falta cambio; división con centavos; devolución parcial; caja cerrada; medio registrado erróneo. Resolver transaccionalmente y evitar sobreaplicación.

**Criterio de aceptación propuesto:** Los pagos aplicados más saldo explican el total; un reintento no cobra dos veces. Cierre separa ventas, propina, comisiones y movimientos ajenos a venta.

#### Historias originales completas de EP-17

- HU-PAG-01. Como cajero, quiero cobrar en efectivo.

- HU-PAG-02. Como cajero, quiero cobrar con tarjeta.

- HU-PAG-03. Como cajero, quiero registrar transferencias.

- HU-PAG-04. Como cajero, quiero combinar varios métodos de pago.

- HU-PAG-05. Como personal de atención, quiero dividir una cuenta por productos.

- HU-PAG-06. Como personal de atención, quiero dividir una cuenta por partes iguales.

- HU-PAG-07. Como personal de atención, quiero dividir una cuenta por importes personalizados.

- HU-PAG-08. Como sistema, quiero permitir pagos parciales.

- HU-PAG-09. Como sistema, quiero permitir que una persona pague productos asignados originalmente a otra cuenta.

- HU-PAG-10. Como sistema, quiero impedir cerrar una cuenta mientras exista saldo pendiente, salvo permiso especial.

- HU-PAG-11. Como personal, quiero generar e imprimir una precuenta.

- HU-PAG-12. Como sistema, quiero distinguir precuenta de cuenta cobrada/cerrada.

- HU-PAG-13. Como sistema, quiero calcular una propina sugerida del porcentaje configurado para consumo en mesa.

- HU-PAG-14. Como cliente, quiero aceptar, rechazar o modificar la propina sugerida.

- HU-PAG-15. Como sistema, quiero mantener propinas separadas de ingresos por venta.

- HU-PAG-16. Como sistema, quiero registrar propina por efectivo, tarjeta o transferencia.

- HU-PAG-17. Como sistema, quiero calcular comisiones de tarjeta de manera separada.

- HU-PAG-18. Como personal autorizado, quiero corregir un método de pago registrado incorrectamente dejando auditoría.

- HU-PAG-19. Como sistema, quiero manejar estados de pago independiente del estado operativo del pedido.

- HU-PAG-20. Como cliente de pedido para recoger, quiero decidir si pago antes o al recibir.

- HU-PAG-21. Como sistema, quiero manejar pagos anticipados en delivery.

- HU-PAG-22. Como sistema, quiero soportar pago contra entrega únicamente cuando esté autorizado.

- HU-PAG-23. Como encargado, quiero registrar gastos y otros movimientos de caja.

- HU-PAG-24. Como encargado, quiero abrir y cerrar caja.

- HU-PAG-25. Como sistema, quiero generar resumen de cierre por método de pago, gastos, retiros, diferencias, propinas y comisiones.

- HU-PAG-26. Como administrador, quiero consultar cierres históricos.

- HU-PAG-27. Como sistema, quiero permitir anulaciones antes del cobro sin incluir artículos anulados en el total.

- HU-PAG-28. Como encargado, quiero registrar descuentos excepcionales o cortesías con autorización.

- HU-PAG-29. Como sistema, quiero impedir que la IA genere descuentos o promociones no configurados.

### EP-18. Consumo interno, cortesías y personal — 6 historias

**Actores:** Encargado y administrador.

**Qué hace:** Clasificar cortesía, consumo interno y cargo al trabajador sin confundirlos con venta normal. Consultar pendientes por empleado y liquidarlos o marcarlos descontados al cierre del período. Conservar consumo físico aunque no genere ingreso.

**Qué debe conservar la BD:** Concepto de consumo, empleado deudor cuando aplique, importe, autorización, período, aplicaciones y liquidación.

**Reglas y referencias:** RN-064, RN-076, RN-136; HU-INT-01–06.

**Verificación pendiente antes del ERD:** Falta cerrar agregado de deuda y liquidación por trabajador. Descontado no implica implementar nómina ni efectuar descuentos automáticos.

#### Desarrollo del caso de uso: Registrar y liquidar consumos no comerciales

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Preparación o línea consumida, clasificación, empleado si hay cargo, importe/política, período, autorización y motivo.

**Flujo completo:** Autorizar clasificación; conservar efecto físico del consumo; registrar si genera deuda al empleado o no; consultar saldo por trabajador; aplicar liquidación/descuento autorizado al período; conservar detalle y responsable.

**Responsabilidad del backend:** Cortesía no equivale a descuento ni a merma. Cargo al personal requiere identificar deudor. Liquidar deuda no consume ingredientes nuevamente. No derivar nómina automática de esta capacidad.

**Datos y vínculos que deben poder reconstruirse:** Consumo clasificado, referencia al pedido/producción, empleado, cargo, fecha/período, saldo, aplicaciones/liquidación y autorización. Relación exacta con cuentas comerciales pendiente.

**Errores, alternativas y decisiones:** Reclasificación posterior al cierre; pago parcial del empleado; cargo erróneo; producto anulado que ya se consumió. Acordar si corrección compensa un registro previo en vez de sobrescribirlo.

**Criterio de aceptación propuesto:** Es posible reconstruir por trabajador saldo inicial, cargos, liquidaciones y saldo final sin mezclarlos con ventas normales.

#### Historias originales completas de EP-18

- HU-INT-01. Como encargado, quiero marcar un producto como cortesía.

- HU-INT-02. Como encargado, quiero marcar una preparación como consumo interno.

- HU-INT-03. Como encargado, quiero cargar un consumo a la cuenta de un miembro del personal.

- HU-INT-04. Como sistema, quiero mantener estos conceptos separados de la venta normal.

- HU-INT-05. Como administrador, quiero consultar consumos pendientes por trabajador.

- HU-INT-06. Como encargado, quiero marcar una cuenta de personal como liquidada o descontada al cierre de período.

### EP-19. IA y recomendaciones — 11 historias

**Actores:** Cliente, atención y sistema.

**Qué hace:** Responder consultas frecuentes con plantillas cuando basten. Consultar menú/disponibilidad/ETA/pedido por APIs controladas; recomendar según preferencias/historial sin inventar condiciones. Aislar contexto por cliente/canal, limitar herramientas, entregar resumen a humano y permitir toma de control. Usar colas bajo carga.

**Qué debe conservar la BD:** Sesión IA, llamadas a herramientas, resultado, contexto permitido y transferencia a humano; datos mínimos según retención aprobada.

**Reglas y referencias:** RN-024, RN-033–034, RN-070, RN-144–145; RT-036–041, RT-073–074.

**Verificación pendiente antes del ERD:** Definir proveedor/ejecución y alcance de entrega. LLM sin acceso directo a BD; no puede autorizar por sí solo descuentos, restricciones ni stock inexistente.

#### Desarrollo del caso de uso: Asistir mediante IA sin sustituir autorizaciones

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Mensaje de una conversación identificada, preferencias permitidas y resultados de herramientas autorizadas.

**Flujo completo:** Comprobar si basta plantilla; aislar sesión; consultar sólo APIs permitidas; generar propuesta anclada a datos; ejecutar únicamente acciones permitidas con controles backend; ofrecer intervención humana; cancelar/resolver respuestas pendientes al transferir control.

**Responsabilidad del backend:** El LLM no accede directamente a BD. No inventa stock, tiempos, descuentos ni confirma pedidos por inferencia. Las herramientas conservan autenticación/autorización y contexto del cliente. Una recomendación no es promoción.

**Datos y vínculos que deben poder reconstruirse:** Sesión, canal/cliente, llamadas a herramientas, resultado/estado, versión o referencia necesaria para auditoría y handoff. Retención de contenido y datos personales pendiente de política.

**Errores, alternativas y decisiones:** Timeout del modelo; herramienta falla; dato desactualizado; solicitud sensible; carga alta; usuario intenta acceder a otro pedido. Derivar a lógica/humano sin bloquear caja/cocina.

**Criterio de aceptación propuesto:** Una petición en lenguaje natural no permite leer otro cliente ni saltar una restricción que la API rechazaría.

#### Historias originales completas de EP-19

- HU-IA-01. Como cliente, quiero recibir respuestas automáticas a consultas frecuentes.

- HU-IA-02. Como sistema, quiero usar plantillas cuando no sea necesario invocar el LLM.

- HU-IA-03. Como sistema, quiero mantener aislado el contexto de cada conversación.

- HU-IA-04. Como sistema, quiero limitar las herramientas y datos accesibles por el LLM.

- HU-IA-05. Como IA, quiero consultar menú, disponibilidad, ETA y estado de pedido mediante APIs controladas.

- HU-IA-06. Como personal, quiero tomar control de una conversación en cualquier momento.

- HU-IA-07. Como sistema, quiero impedir que la IA prometa tiempos, descuentos, disponibilidad o condiciones no confirmadas.

- HU-IA-08. Como cliente, quiero recibir recomendaciones según preferencias e historial cuando corresponda.

- HU-IA-09. Como sistema, quiero usar algoritmos de recomendación separados del LLM cuando sea suficiente.

- HU-IA-10. Como personal, quiero recibir un resumen de la situación antes de intervenir.

- HU-IA-11. Como sistema, quiero procesar solicitudes de IA mediante colas o control de concurrencia cuando exista alta carga.

### EP-20. Visión y monitoreo operativo — 6 historias

**Actores:** Encargado y revisor autorizado.

**Qué hace:** Estimar ocupación/carga y posible llegada del repartidor mediante cámaras. Mostrar confianza y permitir confirmación/rechazo humano. Usar la detección como señal complementaria para la operación.

**Qué debe conservar la BD:** Fuente de cámara, evento/detección, confianza, referencia temporal, revisión, resultado y revisor.

**Reglas y referencias:** RN-024; HU-VIS-01–06; RT-074.

**Verificación pendiente antes del ERD:** Definir señales y retención, sin asumir reconocimiento facial ni almacenamiento permanente de video. Una detección no confirma entrega ni altera caja automáticamente.

#### Desarrollo del caso de uso: Revisar señales de cámaras

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Fuente de cámara, instante, clase de evento estimado y confianza.

**Flujo completo:** Recibir detección; identificar origen/tiempo; presentar como indicio; permitir confirmación/rechazo con responsable; incorporar sólo el uso operativo autorizado; conservar metadatos según política.

**Responsabilidad del backend:** No usar una detección como única prueba de ocupación o entrega. No se deduce reconocimiento facial del requisito. Separar inferencia automática de validación humana.

**Datos y vínculos que deben poder reconstruirse:** Cámara/fuente, evento, timestamp, clase, confianza, estado de revisión, revisor, comentario y vínculo operativo si se confirma.

**Errores, alternativas y decisiones:** Falso positivo, señal repetida, cámara caída, imagen retrasada, dos eventos sobre la misma llegada. Definir deduplicación y vigencia de señales.

**Criterio de aceptación propuesto:** Rechazar detección no altera una entrega real ya registrada; cámara caída no detiene pedidos.

#### Historias originales completas de EP-20

- HU-VIS-01. Como encargado, quiero consultar indicadores de ocupación/carga estimados mediante cámaras.

- HU-VIS-02. Como sistema, quiero utilizar visión como señal complementaria y no como única fuente de verdad.

- HU-VIS-03. Como personal de atención, quiero recibir una posible detección de llegada de repartidor.

- HU-VIS-04. Como sistema, quiero indicar nivel de confianza de detecciones.

- HU-VIS-05. Como personal autorizado, quiero confirmar o rechazar una detección automática.

- HU-VIS-06. Como sistema, quiero usar señales visuales para enriquecer estimaciones de carga laboral.

### EP-21. Administración, reportes y continuidad — 22 historias

**Actores:** Administrador, encargado y personal autorizado.

**Qué hace:** Mostrar ventas, tiempos, carga, críticos y alertas. Configurar horarios y excepciones, propinas, tolerancias, límites y estados de servicio. Suspender local/recoger/online/delivery según permiso, con motivo/actor/hora. Reportar ventas, inventario, producción, anulaciones y caja; auditar acciones y errores. Mantener operación local ante caída de Internet si LAN/servidor siguen disponibles. Remotos pueden esperar/cancelar/pedir aviso y requieren revalidación.

**Qué debe conservar la BD:** Configuración, horarios/excepciones, servicios e historial, auditoría, eventos pendientes, idempotencia, logs/métricas y consultas de reportes.

**Reglas y referencias:** RN-001–008, RN-055, RN-088, RN-098–112, RN-117–120; RT-016–025, RT-061, RT-071–076.

**Verificación pendiente antes del ERD:** Acordar topología real: un backend sólo en nube no satisface por sí mismo continuidad LAN. Definir relay si se notificará sin Internet local. Caída del servidor local es otro escenario.

#### Desarrollo del caso de uso: Configurar, observar y sostener la operación

Los siguientes pasos y campos constituyen un **contrato propuesto para validar**, derivado de las historias. Los nombres de estados, tablas y campos definitivos se acuerdan al cerrar el modelo. No todos estos detalles aparecen literalmente en el levantamiento original.

**Entrada de la operación:** Parámetros con vigencia, horarios/excepciones, servicio afectado, motivo de suspensión, filtros de reporte y permisos.

**Flujo completo:** Validar cambio autorizado; registrar valor previo/nuevo y vigencia; aplicar a solicitudes futuras según política; comunicar estado operativo; recalcular disponibilidad cuando proceda; generar reportes desde hechos consistentes; aislar integraciones; recuperar tareas tras reinicio sin duplicar efectos.

**Responsabilidad del backend:** Cerrar online no implica cerrar local. Un cambio de horario no debe borrar una aceptación histórica. Reportes no deben mezclar fecha de pedido, pago y emisión sin declararlo. Priorizar consistencia ante riesgo de sobreventa o doble cobro.

**Datos y vínculos que deben poder reconstruirse:** Configuración tipada, horarios/excepciones, estados por servicio, historial, auditoría, eventos/tareas e idempotencia. Reportes derivados con filtros, moneda y criterio temporal definidos.

**Errores, alternativas y decisiones:** Caída de Internet con LAN activa; caída del servidor local; integración lenta; cola acumulada; reinicio a mitad de tarea. Son escenarios distintos y necesitan recuperación distinta.

**Criterio de aceptación propuesto:** Operación presencial sigue con WAN caída si servidor/LAN están disponibles; recuperar red no acepta retrospectivamente solicitudes en espera.

#### Historias originales completas de EP-21

- HU-ADM-01. Como administrador, quiero consultar un dashboard con ventas, tiempos, carga, productos críticos y alertas.

- HU-ADM-02. Como administrador, quiero configurar horarios normales del restaurante.

- HU-ADM-03. Como administrador, quiero configurar cierres especiales o aperturas tardías por fecha.

- HU-ADM-04. Como personal autorizado, quiero cerrar o suspender total o parcialmente un servicio.

- HU-ADM-05. Como personal autorizado, quiero suspender pedidos online.

- HU-ADM-06. Como personal autorizado, quiero suspender delivery.

- HU-ADM-07. Como sistema, quiero registrar motivo, usuario y hora de cada cierre o suspensión.

- HU-ADM-08. Como administrador, quiero configurar parámetros como propina, tolerancia de reservas y horarios límite.

- HU-ADM-09. Como administrador, quiero consultar reportes de ventas, inventario, producción, anulaciones, tiempos y caja.

- HU-ADM-10. Como administrador, quiero consultar productos más pedidos y tendencias.

- HU-ADM-11. Como encargado, quiero recibir notificaciones de compras y producciones pendientes.

- HU-ADM-12. Como administrador, quiero consultar auditoría de acciones sensibles.

- HU-ADM-13. Como sistema, quiero mostrar estados operativos predefinidos como normal, alta demanda, producción en curso, solo recoger o cerrado.

- HU-ADM-14. Como personal autorizado, quiero cambiar manualmente el estado operativo.

- HU-ADM-15. Como sistema, quiero degradar servicios online sin detener la operación local cuando falle Internet externo.

- HU-ADM-16. Como cliente remoto, quiero poder esperar, cancelar o pedir notificación cuando el servicio online esté temporalmente indisponible.

- HU-ADM-17. Como personal, quiero consultar solicitudes remotas pendientes de confirmación.

- HU-ADM-18. Como sistema, quiero revalidar disponibilidad, carga, horarios y ETA antes de aceptar una solicitud que estuvo en espera.

- HU-ADM-19. Como administrador, quiero consultar logs técnicos de integraciones, impresiones y errores.

- HU-ADM-20. Como sistema, quiero continuar mostrando pedidos en KDS/log aunque una impresora falle.

- HU-ADM-21. Como personal autorizado, quiero reintentar una impresión sin reprocesar el pedido.

- HU-ADM-22. Como sistema, quiero mantener los portales Cliente, Operativo y Administrativo con navegación y permisos diferenciados.

## 4. Facturación: función adicional que falta cerrar

El modelo recuperado sí contiene `invoices` e `invoice_items`, además de notas de crédito mediante tipo de documento y referencia al original. Las historias de EP-17 hablan de cuentas, precuentas y cobros; eso no constituye un caso de uso completo de emisión fiscal. No se crea una EP-22 aprobada por asumir que existen tablas.

**Propuesta funcional para validar:** obtener datos del receptor; seleccionar consumo facturable; preparar documento con detalles e importes; emitir según modalidad acordada; consultar/entregar copia; conservar estados y referencias; corregir mediante el documento o procedimiento autorizado; conciliar resultado incierto de un proveedor si existe. Necesita permisos y auditoría propios.

La factura debe congelar datos del emisor/receptor y líneas (descripción, cantidad, precio, descuento e impuesto aplicable) para que cambios posteriores del menú o perfil no reescriban el documento. Un reembolso mueve dinero; una nota de crédito corrige un documento: no son la misma operación. Una precuenta informa saldo y un comprobante acredita cobro; ninguno demuestra emisión fiscal.

Decisiones obligatorias: demostración académica o emisión real; proveedor si aplica; numeración y momento de asignación; impuestos/precios/redondeo; relación de una cuenta con una o varias facturas; asignación de líneas al dividir cuenta; pagos anticipados; anulación/corrección; documento original y línea original corregida; permisos; estados e intentos. No se asumen tasas ni obligaciones tributarias. Si se elige emisión real, investigar sus requisitos específicos antes de diseñar integración y pruebas.

## 5. Recorridos completos que el backend debe resolver

### A. Solicitud digital hasta entrega

1. Consultar servicio, menú y disponibilidad publicada.
2. Construir carrito con opciones permitidas. El carrito no reserva recursos por defecto.
3. Enviar solicitud identificada de forma única; recalcular precio y validar identidad/restricciones desde backend.
4. Si no se puede atender, ofrecer espera/cancelación según política; guardar decisión del cliente. No confirmar silenciosamente.
5. Al aceptar, revalidar horario, recursos, carga y ETA, reservar atómicamente y confirmar sólo tras commit.
6. Crear/enrutar comandas por área; preparar y comunicar cambios relevantes de ETA.
7. Entregar para recoger o coordinar repartidor; registrar cobro según modalidad sin confundirlo con preparación.
8. Cerrar atención/cuenta cuando corresponda, conservar histórico y emitir documento según alcance aprobado.

### B. Consumo en mesa

Asignar mesa o grupo → abrir atención con comensales/responsable → crear pedido → comandar por áreas → admitir ampliaciones con ETA independiente → dividir cuenta si procede → aplicar pagos/propina → cerrar saldo → liberar mesa. Un traslado no pierde consumo ni deuda; una autorización excepcional se registra.

### C. Reserva y preorden

Validar fecha/hora/comensales → asignar capacidad → registrar llegada y servicio objetivo → añadir preorden opcional u obligatoria según regla → programar preparación → registrar llegada/atraso → liberar espacio al exceder tolerancia sin borrar reserva → atender si hay capacidad. Una reserva sin preorden no promete preparación inmediata.

### D. Compra, producción y venta

Lista sugerida → compra parcial por proveedor → recepción real por responsable/lote → entrada de existencias → producción aprobada con versión de receta → consumo de insumos y salida de producción real → reserva para pedido → consumo operativo → conciliación de movimientos y conteos. Comprar no incrementa existencias; sugerir producción no la ejecuta.

### E. Cambio después de comandar

Autorizar y verificar versión concurrente → evaluar si preparación permite cambio → conservar línea original anulada/reemplazada → clasificar recursos consumidos y efecto económico por separado → actualizar recursos todavía reservados → generar revisión de comanda para áreas afectadas → recalcular cuenta y ETA aplicable → auditar. No borrar la línea ni devolver automáticamente ingredientes utilizados.

### F. Pago y cierre

Consultar saldo → distribuir importe entre consumo, propina y conceptos separados → registrar medio(s) e idempotencia → confirmar transacción → generar comprobante → registrar caja según flujo → conciliar al cierre. Corregir pago, devolver dinero y corregir factura tienen efectos diferentes y trazables.

## 6. Relaciones conceptuales que hay que confirmar

Estas relaciones expresan necesidades; no fijan todavía nombres de tablas, todas las cardinalidades ni columnas SQL.

| Conceptos | Relación que debe resolverse |
|---|---|
| Usuario ↔ rol ↔ permiso | Usuarios con varios roles y roles con varios permisos; autorización efectiva. |
| Cliente → operaciones | Historial de pedidos, reservas y conversaciones; identidad y acceso separados de conservación histórica. |
| Atención ↔ mesas | Un grupo puede ocupar varias mesas y trasladarse; asignaciones temporales con historia. |
| Reserva ↔ mesas / preorden | Asignación múltiple de espacio, liberación por tolerancia y pedido anticipado asociado. |
| Solicitud → pedido | Aceptación explícita y trazable; resolver si comparten entidad o se vinculan. |
| Pedido → líneas → opciones | Cantidades y condiciones históricas; reemplazos y cambios conservados. |
| Pedido → comandas → revisiones | Distribución por área; documento vigente y sustituciones inequívocas. |
| Pedido / líneas ↔ cuentas | División y pago cruzado sin duplicar productos físicos ni modificadores. |
| Cuenta ↔ pagos | Pagos parciales y mixtos; asignaciones monetarias que no superen límites autorizados. |
| Cuenta → facturas → líneas | Política de emisión/partición pendiente; mantener detalle histórico y correcciones. |
| Receta → versiones → componentes | Preparaciones anidadas sin ciclos y versión usada en operación histórica. |
| Artículo → lotes / movimientos / reservas | Físico, comprometido y disponible conciliables, sin sobreventa. |
| Compra → recepciones | Recepción parcial y proveedor real de cada cantidad. |
| Producción → consumos / salidas | Recursos consumidos y cantidades reales obtenidas por lote. |
| Trabajador → cargos / liquidaciones | Saldo y aplicaciones por período, distinto de venta/merma. |
| Conversación → mensajes | Aislamiento por canal aunque coincida cliente confirmado. |

Un estado actual y su historial cumplen funciones diferentes. Tampoco debe crearse una tabla por cada pantalla: reportes y disponibilidad pueden derivarse de registros transaccionales. Decidir qué cálculos se persisten y cómo se invalidan.

## 7. Reglas transversales que condicionan BD y backend

- **Horario configurable:** las reglas actuales indican martes a domingo 14:00–22:00, cierre cocina 21:30, último ingreso local 21:15, recoger tardío sujeto a viabilidad y delivery con recogida externa aproximadamente hasta 21:00. Tolerancia normal de reserva: 20 minutos. Son valores documentados, con excepciones autorizadas y configuración; no constantes distribuidas por pantallas.
- **Transacciones:** aceptar pedido y reservar recursos de forma consistente; confirmar al cliente sólo tras commit. Bloquear recursos en orden determinista, con reintentos seguros y control de versión para ediciones.
- **Idempotencia:** reintentar solicitud, modificación, pago, devolución o impresión no duplica efectos. Cada modificación posee identificador independiente. Persistir resultado y resolver resultados inciertos.
- **Autorización:** todo permiso se comprueba en backend, incluida propiedad de pedido/perfil. Registro público no concede roles operativos. Acciones excepcionales registran quién, cuándo y por qué.
- **Trazabilidad:** preservar artículos comandados, recetas históricas, estados y documentos financieros. Separar estado operativo, financiero, de emisión e integración.
- **Integridad monetaria:** acordar moneda, precisión, redondeo y distribución; totales y asignaciones deben conciliar. No confiar en importes enviados por la app. Descuento, cortesía, propina, comisión y delivery externo son conceptos distintos.
- **Continuidad:** la operación local depende de LAN y servidor local disponibles. Cola/outbox, aislamiento de integraciones, timeouts, recuperación y control de carga no equivalen a funcionamiento desconectado de cada teléfono. Si se requiere informar al remoto durante caída de Internet local, hace falta infraestructura externa.
- **Privacidad y conservación:** separar restricciones internas del perfil público; revocar sesiones al eliminar; definir conservación y acceso a comprobantes, conversaciones y señales de cámaras.
- **Presentación:** tres contextos, permisos y estados legibles; cliente recibe disponibilidad simplificada, personal detalle aproximado. Una pantalla visible no acredita ejecución de reglas.
- **Operación técnica:** métricas, auditoría, recuperación sin duplicados y reportes sin bloquear transacciones críticas. Respaldos y restauración verificable son recomendaciones de implementación a especificar, no una funcionalidad demostrada por el esquema.

## 8. Qué falta decidir para cerrar el ERD

| Decisión | Responsable sugerido | Resultado necesario |
|---|---|---|
| Producto completo frente a entrega de 5–6 semanas | PM + SM + equipo | Cada HU/RN/RT marcada por fase; exclusiones explícitas sin borrarlas del producto. |
| Facturación académica o real | PM + ingeniero + negocio | Casos de uso, estados, impuestos/serie/proveedor si aplica y aceptación. |
| Solicitud pendiente frente a pedido | Backend + PM | Ciclo de aceptación, espera, rechazo, expiración y efecto en stock. |
| Grupo/sesión de mesas | Operativo + backend | Unir/separar/trasladar sin perder historia ni saldo. |
| Revisiones e impresión | Cocina + backend | Sustitución parcial/completa, trabajos, intentos y reimpresiones. |
| Reserva/consumo de recursos | Cocina + inventario + backend | Evento exacto por insumo, producción y empaque; devolución y merma. |
| Caja y distribución de pagos | Encargado + backend | Reglas de división, saldos, redondeo, cambio, corrección y reembolso. |
| Cargos al personal | Encargado + backend | Deuda, período y forma de liquidación. |
| Identidad y nueva cuenta | PM + backend | Correo reutilizado, suspensión, verificación y política histórica. |
| Topología y canales integrados | Ingeniero + equipo | LAN/nube, disponibilidad remota y qué integraciones serán reales. |
| Inventario, recetas y capacidad | Negocio + backend | Unidades, conversiones, lotes, ciclos, rendimiento y fórmula inicial de ETA. |
| Backend ya desarrollado por compañeros | Responsables backend | Contratos/migraciones reales contrastados con esta documentación. |

Consultar además [los 12 hallazgos concretos del modelo recuperado](REVIEW_FINDINGS.md). Tener 109 tablas no demuestra que estas decisiones estén resueltas ni obliga a implementar las 109 en el primer corte.

## 9. Escenarios mínimos de aceptación para la revisión

1. Dos clientes confirman el último recurso: sólo la primera transacción válida lo reserva; la otra recibe alternativa/error controlado.
2. Reintentar el mismo pedido o pago tras timeout conserva una sola operación; nueva modificación usa otra clave.
3. Dos empleados editan el mismo pedido: la segunda edición obsoleta no sobrescribe silenciosamente.
4. Cambiar sushi por bebida después de comandar cancela en sushi y añade en barra; queda relación de reemplazo.
5. Anular producto ya preparado retira el importe cobrable según política, conserva historia y no repone ingredientes automáticamente.
6. Reimprimir o fallar impresora no crea pedido, consumo ni cobro nuevo; KDS conserva el registro confirmado.
7. Reserva posterior a último ingreso se rechaza con alternativa válida, incluso si lleva preorden.
8. Superar tolerancia libera asignación de mesa, conserva reserva y permite atención posterior sólo si hay disponibilidad.
9. Compra parcial sin recepción no aumenta stock; recepción posterior aumenta sólo cantidad real recibida.
10. Receta nueva no modifica consumos ni importes históricos; dependencias no pueden formar ciclos.
11. Suspensión manual de producto impide vender aunque haya stock; reactivación necesita permiso.
12. División de cuenta y pagos mixtos conservan totales sin duplicar líneas físicas; propina/comisión quedan separadas.
13. Unión/traslado de mesas conserva responsable, historial y deuda; liberar con saldo requiere excepción autorizada.
14. Caída de Internet externo conserva operación local bajo las condiciones documentadas; reconexión no acepta solicitudes pendientes automáticamente.
15. Eliminar cuenta revoca sesiones; recrearla no expone automáticamente historial anterior ni evade revisión por suspensión.
16. Mensajes de dos clientes/canales y respuestas IA permanecen aislados; IA no ejecuta una acción restringida sin autorización.
17. Si se habilita facturación: reintento incierto no duplica emisión; corrección y reembolso preservan sus referencias y límites.
18. Consumo a trabajador genera saldo individual conciliable y liquidación trazable, sin tratarlo como merma ni venta normal indistintamente.

Estos son criterios propuestos para guiar pruebas futuras; **no son pruebas ejecutadas** ni sustituyen criterios específicos de las 308 historias.

## 10. Cómo usar la matriz con el equipo

Abrir `REQUIREMENTS_REVIEW.csv` en una hoja de cálculo. Para cada fila: confirmar/corregir requisito, asignar fase y responsable en observaciones, enlazar caso de uso y decisión, identificar entidades/API y luego añadir evidencia de prueba. No marcar “cumple” sólo porque exista una pantalla o tabla. Las filas comienzan deliberadamente pendientes.

Orden recomendado: validar recorrido del negocio → resolver decisiones de esta sección → aprobar corte de entrega → acordar estados y cardinalidades → corregir modelo candidato y diccionario juntos → revisar restricciones/índices → convertir a migraciones → probar sobre PostgreSQL desechable → conectar web/app.

No se creó una BD, no se ejecutó SQL y no se cambiaron tablas en esta revisión. El objetivo es cerrar qué debe hacer el sistema antes de consolidar cómo se almacena.

## 11. Todas las reglas de negocio originales

Este inventario conserva el texto original. Su inclusión no significa que esté implementado ni validado por el equipo. Las decisiones que cambien estas reglas deben quedar registradas.

- RN-001. El restaurante opera normalmente de martes a domingo de 14:00 a 22:00.

- RN-002. La cocina cierra normalmente a las 21:30.

- RN-003. El último ingreso normal para consumo en local es a las 21:15.

- RN-004. Entre 21:16 y 21:30 solo se aceptan normalmente pedidos para recoger, sujeto a carga y disponibilidad.

- RN-005. Los pedidos de ese último período deben recogerse dentro del margen operativo definido por el restaurante.

- RN-006. El servicio de delivery externo deja de recoger normalmente alrededor de las 21:00.

- RN-007. Entre 20:00 y 21:00 los pedidos a domicilio deben evaluar carga y ETA antes de confirmarse.

- RN-008. El restaurante puede cerrar anticipadamente por baja demanda, falta de producción, alta carga u otra decisión autorizada.

- RN-009. La tolerancia normal de llegada a una reservación es de 20 minutos.

- RN-010. Al superar la tolerancia se libera el espacio previsto, pero el registro de la reservación puede mantenerse.

- RN-011. La preparación física de una mesa reservada se realiza normalmente como máximo una hora antes, salvo excepción.

- RN-012. El cliente puede realizar decoración si cumple la política de retiro al finalizar.

- RN-013. Una reservación puede incluir preorden, pero no es obligatoria salvo reglas especiales por horario.

- RN-014. Una reservación sin preorden está sujeta al tiempo de preparación existente al momento del servicio.

- RN-015. El cliente indica número de comensales, pero no selecciona directamente el área física de mesas.

- RN-016. El sistema o personal asigna mesas según capacidad, combinaciones y disponibilidad.

- RN-017. Un pedido a domicilio puede exigir depósito previo según política y antecedentes.

- RN-018. El pago contra entrega, cuando esté autorizado, se maneja únicamente con el medio habilitado por el restaurante.

- RN-019. El costo de delivery se maneja separado del total del restaurante.

- RN-020. El restaurante no garantiza el tiempo de traslado externo.

- RN-021. Los métodos de pago actuales son efectivo, tarjeta y transferencia.

- RN-022. Una cuenta puede usar varios métodos de pago.

- RN-023. La disponibilidad automática puede ser reemplazada temporalmente por un override manual autorizado.

- RN-024. IA y visión no deben presentar como hecho información no confirmada.

- RN-025. Un usuario puede tener múltiples roles.

- RN-026. Cada rol se compone de permisos independientes.

- RN-027. Los horarios del personal pueden variar por fecha.

- RN-028. El cálculo de carga puede considerar únicamente personal disponible.

- RN-029. Los movimientos de inventario deben registrar responsable.

- RN-030. Las conversaciones de distintos canales no se fusionan aunque pertenezcan al mismo cliente.

- RN-031. Los canales pueden asociarse al mismo perfil solo cuando la identidad esté confirmada.

- RN-032. WhatsApp, Instagram y chat interno pueden atenderse por separado.

- RN-033. Al transferir una conversación de IA a humano se debe proporcionar contexto/resumen.

- RN-034. La IA puede proponer soluciones, pero las acciones restringidas requieren autorización.

- RN-035. Para pedidos se acepta texto y comprobantes permitidos según política.

- RN-036. Archivos no permitidos no deben conservarse permanentemente.

- RN-037. Un cliente puede tener restricciones específicas de servicio.

- RN-038. Las restricciones deben ser auditables.

- RN-039. Los pedidos para recoger deben validar la hora solicitada contra el ETA.

- RN-040. Cocina puede confirmar o modificar el ETA calculado.

- RN-041. Los cambios de ETA deben propagarse al personal correspondiente.

- RN-042. Una modificación de preorden cercana a la reservación debe validar si todavía puede completarse.

- RN-043. Alcanzada la hora de la reserva, el cliente no puede modificar directamente la preorden.

- RN-044. Personal autorizado sí puede modificar pedidos ya comandados.

- RN-045. Toda modificación posterior a comanda debe conservar trazabilidad.

- RN-046. Las cuentas pueden pagarse parcialmente.

- RN-047. Una persona puede pagar productos pertenecientes a otra cuenta.

- RN-048. Una mesa no se libera mientras existan saldos pendientes, salvo autorización especial.

- RN-049. La división de cuenta no debe duplicar observaciones ni modificadores.

- RN-050. La disponibilidad aproximada debe actualizarse con inventario, producción y pedidos.

- RN-051. Nueva producción puede incrementar dinámicamente el ETA.

- RN-052. El inicio del servicio puede tener capacidad reducida por producciones pendientes.

- RN-053. La disponibilidad mostrada al cliente puede ser menos detallada que la del personal.

- RN-054. Los productos no disponibles pueden ocultarse del menú del cliente.

- RN-055. Los estados operativos pueden activarse por horario o manualmente por personal autorizado.

- RN-056. Un artículo enviado a cocina no debe borrarse físicamente del historial.

- RN-057. Un artículo anulado deja de formar parte del importe cobrable, pero conserva trazabilidad.

- RN-058. Un cambio debe relacionar el artículo original con su reemplazo.

- RN-059. Toda modificación posterior al envío a cocina debe generar actualización de comanda.

- RN-060. La actualización puede ser parcial o completa según criterio del personal.

- RN-061. Una comanda completa actualizada debe indicar que sustituye la versión anterior.

- RN-062. Las comandas deben manejar revisión/versionado.

- RN-063. Si un artículo ya está siendo preparado, el personal decide si el cambio es posible.

- RN-064. Una anulación con insumos ya consumidos puede generar merma independiente del cobro.

- RN-065. No se debe aceptar una reservación presencial posterior al último horario válido de ingreso.

- RN-066. Si se solicita una hora posterior, el sistema debe proponer la última alternativa válida.

- RN-067. Una reservación tardía puede requerir preorden completa.

- RN-068. Una reservación tardía debe informar el horario de cierre.

- RN-069. La aceptación final de una reserva tardía considera carga, tamaño de pedido y tiempo restante.

- RN-070. El sistema no crea promociones, descuentos o combos sin configuración/autorización explícita.

- RN-071. Cada producto del menú debe estar asociado a un área de preparación o despacho.

- RN-072. Cada comanda debe contener únicamente productos del área receptora.

- RN-073. Un cambio entre áreas genera anulación en el área original y adición en el área nueva.

- RN-074. Solo pueden seleccionarse extras y modificaciones configurados como válidos para el producto.

- RN-075. Los pedidos especiales fuera de menú requieren autorización.

- RN-076. Una preparación no cobrada debe clasificarse como corresponda: anulación, cortesía, consumo interno, merma o cargo al personal.

- RN-077. La propina sugerida aplica únicamente a consumo en mesa.

- RN-078. La propina debe mantenerse separada de los ingresos por venta.

- RN-079. Las comisiones de medios de pago se registran separadamente.

- RN-080. Una reservación puede tener hora de llegada y hora objetivo de servicio distintas.

- RN-081. Las ampliaciones posteriores de un pedido pueden tener ETA independiente.

- RN-082. Cocina puede alterar el orden sugerido de preparación por criterio operativo.

- RN-083. Una lista de compras debe registrar cantidad solicitada, comprada y pendiente.

- RN-084. Registrar una compra no incrementa inventario hasta que sea recibida/ingresada.

- RN-085. Las producciones pueden registrar tiempos activos y pasivos.

- RN-086. Los productos perecederos pueden manejarse mediante lotes con fechas de caducidad.

- RN-087. El sistema debe conservar la versión histórica de receta utilizada.

- RN-088. Durante indisponibilidad online, solicitudes no confirmadas no se convierten automáticamente en pedidos.

- RN-089. La disponibilidad confirmada debe reservarse atómicamente para evitar sobreventa concurrente.

- RN-090. En solicitudes concurrentes sobre stock insuficiente, tiene prioridad la primera transacción confirmada.

- RN-091. Agregar productos al carrito no reserva stock, salvo configuración expresa.

- RN-092. La disponibilidad considera stock físico, reservado y comprometido.

- RN-093. Cancelar un pedido no preparado libera sus reservas de recursos.

- RN-094. Recursos ya consumidos no regresan al inventario solo por anulación económica.

- RN-095. La capacidad de un platillo puede depender de recursos compartidos con otros.

- RN-096. Pedidos de volumen extraordinario pueden requerir confirmación humana.

- RN-097. Confirmar un pedido requiere disponibilidad material y capacidad operativa.

- RN-098. Una solicitud online recibida durante indisponibilidad puede mantenerse pendiente si el cliente lo acepta.

- RN-099. Solicitudes pendientes deben revalidarse antes de convertirse en pedidos.

- RN-100. Recuperar conectividad no convierte automáticamente solicitudes pendientes en pedidos.

- RN-101. La inexistencia de preproducción no implica indisponibilidad si existen recursos y tiempo suficiente para producir desde cero.

- RN-102. Cuando un platillo requiere nueva producción, su ETA considera tiempo de producción, carga y preparación final.

- RN-103. Personal autorizado puede aceptar o rechazar una nueva producción sugerida.

- RN-104. La decisión de producir considera la hora y el tiempo restante de servicio.

- RN-105. No debe recomendarse una producción cuya finalización sea operativamente inconveniente respecto al cierre, salvo autorización.

- RN-106. Al suspender una producción crítica, los productos dependientes actualizan automáticamente su disponibilidad.

- RN-107. El sistema puede ofrecer alternativas que usen producciones todavía disponibles.

- RN-108. Una solicitud online no es un pedido confirmado hasta ser aceptada.

- RN-109. La atención presencial tiene prioridad operativa sobre solicitudes remotas pendientes.

- RN-110. Una solicitud remota puede mantenerse en espera por decisión del cliente.

- RN-111. Antes de aceptar una solicitud en espera se revalidan disponibilidad, carga, horario y ETA.

- RN-112. El restaurante puede suspender temporalmente pedidos online por alta demanda.

- RN-113. Una cuenta eliminada pierde acceso, pero su histórico puede permanecer archivado según política.

- RN-114. Una nueva cuenta posterior a eliminación voluntaria no recupera automáticamente preferencias ni datos visibles antiguos.

- RN-115. Una cuenta suspendida debe diferenciarse de una eliminada voluntariamente.

- RN-116. Una nueva cuenta asociada a identidad suspendida puede requerir revisión autorizada.

- RN-117. El propietario/encargado o usuarios con permiso específico pueden cerrar total o parcialmente servicios.

- RN-118. Los permisos de cierre pueden diferenciar local, recoger, online, delivery u otras capacidades.

- RN-119. Usuarios con permiso pueden marcar productos no disponibles manualmente.

- RN-120. Todo cierre, suspensión u override de producto debe registrar usuario, fecha/hora y motivo.

- RN-121. La reactivación de un producto suspendido manualmente requiere permiso correspondiente.

- RN-122. El sistema debe distinguir disponibilidad calculada de disponibilidad publicada.

- RN-123. Un producto manualmente suspendido no debe mostrarse como vendible aunque el cálculo automático indique existencias.

- RN-124. El sistema puede mantener visible internamente la causa del agotamiento o suspensión.

- RN-125. Los artículos antes de confirmar un pedido pueden agregarse o quitarse sin generar una anulación histórica formal.

- RN-126. Una vez comandado, retirar un artículo debe registrarse como anulación o cambio.

- RN-127. Una reimpresión no crea un nuevo pedido.

- RN-128. Las reimpresiones deben identificarse claramente.

- RN-129. Un fallo de impresión no implica fallo del pedido si el registro digital fue confirmado.

- RN-130. El KDS o log digital puede utilizarse como respaldo ante fallo de impresión.

- RN-131. La propina sugerida se calcula con el porcentaje configurado y la regla de redondeo definida.

- RN-132. La propina es opcional.

- RN-133. El cierre debe separar propina por método de pago.

- RN-134. Si existe comisión sobre propina de tarjeta, se calcula separadamente.

- RN-135. Un descuento excepcional debe requerir permiso.

- RN-136. Una cortesía debe quedar diferenciada de un descuento.

- RN-137. Los pagos para recoger pueden realizarse antes o al recibir, según métodos habilitados.

- RN-138. El pago del delivery externo no debe mezclarse con el ingreso del restaurante si es cobrado por terceros.

- RN-139. Las compras pueden provenir de varios proveedores para un mismo producto.

- RN-140. Una lista de compras puede completarse parcialmente.

- RN-141. El historial de compras debe conservar proveedor, cantidad, fecha y precio cuando se disponga.

- RN-142. El sistema puede sugerir proveedor, pero no comprar automáticamente.

- RN-143. Una lista de producción sugerida funciona como apoyo, no como obligación automática.

- RN-144. Las recomendaciones de productos al cliente no implican promociones.

- RN-145. Productos más pedidos pueden mostrarse como recomendación sin alterar precio.


## 12. Todos los requisitos técnicos originales

Estas condiciones también afectan el diseño de datos, transacciones, despliegue y pruebas. No se resuelven únicamente mediante un ERD.

- RT-001. Las operaciones críticas deben ser idempotentes.

- RT-002. Cada creación de pedido debe usar un identificador único de operación.

- RT-003. Cada modificación de pedido debe usar un identificador único independiente.

- RT-004. Las operaciones críticas deben ejecutarse en transacciones ACID.

- RT-005. La reserva de inventario debe usar control de concurrencia pesimista cuando exista riesgo de sobreventa.

- RT-006. El bloqueo pesimista debe mantenerse durante la transacción y no durante el tiempo de navegación del cliente.

- RT-007. Los recursos múltiples deben bloquearse en orden determinista para reducir deadlocks.

- RT-008. Los deadlocks o fallos transitorios deben admitir reintento seguro.

- RT-009. La idempotencia debe impedir que un reintento duplique pedidos, pagos o movimientos.

- RT-010. La confirmación al cliente solo se muestra después del commit exitoso.

- RT-011. Las actualizaciones concurrentes de entidades editables deben usar control de versión para evitar sobrescritura silenciosa.

- RT-012. El sistema debe diferenciar el procesamiento del pedido del trabajo de impresión.

- RT-013. Un fallo de impresión no debe reprocesar el pedido.

- RT-014. Las reimpresiones deben operar sobre el mismo pedido y quedar auditadas.

- RT-015. El sistema debe conservar logs de operaciones, errores e impresiones.

- RT-016. La operación local debe continuar ante pérdida de Internet externo si la LAN y el servidor interno continúan disponibles.

- RT-017. La caída de integraciones externas no debe detener mesas, caja, cocina, inventario ni KDS local.

- RT-018. Los canales remotos deben poder pasar a modo degradado o suspendido.

- RT-019. Las solicitudes externas pendientes no deben aceptarse retroactivamente sin revalidación.

- RT-020. Debe existir un mecanismo externo o relay si se desea informar al cliente aun cuando el servidor interno pierda conectividad a Internet.

- RT-021. Las integraciones externas deben usar timeout.

- RT-022. Las integraciones externas deben usar aislamiento de fallos/circuit breaker o mecanismo equivalente.

- RT-023. El fallo de WhatsApp, Instagram u otra integración no debe bloquear el core operacional.

- RT-024. El sistema debe soportar colas para desacoplar tareas de mensajería, IA, notificaciones e impresión cuando corresponda.

- RT-025. Debe existir backpressure o control de presión ante alta tasa de solicitudes.

- RT-026. El sistema debe soportar alta concurrencia sin sobreventa.

- RT-027. El inventario disponible debe derivarse de stock físico menos reservas/compromisos vigentes.

- RT-028. Las reservas de recursos compartidos deben ser atómicas.

- RT-029. El motor de disponibilidad debe considerar dependencias recursivas de recetas/producciones.

- RT-030. La disponibilidad potencial no debe sumar dos veces el mismo recurso compartido.

- RT-031. Los cálculos de disponibilidad y ETA deben poder invalidarse/recalcularse ante cambios de inventario, producción o carga.

- RT-032. Los clientes web, móvil y escritorio deben consumir una API coherente.

- RT-033. Los permisos deben validarse en backend, no únicamente en interfaz.

- RT-034. Todo registro público debe recibir exclusivamente privilegios de cliente.

- RT-035. Los roles operativos solo pueden asignarse desde una interfaz administrativa autorizada.

- RT-036. El LLM no debe acceder directamente a la base de datos.

- RT-037. El LLM solo puede usar herramientas/APIs permitidas.

- RT-038. El contexto de cada conversación debe estar aislado por sesión/cliente/canal.

- RT-039. El sistema debe evitar mezclar respuestas entre usuarios concurrentes.

- RT-040. El servidor LLM debe poder usar cola o batching cuando exista alta carga.

- RT-041. Consultas simples deben resolverse por lógica o plantillas cuando no sea necesario usar LLM.

- RT-042. Debe existir trazabilidad de usuario, fecha y operación para acciones sensibles.

- RT-043. La auditoría debe distinguir creación, modificación, anulación, cambio, reimpresión y corrección de pago.

- RT-044. El sistema debe conservar histórico suficiente para reconstruir la evolución de un pedido.

- RT-045. Los cambios de receta deben usar versionado.

- RT-046. Las entidades anuladas o reemplazadas no deben eliminarse físicamente si afectan auditoría o contabilidad.

- RT-047. El sistema debe separar estado operativo del pedido y estado financiero.

- RT-048. El KDS debe seguir siendo usable aunque una impresora falle.

- RT-049. La impresión debe enrutar tickets por área.

- RT-050. Una actualización parcial debe llegar solo a las áreas afectadas.

- RT-051. Una comanda completa revisada debe llevar número de revisión y aviso de sustitución.

- RT-052. El sistema debe prevenir impresiones duplicadas causadas por reintentos de red.

- RT-053. Cada trabajo de impresión debe tener identificador propio.

- RT-054. El sistema debe soportar tres contextos principales de interfaz: Cliente, Operativo y Administrativo.

- RT-055. Las funciones visibles dentro del portal operativo deben depender de permisos.

- RT-056. Un usuario con varios roles puede ver la unión de las capacidades permitidas.

- RT-057. La interfaz debe mostrar estados críticos sin depender únicamente de color.

- RT-058. El diseño de KDS debe priorizar legibilidad, tiempos y cambios.

- RT-059. El portal cliente debe usar estados de disponibilidad simplificados.

- RT-060. El portal operativo puede mostrar cifras aproximadas de disponibilidad más detalladas.

- RT-061. El portal administrativo debe permitir configuración sin hardcodear horarios, propina, tolerancias ni cierres especiales.

- RT-062. El sistema debe poder registrar lotes y fechas de caducidad.

- RT-063. El sistema debe poder sugerir FEFO para productos perecederos.

- RT-064. El sistema debe diferenciar stock físico, reservado, disponible y conteo físico.

- RT-065. Los ajustes de inventario deben quedar auditados.

- RT-066. Los datos de clientes deben contar con estados como activo, eliminado y suspendido.

- RT-067. Eliminar una cuenta debe revocar acceso y sesiones.

- RT-068. Una cuenta nueva posterior a eliminación voluntaria debe iniciar un perfil funcional nuevo.

- RT-069. Las restricciones internas deben mantenerse separadas del perfil público del cliente.

- RT-070. La asociación entre WhatsApp, Instagram y cuenta interna debe requerir identidad confirmada.

- RT-071. La arquitectura debe permitir degradación parcial de servicios.

- RT-072. El core operacional debe priorizar consistencia por encima de disponibilidad cuando exista riesgo de sobreventa o cobro duplicado.

- RT-073. El sistema debe poder escalar las tareas de IA/mensajería sin bloquear pedidos.

- RT-074. Las tareas pesadas de IA, reportes o visión no deben bloquear las transacciones críticas del restaurante.

- RT-075. El sistema debe registrar métricas de carga, latencia, errores y fallos de integraciones.

- RT-076. Deben existir mecanismos de recuperación ante reinicio del servidor sin duplicar operaciones ya confirmadas.
