# Plan de trabajo WOK Asian Food — seis integrantes

Fecha: 5 de octubre de 2026. Base revisada: `development`, commit `3611002`.

Este documento adapta el plan entregado por el equipo al código y al historial local de Git. No implica que las funciones existentes estén certificadas para producción. No se consultó el estado remoto en vivo ni se ejecutaron nuevas pruebas durante esta adaptación.

## 0. Objetivo y decisiones

Completar la web y la app móvil existentes hasta lograr una operación comprobable del restaurante, con datos reales aprobados, permisos correctos y recuperación ante fallos. La meta de salida es cero defectos críticos conocidos; no una promesa de ausencia absoluta de fallos.

Reparto vigente para este plan:

| Persona | Área | Entregable |
|---|---|---|
| Chan | Backend y contratos | Reglas y operaciones persistentes, autorizadas y probadas |
| Barrera | Web operativa | Mesas, cuentas, pedidos, cocina, servicio y reservas |
| Antony | Web cliente | Catálogo, carrito, solicitudes, reservas e historial/mensajes |
| Tomy | App móvil Cliente | Completar y validar la app Expo existente |
| Beto | Administración, pagos, caja y datos | Datos mantenibles y ventas conciliables |
| Fernando | Infraestructura común, integración y calidad | Transporte BFF, CI, ambientes, pruebas integradas y recuperación |

Este reparto sustituye, para la siguiente etapa, la asignación antigua de `docs/frontend/WORKSTREAMS.md` y `TEAM_GUIDE.md`. Fernando deberá actualizar esas referencias en un PR documental; no se modifican automáticamente con este plan.

Se conserva el diseño y la arquitectura. Primero reutilizar código y endpoints. Las rutas BFF faltantes se proponen explícitamente como ampliación de la restricción anterior que prohibía crearlas; este documento no autoriza su implementación por sí solo. Un endpoint backend nuevo exige demostrar que el contrato necesario no existe y acordar su alcance antes de desarrollarlo.

## 1. Punto de partida real

| Área | Evidencia encontrada | Consecuencia para el trabajo |
|---|---|---|
| Web | `apps/web`, Next.js App Router y módulos de dominio | Completar componentes existentes; no reconstruir interfaces |
| Backend | `apps/api`, Java/Spring, migraciones en `database/migrations` | Auditar reglas existentes antes de añadir capacidades |
| Infraestructura | Docker Compose, Nginx, PostgreSQL; Mailpit para desarrollo | Mantener configuración existente y separar ambientes |
| Cliente web | BFF de autenticación, menú, solicitudes pickup/delivery, reservas y conversaciones | Verificar recorridos y completar brechas; no empezar de cero |
| Mesas | BFF de listado, creación, apertura y cierre; apertura crea cuenta | Conectar el siguiente tramo: cuenta y pedidos |
| Reservas operativas | BFF GET pendientes y PUT decisión ya existen | No volver a crear las dos rutas del diagnóstico antiguo |
| Transporte web | `modules/client-workflows/server/endpoint.ts` admite GET/POST/PUT/DELETE y X-Request-Id opcional | Revisar incorporación de PATCH para estados de pedidos/cocina; no presentar PUT como ausente |
| Pedidos/cocina/cuentas/pagos/caja | Backend existente; no aparecen sus rutas equivalentes en el inventario BFF actual | Distinguir trabajo de conexión web de trabajo backend |
| Móvil | Expo Router, React Native, SecureStore, cliente HTTP y pantallas con llamadas reales | Completar, corregir y probar en Android físico; no crear otra app |
| CI | `.github/workflows/ci.yml` verifica web, API, móvil, dependencias, migraciones y flujo operativo | Extender la base; no describir CI como inexistente |

Evidencia previa de esta conversación: apertura/cierre de mesa de prueba contra el sistema local y 11 pruebas de mesas aprobadas. También se verificaron reservas operativas. Estas comprobaciones son acotadas: no certifican cobro, móvil ni el restaurante completo.

Referencias históricas de Git: PR #23 integra frontend/backend; #25 trata seguridad de solicitudes operativas; #27 cierre de caja; #28 inventario/producción; #29 pagos mixtos/propinas; #30 facturación/outbox; #31 QA/seguridad. La app tiene commits específicos de mensajes, delivery, direcciones e historial. Integrado en Git no equivale a probado en producción.

## 2. Trabajo individual con integración posterior

Los seis comienzan al mismo tiempo. Cada persona tiene un paquete propio, sus pruebas, sus documentos y sus PR. No existen tareas cuya responsabilidad sea «Barrera y Beto» o «todos»: cuando participan varias áreas se divide la entrega y se asigna un único dueño a cada parte.

La independencia es de avance y responsabilidad, no ausencia de dependencias técnicas. Ningún integrante puede garantizar por separado que todo el sistema funciona. Una integración pendiente no impide entregar el módulo preparado y probado, pero tampoco permite declararlo validado contra el sistema real.

### Dos estados de entrega separados

- **Trabajo individual listo:** implementación de su alcance, pruebas aisladas, documentación y PR revisable. Si falta un servicio, indicar exactamente qué pruebas usaron respuestas controladas.
- **Integración validada:** el módulo funciona con backend real y datos persistentes. Solo este estado habilita el recorrido para piloto.

No usar porcentajes que mezclen ambos estados. Registrar por tarea: pendiente, en desarrollo, lista individualmente, integración pendiente o validada.

### Cómo avanzar si alguien no ha terminado

1. Consumir el contrato que ya existe en el código, identificando el commit base. No esperar una documentación nueva para revisar una API disponible.
2. Si falta una operación, registrar método, datos requeridos, motivo y responsable del bloqueo. No inventar un contrato productivo.
3. Probar la interacción pendiente con dobles de prueba basados en contratos existentes o propuestas claramente marcadas; mantener esas respuestas fuera del flujo productivo.
4. Continuar otra tarea de su propio paquete: validaciones, accesibilidad, errores, pruebas, documentación o funciones con API disponible.
5. Cuando llegue la dependencia, retomar únicamente la conexión pendiente y ejecutar su aceptación real.

### Orden de aceptación, no orden para empezar

| Momento | Qué se acepta | Dueño |
|---|---|---|
| Desde el inicio | Inventario y tareas individuales de cada área | Cada integrante |
| Base común | Contratos verificados y transporte/configuración | Chan y Fernando, cada uno en su paquete |
| Primera venta | Operación hasta entrega | Barrera |
| Venta conciliada | Pago, caja y cierre financiero | Beto |
| Cliente web | Solicitud, respuesta y seguimiento web | Antony |
| Cliente móvil | Recorridos en dispositivo físico | Tomy |
| Piloto | Recorridos cruzados, despliegue y recuperación | Fernando coordina; cada autor corrige su módulo |

Cliente web y móvil pueden validar reservas, mensajes y consultas sin esperar al cierre financiero. No hay una cadena obligatoria Chan → Barrera → Beto → Antony → Tomy.

## 3. Chan — backend, reglas y contratos

### Orden de trabajo

1. Inventariar controladores, permisos y pruebas bajo `apps/api/src/main/java/com/wokasianfood/api` y `apps/api/src/test`.
2. Publicar una matriz por operación: método/ruta, permiso real, payload, respuesta, estados, errores, versión esperada, correlación e idempotencia.
3. Verificar primero cuentas/pedidos/cocina/pagos/caja, para desbloquear la venta en salón.
4. Revisar conversión de solicitudes Cliente a pedidos y forma autorizada de listar solicitudes pendientes. `OperationalOrderRequestController` contiene decisión POST, pero no un GET de bandeja en ese controlador: localizar otra fuente antes de declarar que falta o crearla.
5. Revisar reservas, entrega/delivery y administración según las necesidades reales de sus pantallas.
6. Corregir defectos demostrados y añadir pruebas de regresión significativas.

### Contratos que ya existen y deben reutilizarse

- `GET /api/v1/operational/accounts/{accountId}`.
- `GET/POST /api/v1/operational/orders`.
- `GET /api/v1/operational/orders/{orderId}`.
- `PATCH /api/v1/operational/orders/{orderId}/status`.
- `POST /api/v1/operational/orders/{orderId}/items`.
- `POST /api/v1/operational/order-requests/{requestId}/decision`.
- `POST /api/v1/operational/accounts/{accountId}/payments`.
- Operaciones existentes de `/api/v1/operational/cash-sessions`.
- GET pendientes y PUT decisión de reservas operativas.

No usar los ejemplos genéricos `CUSTOMER/WAITER` del plan original como contratos: en WOK hay roles como CLIENT, OPERATIONAL y ADMIN y permisos específicos como `orders:manage` y `accounts:manage`. Verificar cada operación.

No unificar solicitudes, pedidos, tickets de cocina, pagos y cuentas en un único estado. Son entidades distintas. `PENDING_REVIEW` de una solicitud no significa pedido enviado a cocina; registrar pago tampoco equivale automáticamente a cerrar mesa.

`X-Request-Id` sirve para correlación; no sustituye `Idempotency-Key`. Probar reintentos y concurrencia según cada contrato. Verificar errores por UUID/enum inválidos y coherencia de permisos ADMIN entre backend y navegación.

**Terminado:** contratos comprobados con HTTP y PostgreSQL; pruebas exitosas y negativas; ninguna regla financiera delegada al frontend.

## 4. Barrera — web operativa

Ámbito principal: `apps/web/src/modules/tables`, `orders`, componentes de cocina, cuentas, servicio y reservas, junto con sus páginas operativas.

1. Conservar mesas ya conectadas; comprobarlas visualmente con cuenta real.
2. Mostrar detalle real de cuenta y sus pedidos; eliminar dependencia de fixtures solamente en el recorrido que se esté conectando.
3. Conectar creación y ampliación de pedidos, observaciones y confirmación del servidor.
4. Conectar tickets/acciones de cocina y entrega con sus estados y versiones reales.
5. Incorporar recepción y decisión de solicitudes Cliente una vez resuelto el contrato de bandeja.
6. Revisar reservas existentes: carga, decisiones, conflicto 409, actualización y permisos. No duplicar BFF ya implementado.
7. Enlazar hacia cobro, cuyo módulo funcional será propiedad de Beto.

Barrera es dueño de la composición visual de mesa/cuenta y de su enlace a cobro. Beto es dueño de la página y formulario de pago, saldo financiero y caja. La frontera es el accountId real; ninguno modifica el componente del otro. El enlace solo se habilita cuando el destino esté integrado.

**Terminado:** un empleado atiende una mesa hasta entrega usando la web y ve cambios persistentes después de recargar. Pruebas de doble envío, conflicto y cierre bloqueado cuando corresponde.

## 5. Antony — web Cliente

Ámbito: módulos Cliente existentes, catálogo, carrito, seguimiento, reservas, delivery y conversaciones; BFF específico de esas funciones.

1. Revisar las conexiones que ya están implementadas y conservarlas.
2. Validar precios/disponibilidad reales y recalcular confirmación desde backend.
3. Probar historial y detalle para el usuario autenticado, incluyendo aislamiento entre dos clientes.
4. Distinguir solicitud recibida, solicitud aceptada y pedido operativo. No mostrar preparación, cobro o despacho que el backend no haya confirmado.
5. Completar actualización visible de decisiones de reservas y solicitudes; evitar mensajes antiguos que contradigan el estado actual.
6. Verificar mensajes y respuestas entre cliente y personal.
7. Revisar sesión vencida, errores de red y reintentos conservando la misma clave cuando la operación lo requiera.

**Terminado:** el cliente web completa los recorridos acordados y el personal ve los mismos registros, sin fixtures en las funciones entregadas.

## 6. Tomy — app móvil Cliente

Base obligatoria: `apps/mobile`; no iniciar otra aplicación.

Código existente que debe revisar:

- `src/lib/api.ts`: transporte HTTP y tipos.
- `src/providers/session-provider.tsx`: sesión, SecureStore y renovación.
- `app/(tabs)/menu.tsx`, `orders.tsx`, `reservations.tsx`, `account.tsx`.
- `app/delivery.tsx`, `messages.tsx`, `addresses.tsx`.

### Orden

1. Arrancar la app existente y configurar una URL del backend accesible desde el teléfono. `localhost` en el teléfono no apunta al ordenador.
2. Probar login, restauración, renovación concurrente, logout y aislamiento de datos al cambiar de usuario.
3. Verificar menú, carrito y solicitudes pickup existentes.
4. Verificar delivery, direcciones, reservas, mensajes e historial ya presentes.
5. Corregir manejo de red: el transporte actual afirma que una solicitud no se envió cuando falla fetch; una respuesta perdida no permite asegurar eso. Mostrar resultado incierto y resolverlo sin duplicar la operación.
6. Revisar límites de tiempo, cancelación de solicitudes y reintentos de mutaciones. No sustituir SecureStore por almacenamiento inseguro.
7. Incorporar pruebas automatizadas apropiadas: el package actual tiene lint y typecheck, pero no un script de pruebas funcionales.
8. Probar Android físico, suspensión/reapertura, tamaños de pantalla, sesión vencida y red interrumpida; generar una versión instalable de prueba y documentar distribución.

La app consume la API con bearer; no debe depender del flujo de cookies HttpOnly del BFF web. Las pruebas de sesión nativa no se sustituyen por abrir Expo en navegador.

**Terminado:** recorridos Cliente demostrados en dispositivo físico, con evidencia y sin duplicación por reintento.

## 7. Beto — administración, datos, pagos y caja

1. Revisar componentes administrativos existentes y separar fixtures de conexiones reales.
2. Recopilar menú, precios GTQ, imágenes autorizadas, mesas, personal, horarios, cobertura y métodos de pago. Registrar quién aprobó cada conjunto.
3. Mapear pantallas a endpoints administrativos reales; informar operaciones sin contrato antes de implementarlas.
4. Conectar cuenta, saldo, pagos y caja existentes. Verificar pagos mixtos y propinas incorporados en Git antes de ofrecerlos al usuario.
5. Probar apertura de caja, movimientos, cobro, conciliación y cierre con diferencias. Acordar responsable de cada acción y permisos.
6. Revisar inventario/producción ya incorporados; habilitarlos según alcance del restaurante, sin duplicar cálculo de existencias en UI.
7. Revisar facturación/outbox. Un documento o proveedor de prueba no acredita emisión fiscal real; separar comprobante interno de integración fiscal productiva.

No presentar una preferencia de pago online como un cobro online realizado. Pasarela, facturación externa, despacho y notificaciones deben verificarse por separado y no asumirse por la presencia de una pantalla.

Cargar datos mediante mecanismos controlados y repetibles, con respaldo y validación. Las migraciones/seeds revisados son legítimos; cambiar manualmente estados para simular una venta exitosa no lo es. No cargar clientes reales en fixtures ni secretos en Git.

**Terminado:** se puede mantener información y conciliar una venta con cuenta, pago y caja. Cada diferencia tiene explicación verificable.

## 8. Fernando — base común, integración y operación

1. Mantener CI existente y coordinar la actualización de documentos desfasados.
2. Ser dueño de cambios al transporte común BFF, autenticación compartida, navegación transversal y configuración. Los responsables de módulo implementan sus rutas BFF específicas con revisión de Fernando.
3. Resolver conexiones faltantes de cuentas/pedidos/cocina/pagos/caja mediante rutas limitadas a los contratos necesarios. No crear un proxy arbitrario que permita cualquier URL.
4. Verificar PATCH cuando haga falta, conservación de códigos HTTP y reenvío controlado de headers. Mantener tokens de web en servidor.
5. Preparar ambiente de pruebas separado con datos identificados; no reutilizar el volumen local del restaurante para pruebas destructivas.
6. Extender CI con pruebas de navegador y móvil cuando se incorporen. El workflow inspeccionado no contiene despliegue automático a staging: es trabajo por planificar, no una capacidad comprobada.
7. Coordinar revisión de PR, migraciones, dependencias compartidas, observabilidad y publicación.
8. Probar backup y restauración en una base aislada. No borrar el ambiente de trabajo para demostrar recuperación.

Fernando no asume todas las funciones faltantes. Devuelve cada defecto al responsable del módulo y coordina las dependencias.

## 8A. Paquetes individuales ampliados

Los siguientes paquetes concretan el alcance anterior. Cada persona mantiene su propia lista y evidencia; Fernando no completa las funciones que otro dejó pendientes.

### Chan: paquete API y consistencia de datos

**Propiedad:** código backend, pruebas Java y migraciones de negocio. No modifica interfaces web/móvil. Los demás reportan necesidades backend mediante tareas concretas.

**Tareas propias:**

1. Crear inventario de controladores y clasificar implementación, pruebas y limitaciones por dominio.
2. Documentar contratos reales y ejemplos sanitizados de solicitudes/respuestas, sin credenciales.
3. Comprobar autenticación, renovación, revocación y permisos de las operaciones críticas.
4. Auditar transiciones por entidad: solicitud, pedido, ticket, cuenta, reserva, pago y caja.
5. Verificar transacciones: un error no debe dejar pedido sin sus líneas, pago duplicado o historial incompatible.
6. Probar concurrencia e idempotencia por endpoint; registrar qué clave/versionado usa cada uno.
7. Revisar validaciones de importes, cantidades, fechas, identificadores y productos disponibles.
8. Verificar que cobro, cancelación y cierre respeten las reglas existentes; resolver inconsistencias demostradas.
9. Comprobar trazabilidad e historial sin registrar tokens ni datos sensibles innecesarios.
10. Revisar migraciones desde base limpia y actualización de base existente en un ambiente aislado.
11. Mantener pruebas de regresión y documentación de cambios de contrato.
12. Entregar reporte de capacidades ausentes con propuesta mínima; implementar únicamente el alcance aprobado.

**Entregas individuales:** matriz de API, pruebas ejecutables de reglas críticas, correcciones con regresión y guía de consumo.

**Puede demostrar sin interfaces:** peticiones HTTP contra API/base aislada, permisos, persistencia, rollback y conflictos.

**Si espera una definición del restaurante:** no inventa la regla; continúa auditando contratos y probando las reglas ya definidas.

### Barrera: paquete operación del restaurante

**Propiedad:** módulos/páginas operativas de mesas, cuentas, pedidos, cocina, servicio, reservas y recepción operativa de solicitudes. También sus rutas BFF específicas, cuando estén autorizadas. Excluye pagos, caja y administración.

**Tareas propias:**

1. Inventariar pantallas operativas, acciones disponibles y uso de datos simulados.
2. Verificar mapa/lista de mesas, filtros, estados, capacidad, apertura y consulta de cuenta.
3. Preparar pedido con cantidades, observaciones, productos reales y resumen antes de envío.
4. Conectar envío y ampliación de pedidos; conservar el intento cuando la respuesta sea incierta.
5. Construir consulta de detalle e historial disponible sin inventar eventos.
6. Conectar cola de cocina, toma de ticket, preparación y estado listo según API.
7. Conectar servicio/entrega y actualización después de acciones exitosas o conflictos.
8. Completar bandeja de solicitudes de clientes cuando exista el contrato de consulta; separar aceptación de entrega.
9. Verificar reservas operativas y mostrar actualización ante un conflicto de versión.
10. Resolver estados de carga, vacío, acceso denegado, error de red y datos actualizados por otro empleado.
11. Comprobar uso con teclado, tableta y pantallas pequeñas; conservar componentes y estilos existentes.
12. Implementar pruebas de sus componentes/BFF y un guion operativo por pantalla.

**Entregas individuales:** pantallas operativas conectables/conectadas, pruebas por acción, inventario de endpoints usados y guion de atención.

**Puede demostrar sin Beto:** mesa → cuenta → pedido → cocina → entrega. El pago queda explícitamente fuera de esta aceptación.

**Si falta API/transporte:** continúa en otras pantallas y pruebas de interacción. No agrega pagos ni modifica backend para evitar la espera.

### Antony: paquete experiencia web del cliente

**Propiedad:** páginas y módulos Cliente; rutas BFF exclusivas del cliente. No modifica móvil ni módulos operativos. En transportes compartidos comunica la necesidad a Fernando.

**Tareas propias:**

1. Inventariar recorridos existentes y detectar navegación hacia vistas todavía simuladas.
2. Revisar catálogo, categorías, detalle, imágenes alternativas, precio y disponibilidad.
3. Verificar carrito: cantidades, eliminación, subtotal informativo y separación entre usuarios cuando corresponda.
4. Validar checkout de pickup y delivery con formularios, errores de campos y confirmación real.
5. Mantener claves de reintento cuando aplique; impedir envíos concurrentes del mismo formulario.
6. Completar historial y detalle de solicitudes, distinguiendo estados de solicitud y pedido.
7. Revisar creación, consulta y cancelación de reservas con respuesta del restaurante.
8. Probar conversaciones, envío de mensajes y aislamiento de información por usuario.
9. Revisar formularios/perfil ya existentes y conectar solo operaciones con contrato comprobado.
10. Probar navegación autenticada, expiración, regreso al login y cierre de sesión usando la infraestructura existente.
11. Resolver experiencia responsive, teclado, foco, mensajes de error y confirmación.
12. Entregar pruebas propias y un guion completo del cliente web.

**Entregas individuales:** recorrido web del cliente, pruebas de componentes y BFF propio, matriz de errores y guía de validación.

**Puede demostrar sin Barrera:** crear/consultar solicitudes, reservas y mensajes contra APIs disponibles. Las decisiones del personal se simulan solo en pruebas aisladas hasta poder validar el recorrido cruzado.

**Si espera recepción operativa:** trabaja en historial, formularios, accesibilidad, privacidad y recuperación de errores; no desarrolla la pantalla del personal.

### Tomy: paquete móvil independiente

**Propiedad:** `apps/mobile` y sus pruebas/documentación. Consume API directamente con la sesión nativa existente. No requiere terminar ninguna pantalla web.

**Tareas propias:**

1. Levantar Expo y registrar versión, dispositivo y configuración utilizada sin secretos.
2. Auditar rutas, componentes y llamadas ya implementadas; conservar funcionalidades existentes.
3. Validar registro/verificación/recuperación disponibles y login con tipo de cliente móvil.
4. Probar almacenamiento seguro, restauración y rotación de sesión; evitar carreras entre renovaciones.
5. Revisar catálogo e imágenes y preparar manejo de carga/error sin conexión.
6. Verificar carrito, confirmación e idempotencia de solicitudes.
7. Completar detalle, historial y actualización de estados disponibles.
8. Validar direcciones y delivery, especialmente separación de datos al cambiar de cuenta.
9. Probar reservas y mensajes con sus contratos reales.
10. Resolver resultado incierto de una petición, timeout y recuperación de conectividad sin confirmar operaciones no verificadas.
11. Probar suspensión/reapertura, teclado, navegación atrás, tamaños de pantalla y pulsaciones repetidas.
12. Incorporar pruebas del transporte/sesión y flujos prioritarios; documentar ejecución.
13. Preparar una versión instalable de prueba, procedimiento de configuración y evidencia Android física.
14. Registrar límites de plataforma y alcance de distribución; no dar por publicada la app por generar un paquete.

**Entregas individuales:** app existente completada, paquete instalable de prueba, pruebas y matriz de dispositivos/casos.

**Puede demostrar sin Antony:** todos sus recorridos disponibles contra API. No reutiliza la web como sustituto de las pruebas nativas.

**Si espera un endpoint:** continúa con sesión, almacenamiento, conectividad, diseño adaptable y otras pantallas. Para pruebas usa respuestas controladas, nunca un supuesto éxito productivo.

### Beto: paquete administración y control financiero

**Propiedad:** páginas/módulos administrativos, pagos, caja, inventario/producción si se incluyen y sus BFF específicos. La ubicación de una pantalla en el menú operativo no cambia esta propiedad. Backend financiero pertenece a Chan.

**Tareas propias:**

1. Inventariar administración y separar vistas informativas de acciones aún simuladas.
2. Elaborar plantillas para recopilar datos reales y registrar su aprobación.
3. Conectar mantenimiento de catálogo, precios y disponibilidad según contratos existentes.
4. Revisar gestión de usuarios/roles sin inventar privilegios ni permitir autoescalamiento.
5. Construir consulta financiera de cuenta: total, pagos, propinas y saldo desde backend.
6. Conectar registro de pago y evitar reintentos duplicados; diferenciar pago fallido de resultado desconocido.
7. Verificar pagos parciales/mixtos únicamente si el contrato los admite.
8. Conectar apertura de caja, movimientos, consulta y cierre/reconciliación.
9. Presentar diferencias y responsable de movimientos; no corregir balances desde el navegador.
10. Conectar consultas/reportes respaldados por datos reales, identificando período y origen.
11. Revisar inventario, unidades, movimientos y producción existentes si entran al piloto.
12. Separar comprobantes internos, facturación de prueba y emisión fiscal real.
13. Preparar carga/importación controlada de datos mediante mecanismos aprobados; no ejecutar cambios manuales de estado para fabricar una venta.
14. Entregar pruebas de interfaces financieras y guiones de conciliación.

**Entregas individuales:** administración conectada por alcance, paquete de datos aprobado, flujo de cobro/caja y pruebas de importes/errores.

**Puede demostrar sin Barrera:** usar una cuenta de prueba creada mediante APIs existentes y registrar/consultar pagos y caja. No necesita esperar a que la UI de pedidos esté terminada.

**Si faltan datos reales:** completa plantilla, validaciones y ensayo de carga con datos identificados en base de pruebas. Si falta regla financiera, trabaja en otras acciones sin inventarla.

### Fernando: paquete plataforma y calidad

**Propiedad:** transporte compartido BFF, autenticación web común, configuración transversal, CI, infraestructura de pruebas y despliegue. No es dueño de las rutas particulares ni pantallas de todos los módulos.

**Tareas propias:**

1. Verificar instalación reproducible y arranque con la configuración del repositorio.
2. Inventariar variables necesarias y documentar su propósito sin publicar valores sensibles.
3. Preparar entornos separados y datos de prueba que no afecten al restaurante.
4. Probar transporte común: métodos necesarios, autenticación, origen, headers, timeout y códigos HTTP.
5. Ampliar el transporte solo para necesidades verificadas y mantener pruebas de compatibilidad con rutas existentes.
6. Revisar infraestructura de sesión/navegación compartida y coherencia de roles con API.
7. Mantener CI existente y facilitar reportes legibles de fallos y pruebas omitidas.
8. Preparar pruebas de navegador con recorridos actuales; extenderlas conforme lleguen módulos.
9. Documentar logs, salud de servicios y diagnóstico sin filtrar credenciales.
10. Implementar/verificar procedimiento de backup y restauración en un entorno separado.
11. Preparar despliegue de prueba y reversión compatible con migraciones; no asumir que revertir código revierte datos.
12. Mantener matriz de integración y actualizar guías antiguas de responsabilidades.
13. Revisar compatibilidad entre PR y coordinar integración sin completar funciones de otros.
14. Entregar manual de despliegue, recuperación, soporte y aceptación final.

**Entregas individuales:** CI/plataforma verificables, pruebas del transporte, entorno de prueba y procedimiento de restauración demostrado.

**Puede demostrar sin nuevos módulos:** arranque, salud, CI actual, pruebas de sesión/transporte, respaldo y restauración de datos existentes.

**Si espera un PR:** continúa con infraestructura y pruebas actuales. El recorrido final pendiente se registra como dependencia, no como falta de avance en toda su área.

## 8B. Fronteras para evitar trabajo compartido o duplicado

| Elemento | Único dueño | Qué hacen los demás |
|---|---|---|
| Backend y migraciones de negocio | Chan | Reportan necesidad y consumen contratos |
| Mesas, cuenta operativa, pedidos, cocina y reservas del personal | Barrera | Consumen identificadores y estados |
| Pago, saldo financiero, caja y administración | Beto | Navegan con accountId; no recalculan reglas |
| Web Cliente | Antony | No editan sus pantallas |
| App móvil | Tomy | Aportan contratos/evidencia, no duplican su implementación |
| Transporte web, sesión común, CI e infraestructura | Fernando | Proponen cambios concretos y prueban sus consumidores |
| BFF de un dominio | Dueño del dominio web | Fernando revisa compatibilidad y seguridad |
| BFF de conversaciones compartido entre scopes | Antony | Barrera solicita cambios del scope operativo; no modifica el archivo simultáneamente |
| Catálogo/contratos web compartidos | Antony para consumo público; Beto para gestión administrativa | Cambios de archivo compartido se asignan previamente a uno solo |
| Dependencias raíz/lockfile y navegación transversal | Fernando coordina la modificación | Cada persona entrega su necesidad, sin cambios simultáneos |

La propiedad se asigna a archivos concretos al comenzar cada tarea. Si un archivo contiene responsabilidades de dos áreas, se acuerda un único editor para ese PR; no se hace una refactorización solo para repartirlo.

### Formato individual de entrega

Cada integrante mantiene una ficha por tarea con: objetivo, archivos propios, contrato/commit usado, pruebas ejecutadas, evidencia, dependencia pendiente, siguiente tarea independiente y criterio de aceptación.

Una dependencia se registra así: «Barrera: integración PATCH pendiente de transporte común; componente y pruebas de conflicto listos; siguiente tarea: reservas». No como «Barrera detenido hasta que Fernando termine».

No fijar avance por número de pantallas ni por cantidad de commits. Evaluar entregas comprobables de cada paquete y, por separado, aceptación integrada.

## 9. Entregas pequeñas y aceptación

| Entrega | Responsable principal | Prueba de aceptación |
|---|---|---|
| E0 Inventario | Cada integrante entrega el suyo; Fernando consolida | Función, archivo, endpoint, estado y evidencia; pendientes explícitos |
| E1 Contratos | Chan; transporte en entrega separada de Fernando | Operaciones del siguiente tramo probadas y consumibles |
| E2 Mesa/cuenta/pedido | Barrera | Abrir mesa, enviar pedido, recargar y ver datos persistentes |
| E3 Cocina/servicio | Barrera; defectos backend se asignan a Chan | Tomar ticket, preparar y entregar; rechazar transición inválida |
| E4 Pago/caja/cierre | Beto; Barrera entrega aparte el enlace desde cuenta | Cobrar una sola vez, conciliar y cerrar conforme a reglas |
| E5 Cliente web | Antony; recepción operativa es entrega separada de Barrera | Solicitud visible al personal y respuesta visible al cliente |
| E6 Cliente móvil | Tomy | Mismos registros y reglas desde Android físico, con interrupciones |
| E7 Piloto | Todos | Personal acepta los recorridos, sin defectos críticos abiertos |

E5 y E6 pueden desarrollarse en paralelo con E2–E4; su aceptación completa depende de la recepción operativa. Reservas y mensajes pueden validarse como recorridos independientes sin esperar a cobro.

## 10. Pruebas y comandos de referencia

Ejecutar desde la raíz real `wok_asian_food`, no desde la carpeta contenedora. Estos comandos son para ejecución posterior; no fueron ejecutados al redactar este plan.

```powershell
npm ci
npm run lint --workspace @wok/web
npm run typecheck --workspace @wok/web
npm run test --workspace @wok/web
npm run build --workspace @wok/web
npm run lint --workspace mobile
npm run typecheck --workspace mobile
node --test .github/scripts/audit-production-dependencies.test.mjs
node .github/scripts/audit-production-dependencies.mjs
```

Con Java 21, Maven y Docker disponibles, desde `apps/api`:

```powershell
mvn --batch-mode --no-transfer-progress verify
```

Entorno local conforme a la configuración existente:

```powershell
docker compose -f docker-compose.yml -f infra/compose.dev.yml --profile dev up -d --build
```

Reutilizar `OperationalFlowIntegrationTest`, pruebas SQL de `database/tests`, y `.github/scripts/operational-flow-smoke.sh`. Este último se ejecuta en entorno Bash y base aislada siguiendo CI; no trasladar su limpieza de volúmenes al ambiente del restaurante. Verificar que los tests con Docker realmente se ejecutaron y no quedaron omitidos.

Añadir al conjunto de aceptación: rol incorrecto, sesión vencida, datos inválidos, dos operadores simultáneos, respuesta perdida después de guardar, doble clic, producto no disponible, saldo pendiente, aislamiento entre clientes y restauración de datos. No provocar caída de BD sobre producción.

## 11. Git y coordinación

Mantener el patrón observado: ramas pequeñas y PR hacia `development`; entrega posterior mediante PR hacia `production`. Antes de empezar, actualizar referencias y revisar cambios locales sin descartarlos.

Ejemplos de futuras ramas por tarea:

- `feature/chan-order-contracts`
- `feature/barrera-table-orders`
- `feature/antony-client-tracking`
- `feature/tomy-mobile-reliability`
- `feature/beto-payments-cash`
- `feature/fernando-bff-transport`

No reutilizar una rama antigua sin comparar su base con development. No cambiar contratos unilateralmente; registrar consumidores afectados. Un solo responsable modifica el transporte compartido, lockfile o navegación común por vez, coordinando necesidades de los demás.

Cada PR incluye problema, alcance, endpoints utilizados, evidencia de pruebas, datos/migraciones afectados, pendientes y revisión de otra persona. Registrar resultados en `docs/progress` del área correspondiente, sin duplicar chats ni guardar credenciales.

## 12. Salida a piloto

Requisitos: datos aprobados, recorridos reales aceptados, permisos comprobados, sin defectos críticos abiertos, respaldo restaurado con éxito, registro de errores, responsable de soporte e instrucciones para atender durante una interrupción.

Pendientes que requieren decisión del restaurante: alcance de inventario, facturación fiscal, pasarela online, procedimiento real de reparto, dispositivos objetivo, método de distribución móvil y fecha del piloto. No asignar fechas cerradas hasta conocer disponibilidad del equipo y resultados de E0.

Se entrega una versión utilizable por etapas y con límites explícitos. Una pantalla existente, un PR integrado o una prueba unitaria aprobada no sustituyen una venta real comprobada de principio a fin.
