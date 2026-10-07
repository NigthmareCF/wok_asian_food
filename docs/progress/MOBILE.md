# Progreso de planificación móvil

## 2026-10-07 — Calendario pickup/delivery desde el backend

- La app consulta `GET /api/v1/public/service-hours` para la fecha elegida en Pickup y Delivery; muestra cierre, horario semanal o excepción diaria y vuelve a consultar al mantener la pantalla enfocada.
- Si el horario recibido marca la fecha cerrada o la hora fuera de ventana, la app detiene el envío y explica el intervalo publicado. Si el calendario no carga, mantiene visible la limitación y permite que el backend decida; el servidor siempre revalida al crear/aceptar la solicitud.
- Pruebas Vitest: 50/50; ESLint, TypeScript y export Expo para Android/Web pasan (17 rutas web). La exportación confirma bundle/rutas, no APK ni prueba física. El endpoint se incorporó en `feature/backend-capacity-order-lifecycle` (`ad37bb1`), todavía debe integrarse para que un entorno compartido lo tenga disponible.

## 2026-10-07 — Revalidación de la rama Expo Cliente

- En ese punto se comprobó `feature/mobile-shell` sincronizada con `origin/feature/mobile-shell` (HEAD `6780dda`), sin cambios de aplicación pendientes.
- Vitest: 43/43; ESLint y TypeScript pasan. `npx expo export --platform android` empaqueta Android correctamente; export Web genera 17 rutas estáticas. Estos exports no producen APK instalable ni sustituyen pruebas físicas.
- No se cambió código móvil en esta continuación: catálogo, flujos Cliente, almacenamiento seguro, seguimiento y validaciones ya están presentes en esta punta. Siguen pendientes IDs de OAuth reales, validación Android/iOS instalada y conexión E2E contra el entorno integrado.

## 2026-10-05 — Compatibilidad de catálogo real y productos +18

- El tipo `PublicMenuItem` reconoce slug estable y `ageRestricted` del contrato público. Menú, preorden de reserva y pickup/delivery reutilizan el mismo catálogo backend; el Cliente muestra un aviso +18 sin inventar una verificación legal ni sustituir validación server-side.
- El seed de productos y precios se agregó a la rama backend `feature/backend-capacity-order-lifecycle`; debe integrarse y ejecutarse manualmente en base de desarrollo. No se duplican productos dentro del paquete móvil.
- Recetas/cantidades, stock real, sabores sujetos a disponibilidad y política de confirmación de edad siguen pendientes. La marca de UI es informativa, no una barrera de autorización.

## 2026-10-05 — Borradores de reserva aislados por cuenta

- SecureStore ahora guarda cada borrador de reserva bajo una clave derivada de SHA-256 del correo normalizado; completar o borrar un borrador de una cuenta no sobreescribe ni elimina el de otra cuenta. Las claves de reintento conservan su formato anterior para no perder operaciones idempotentes pendientes.
- Los borradores legacy se migran sólo al coincidir con el correo propietario del contenido; se preservan si pertenecen a otra cuenta y se elimina el registro legacy inválido. Email no aparece en la clave.
- Vitest 43/43, ESLint, TypeScript y export Android/Web (17 rutas) aprobados.

## 2026-10-05 — Polling sólo en pantalla enfocada y app activa

- Seguimiento de pedidos, solicitudes de cancelación, delivery, reservas pendientes y mensajes comparten `useFocusedPolling`: el intervalo se detiene al cambiar de pantalla, mandar la app al fondo o perder conexión, y se activa sólo si la vista enfocada sigue necesitando actualización.
- Se conserva la carga inicial y actualización manual. Este cambio evita llamadas periódicas cuando el usuario no está viendo esa vista; no habilita confirmaciones offline.
- Verificación: Vitest 41/41, ESLint, TypeScript y `npx expo export --platform android --platform web` (17 rutas).

## 2026-10-05 — Preorden de productos en solicitud de reserva

- La pantalla de reservas carga el menú público al activar preorden, permite seleccionar productos y opciones requeridas, conserva el borrador en SecureStore y envía líneas con cantidad/modificadores bajo la misma clave idempotente de reserva. El historial muestra los snapshots pedidos y sus opciones.
- No presenta el subtotal del cliente como autoridad, ni confirma platillos o descuenta inventario. El backend valida de nuevo el catálogo y el personal revisa snapshots desde la agenda Operativa.
- Verificación móvil: Vitest 38/38, ESLint, TypeScript y `expo export --platform android --platform web` pasaron. Los bundles prueban compilación/rutas, no instalación ni prueba física de dispositivos.

## 2026-10-05 — Google OIDC móvil (base nativa)

- `Mi cuenta` inicia Google con Android Credential Manager/iOS Sign-In mediante Nitro, solicita un nonce de un solo uso al backend, envía el ID token y el nonce a WOK y guarda sólo los tokens WOK (refresh en SecureStore, access en memoria). La sesión se registra como `MOBILE`; para cuentas nuevas se inicia primero con credenciales WOK y después se vincula Google en una sesión autenticada.
- Configuración OAuth externa por `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` y `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`; no se añadió ningún ID real. Google permanece deshabilitado sin ambos valores. Expo Go no incluye el módulo nativo; se necesita development build, SHA-1 registrado para Android y clientes OAuth válidos. El botón muestra un error claro si se intenta sin esa configuración.
- Se conserva explícitamente `npm run start --workspace mobile` en modo Expo Go para el resto de la app y se agrega `start:dev-client` para una instalación nativa de desarrollo.
- El contrato backend cambia el nonce de Base64URL a 64 caracteres hexadecimales para el SDK nativo; el servidor guarda sólo el hash, consume el nonce una sola vez y compara exactamente el claim OIDC. El endpoint de vinculación exige sesión WOK activa, correo verificado igual en ambas cuentas, evita asociar un `sub` a otra cuenta y registra evento de seguridad.
- Verificación móvil: lint, TypeScript, Vitest 33/33 y configuración Expo con/sin variables OAuth aprobados. Pendiente prueba instalada en Android/iOS y configurar clientes OAuth reales.

## 2026-10-05 — Disponibilidad estimada en pickup y delivery

- Menú pickup y delivery envían al backend las cantidades y opciones elegidas para `POST /api/v1/public/menu/availability`; los cambios del carrito invalidan el resultado anterior y las respuestas tardías no pisan una selección más nueva.
- La app diferencia existencias estimadas, insuficientes y productos sin seguimiento. Explica que la consulta no aparta inventario; el equipo aún debe aceptar la solicitud y el servidor vuelve a validar stock.
- Verificación: lint, TypeScript y export Expo Android/Web aprobados. Prueba de integración de PostgreSQL valida endpoint público, recetas, opciones, reservas activas, no filtración de cantidades y ninguna escritura de stock.

## 2026-10-05 — Modificadores configurables en pickup y delivery

- El catálogo móvil presenta grupos/opciones publicados por la API, obliga a satisfacer mínimo/máximo antes de agregar el platillo y calcula el precio estimado con los deltas seleccionados. Pickup y delivery persisten carrito y opciones localmente en SecureStore; el payload de solicitud incluye los IDs ordenados dentro del mismo intento idempotente.
- Pickup y delivery resumen las opciones seleccionadas; los detalles de solicitudes muestran snapshots de grupo, opción y precio devueltos por el servidor. Un éxito limpia carrito/opciones. La app nunca es autoridad para el importe final ni para disponibilidad.
- Verificación: Vitest 30/30, ESLint, TypeScript y `expo export` Android/Web pasan. Las exportaciones verifican bundles/rutas, no una instalación en dispositivo. El contrato integrado API/PostgreSQL fue validado en `feature/backend-capacity-order-lifecycle`: Flyway V1–V35 desde cero y suite backend completa 199/199 con PostgreSQL 18/Testcontainers.

## 2026-10-04 — Vista unificada de pedidos Cliente

- La pestaña Pedidos ahora consulta el historial propio de pickup y delivery junto al tracking pickup/delivery; muestra estado de solicitud, ETA de cocina y estado/marcas de tiempo del despacho. Las solicitudes delivery activas se actualizan cada 30 segundos, y pueden cancelarse mientras siguen pendientes de revisión.
- El formulario sigue en la ruta Delivery; solicitud online de cobro, pedido aceptado y pago confirmado permanecen distinguidos. No se expone motivo interno del repartidor ni se afirma que una solicitud pendiente ya sea un pedido.
- Verificación: Vitest 8/8, ESLint, TypeScript y Expo export Android/Web pasan. Los exports no sustituyen pruebas en dispositivo físico ni integración E2E.

## 2026-10-04 — Seguimiento del reparto delivery

- El historial Cliente consume `dispatchStatus`, `assignedAt`, `dispatchedAt` y `deliveredAt` de la solicitud propia. La pantalla comunica preparación, espera/asignación, salida, incidencias, entrega y cancelación con hora local del restaurante; no presenta como entregado hasta que la API confirma ese estado.
- La app sólo muestra que existe una incidencia operativa, nunca el motivo interno ni datos de contacto del repartidor. El flujo sigue ligado al historial autenticado del usuario.
- Verificación: Vitest 8/8, ESLint, TypeScript y exportaciones Expo Android/Web pasan. Las exportaciones generan bundles y rutas, no son builds instalables ni pruebas físicas.

## 2026-10-02 — Reintento idempotente de reservas después de cerrar la app

- Los intentos de reserva se guardan antes del POST en SecureStore, ligados al correo de sesión (la llave de almacenamiento usa su SHA-256), UUID y payload exacto. Al reiniciar, sólo se reutiliza la clave para la misma cuenta/cuerpo; cambiar cuenta o payload crea otra clave, y registros inválidos/vencidos se descartan.
- Si SecureStore falla, el POST no se envía. Un envío con resultado de red incierto conserva el key para reintento; la respuesta del servidor borra el intento. Cambiar de cuenta remonta el formulario para limpiar datos anteriores.
- Verificación: tests nuevos de reuso por owner/payload y validación/expiración, suite móvil 5/5, ESLint y TypeScript pasan; Expo Android/Web export en ejecución.

## 2026-10-02 — UUID criptográficos para reintentos Cliente

- Pickup y reservas ahora usan `expo-crypto` `randomUUID()` para sus claves de idempotencia, alineados con delivery y mensajería. El mismo intento conserva la clave y payload para repetirlo; nuevas solicitudes generan otra clave.
- Verificación: 3/3 tests Vitest, ESLint, TypeScript y exportaciones Expo Android/Web aprobadas. Las exportaciones no son builds instalables ni pruebas de dispositivo.

## 2026-10-02 — Mostrar motivo de rechazo en pickup y delivery

- Los contratos mobile `PickupRequestReceipt` y `DeliveryRequestReceipt` incluyen el motivo opcional del servidor. Los historiales muestran motivo con aviso de error sólo en solicitudes `REJECTED`, junto al texto de estado actualizado.
- No se interpreta el rechazo como un pedido ni como un pago; los estados restantes no muestran decisionReason.
- Verificación: 3/3 tests Vitest, ESLint y TypeScript pasan; `expo export` para Android y Web completa correctamente. Los exports no son paquetes instalables ni pruebas en dispositivos.

## 2026-10-02 — Revalidación limpia de la app Cliente

- Se creó un checkout temporal limpio de `feature/mobile-shell` y se instalaron las dependencias con `npm ci --workspace mobile --offline --include-workspace-root=false`; npm reportó 0 vulnerabilidades para esa instalación del workspace.
- Pasaron `npm run test --workspace mobile` (3/3), `npm run lint --workspace mobile` y `npm run typecheck --workspace mobile`.
- `npx expo export --platform android` y `npx expo export --platform web` pasaron ejecutándolos desde `apps/mobile`; web publicó rutas `/menu`, `/orders`, `/account`, `/delivery`, `/messages`, `/addresses` y `/reservations`. Estos exports validan bundles/rutas, no build instalable, E2E con backend ni pruebas físicas.
- Un primer intento desde la raíz falló porque Expo resolvió `AppEntry` de otro workspace; repetir desde `apps/mobile` corrigió el directorio de ejecución y ambos exports pasaron.

## 2026-10-01 — Aislamiento de refresh tokens al cambiar de sesión

- La coordinación de renovaciones ahora comparte una solicitud sólo cuando usa el mismo refresh token; dos cuentas/sesiones distintas ya no pueden recibir entre sí el resultado de la renovación en vuelo.
- Las operaciones de lectura autenticada capturan una generación de sesión. Si el Cliente cierra sesión o inicia otra, una respuesta atrasada no puede reactivar la sesión anterior ni devolver datos al flujo nuevo.
- Las escrituras y borrados de refresh token/correo en Expo SecureStore se serializan y se descartan si pertenecen a una generación obsoleta. Logout también queda protegido contra una finalización tardía que borre una sesión iniciada después.
- Se agregaron pruebas unitarias del coordinador de refresh (misma cuenta comparte renovación, tokens de cuentas distintas no se cruzan, caché se invalida al cerrar sesión) y de la cola de SecureStore (orden serial, recuperación tras rechazo). Vitest queda declarado en el workspace móvil.
- Verificación: 3/3 pruebas unitarias, ESLint móvil y TypeScript pasaron; `npx expo export --platform android` y `--platform web` pasaron. La exportación confirma bundles y rutas, no reemplaza pruebas instaladas en dispositivo.

## 2026-09-30 — Libreta de direcciones y detalle delivery

- Mi cuenta permite listar, crear, editar y eliminar las direcciones propias mediante `/api/v1/client/addresses`; se puede establecer la predeterminada. Ediciones envían `expectedVersion`; conflictos y errores se muestran sin ocultar el estado de servidor. La pantalla confirma antes de borrar.
- Delivery ahora permite abrir el detalle de una solicitud propia desde el historial (`GET /api/v1/client/delivery-requests/{requestId}`), con snapshot de renglones, comentario, subtotal, horario y estado. Se explica que el snapshot no implica aceptación ni cobro.
- Dependencias publicadas en ramas separadas: CRUD de direcciones en `feature/backend-api` + V12 en `feature/database-migrations`; detalle delivery en `feature/backend-api` (requiere V11). Aún deben integrarse en orden antes de probar el flujo HTTP completo.
- Verificación: ESLint y TypeScript pasaron; `expo export --platform android` y web pasaron, con ruta `/addresses`. Son bundles estáticos, no builds instalables ni prueba física. No se ejecutó E2E contra API/DB en ejecución.

## 2026-09-30 — Direcciones guardadas para delivery

- El flujo `/delivery` lista direcciones privadas del Cliente, permite aplicarlas al formulario y guardarlas/actualizarlas explícitamente con etiqueta, referencia, contacto y selección de default. Ningún domicilio se guarda automáticamente sin acción del usuario.
- Cambiar de cuenta remonta las pantallas sensibles para no conservar conversaciones ni domicilios del cliente anterior. La app no calcula cobertura/tarifa ni geocodifica.
- Depende de `feature/backend-api` address endpoints y `feature/database-migrations` V12. Typecheck/lint y exports SDK 57 Android/web pasan; exports no equivalen a prueba de dispositivo.

## 2026-09-30 — Solicitud Cliente de delivery

- Se agregó pantalla Delivery enlazada desde Inicio. Consulta el menú vigente, guarda líneas de carrito local, pide dirección completa, referencia opcional, teléfono obligatorio, horario y preferencia de pago. `ONLINE_PAYMENT_REQUESTED` está identificado como una preferencia; la app no cobra ni afirma que haya pago.
- Historial Cliente desde `GET /api/v1/client/delivery-requests` muestra estados y subtotal, y permite cancelar sólo mientras la solicitud sigue pendiente mediante el endpoint compartido de order requests. Dirección/contacto no se repiten en la lista.
- El envío debe ser explícito y autenticado; antes de llamar al backend persiste el payload/UUID criptográfico en SecureStore. Si el resultado se pierde, ofrece reintento manual del mismo payload. La solicitud sigue pendiente de revisión humana y no reserva stock ni crea una orden.
- Requiere `feature/backend-api` delivery request y V11 en `feature/database-migrations`; no se ha integrado con zonas, tarifas, ETA de ruta, transporte ni pago real.
- Verificación: Expo SDK 57 lint, typecheck y export Android/web pasaron; las rutas `/messages` y `/delivery` aparecen en las rutas estáticas. Se añadió `expo-crypto ~57.0.3` para UUIDv4 criptográficamente seguro. La exportación no es una prueba del flujo con API/PostgreSQL ni una prueba física.

## 2026-09-30 — Mensajería Cliente conectada

- Se agregó la ruta `/messages`, accesible desde Inicio, para abrir/retomar la conversación APP propia, leer el historial, enviar mensajes y actualizar respuestas manualmente.
- El envío usa la API autenticada y persiste el cuerpo junto a `Idempotency-Key` en SecureStore antes del intento. Si se pierde conectividad, no reenvía automáticamente: ofrece reintentar con la misma clave para evitar duplicados. No confirma recepción por parte del equipo hasta recibir respuesta del backend.
- El flujo requiere sesión Cliente y conexión. Todavía depende de `feature/messaging` (contrato local) y `feature/database-migrations` V10. No incluye Meta, correo, push, IA ni respuestas en tiempo real.
- Verificación: `npm run typecheck --workspace mobile`, `npm run lint --workspace mobile`, `npx expo export --platform android` y `npx expo export --platform web` completados; la exportación no equivale a prueba en teléfono físico.

## 2026-09-30 — Cancelación segura de reservas pendientes

- El historial de reservas Cliente permite cancelar únicamente las entradas con reserva asociada aún en `REQUESTED`. Las ya confirmadas o en curso requieren contactar al restaurante mientras no exista política de cancelación acordada.
- Depende de `DELETE /api/v1/client/reservations/{reservationId}` en `feature/reservations`; la API registra transición y actor, comprueba propiedad, y responde 404/409 ante recursos ajenos o estado avanzado.
- Verificación: lint, typecheck y Expo export Android/web aprobados; Maven integrado pasó 37 pruebas, 0 fallos/errores. No se hizo prueba física del teléfono.

## 2026-09-29 — Detalle de solicitudes pickup

- En la pestaña Solicitudes, el Cliente puede abrir detalle desde `GET /api/v1/client/order-requests/{requestId}` y revisar los productos, cantidades, precio de línea y comentario que se guardaron al enviar; la API entrega snapshots, no los datos actuales del menú.
- La pantalla conserva carga/error por separado del estado de cancelación y no muestra datos personales de otros clientes.
- Verificación después del cambio: lint/typecheck y export Expo Android/web; exports son bundles, no build instalable ni validación física.

## 2026-09-29 — Historial y cancelación de pickup

- Nueva pestaña Solicitudes consulta el historial autenticado de pickup, muestra estado/horario/subtotal del servidor y distingue una solicitud pendiente de un pedido confirmado.
- Permite cancelar solicitudes pendientes mediante `DELETE /api/v1/client/order-requests/{requestId}`; la API limita la operación al Cliente propietario, registra evento y rechaza estados no cancelables.
- Verificación: lint, typecheck y export Expo Android/web aprobados. Son bundles estáticos; falta validar en dispositivo instalado.
- Dependencia: endpoint de cancelación en `feature/backend-api`.

## 2026-09-29 — Menú conectado a catálogo público

- La pantalla Menú consulta `GET /api/v1/public/menu`; presenta categorías, platillos y precios recibidos del backend, con estados de carga, error y reintento.
- El menú vacío explica que aún faltan productos oficiales. No se usan fixtures ni se muestra disponibilidad de stock no calculada.
- Depende de `feature/backend-api` y `feature/database-migrations` V8. Smoke HTTP/PostgreSQL de la API pasó con estado vacío y con un producto sintético; ese producto y su DB fueron desechables, no datos sembrados en la app.
- Verificación móvil: `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile`, export Expo Android y web aprobados. Los exports no sustituyen APK/IPA ni prueba física.

## 2026-09-29 — Solicitud pickup Cliente

- Menú permite armar carrito local, pedir hora de pickup y comentarios, y enviar `POST /api/v1/client/order-requests` con `Idempotency-Key` y sesión Cliente.
- Carrito y cuerpo/clave de un envío sin resultado confirmado se guardan con SecureStore; reintentar reutiliza el mismo payload/clave incluso después de reiniciar. Un envío sin conexión nunca se confirma ni se reenvía automáticamente. La UI no llama “pedido confirmado” a `PENDING_REVIEW`.
- El subtotal del carrito es sólo orientativo; backend recalcula precio y tiempo mínimo de preparación. La solicitud aún requiere confirmación manual de capacidad/disponibilidad y no cobra ni reserva stock.
- Lint/typecheck y exports Expo Android/web pasan. Smoke API autenticado devolvió 202 pendiente, replay idempotente, 409 al cambiar payload bajo misma clave y un registro propio en historial. La app no se probó en dispositivo físico.

## 2026-09-29 — Borrador local de reserva

- La app restaura y guarda en SecureStore del dispositivo el borrador de reserva de la cuenta autenticada, con expiración de 30 días. El dato queda vinculado al correo guardado en SecureStore y nunca se envía automáticamente.
- Una respuesta exitosa del backend elimina el borrador; un fallo de red lo conserva. En web preview no se persiste y se identifica el límite.
- La app puede restaurar una sesión local degradada si refresh falla por conectividad; conserva refresh/email de forma segura y reintenta refresh ante una acción del servidor. Un `401` elimina ambas credenciales. Los datos protegidos permanecen fuera de línea; pedidos/reservas/pagos no se confirman offline.
- La rotación móvil comparte también la respuesta recién obtenida durante 30 s cuando otra petición aún pudo leer el refresh anterior, evitando que una carrera concurrente se interprete como reuse malicioso. El access token sigue sólo en memoria.

## 2026-09-29 — Limpieza de sesión rechazada

- Si el access token falla y el backend rechaza el refresh con `401`, la app ahora elimina el refresh token seguro y limpia la sesión en memoria. También limpia la sesión si el access token recién renovado vuelve a recibir `401`.
- Los fallos de conectividad no borran el refresh token, de modo que se puede reintentar al recuperar red.

## 2026-09-29 — Reenvío del código de cuenta

- La verificación ofrece un botón para solicitar un nuevo código sin salir del flujo de registro; conserva la respuesta neutral del servidor.
- Usa `POST /api/v1/auth/verify/resend`; el backend aplica cooldown y límite por hora, y los códigos se envían mediante email outbox.
- La app depende de `feature/backend-auth`; smoke HTTP/API/DB confirmó respuesta neutral y cooldown. La entrega efectiva del correo requiere configurar un proveedor SMTP.

## 2026-09-29 — Sesiones activas

- Mi cuenta muestra las sesiones Cliente activas con tipo de dispositivo y última actividad; permite cerrar otras sesiones y actualizar el listado.
- La sesión actual se identifica y se cierra mediante el flujo de cierre existente. No se muestra IP ni agente de usuario.
- Depende de `GET/DELETE /api/v1/client/sessions` en `feature/backend-auth`; smoke HTTP/DB comprobó ownership y cierre remoto, además de invalidación de refresh.

## 2026-09-29 — Historial de solicitudes de reserva

- La pantalla de reservas consulta `GET /api/v1/client/reservations` y presenta las solicitudes propias con horario, tamaño del grupo, decisión, estado de la reserva y mensaje del equipo; soporta carga, reintento, error y lista vacía.
- Después de enviar una solicitud, actualiza el historial desde el servidor. Una solicitud pendiente/rechazada no se rotula como confirmación.
- La API devuelve máximo 50 registros propios y requiere V7 para conservar horario/grupo de evaluaciones que no crearon una reserva. Dependencias publicadas: `feature/database-migrations` `ab26a02` → `feature/reservations` `56889ec`; integrar en ese orden antes de desplegar esta app.
- Verificación móvil: `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile`, `npx expo export --platform android` y web aprobados. Los exports no sustituyen prueba instalada en teléfono.

## 2026-09-28 — Estado de servicios públicos

- Inicio consulta `GET /api/v1/public/service-capabilities`, traduce los estados operativos a mensajes de Cliente y permite reintentar si falla la conexión. La lista oculta códigos internos que no corresponden a servicios para clientes.
- La consulta inicial ahora captura también errores síncronos de configuración (por ejemplo, falta de `EXPO_PUBLIC_API_BASE_URL`) y los presenta como estado recuperable.
- Verificación: lint, typecheck, export Expo Android y export Expo web aprobados. Los exports son bundles; no equivalen a APK/IPA ni a prueba en dispositivo.

## 2026-09-28 — Recuperación de contraseña en la app Cliente

- En `feature/mobile-shell`, la pantalla Mi cuenta ya permite solicitar un código de recuperación y establecer una contraseña nueva usando `POST /api/v1/auth/reset/request` y `/reset/complete`.
- La interfaz conserva el mensaje neutral del backend para no revelar si el correo está registrado, valida el código de seis dígitos y comunica que, después del cambio, el usuario debe iniciar sesión de nuevo. No expone códigos de desarrollo ni añade una ruta de bypass.
- Se ampliaron los métodos del proveedor de sesión y la guía móvil. Sin credenciales externas ni dependencias nuevas.
- Verificación: `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile`, `npx expo export --platform android` y `npx expo export --platform web` pasaron. Los exports generaron bundles para revisión, no APK/IPA instalables. Backend de reset ya existe en `feature/backend-auth`, pero esa rama depende de la base Spring/Maven de `feature/backend-foundation` y de las migraciones.

## 2026-09-28 — Perfil Cliente conectado

- Mi cuenta consulta y edita nombre y teléfono opcional desde `GET/PUT /api/v1/client/profile`; muestra carga, error, guardado correcto y reintenta con la versión del perfil entregada por backend.
- El backend permite únicamente editar el perfil identificado por la sesión y mantiene actualizadas las dos representaciones del nombre. El correo se muestra como no editable.
- Verificación después del cambio: lint, typecheck y export estático Expo para Android y web aprobados. Smoke HTTP/DB pasó con login CLIENT, consulta/edición del perfil, rechazo de versión obsoleta y validación de teléfono. No equivale a una prueba en dispositivos instalados.

## 2026-10-05 — Solicitud de cancelación de pedido aceptado

- La pestaña de pedidos permite al Cliente escribir un motivo y solicitar cancelación de pickup/delivery mientras el pedido siga en una etapa previa al despacho. La app genera `Idempotency-Key` y muestra que el pedido continúa activo hasta la revisión Operativa.
- El historial recupera estados PENDING_REVIEW/APPROVED/REJECTED y permite actualizarlos o consultarlos periódicamente mientras haya pedidos activos/solicitudes pendientes. Los pedidos servidos, cerrados, cancelados y repartos asignados/en curso no muestran esta acción.
- Reutiliza la misma clave idempotente cuando se reintenta con el mismo motivo; si se pierde la respuesta, consulta el historial del servidor para recuperar la solicitud registrada antes de ofrecer un nuevo envío.
- Si Operaciones rechaza la solicitud y el pedido continúa en una etapa elegible, Cliente puede enviar una solicitud nueva con su propio motivo; las solicitudes previas siguen en el historial del servidor.

## 2026-10-05 — Evaluación previa de horario de reserva

- En el formulario Cliente se agregó “Evaluar horario orientativo” conectado a `POST /api/v1/public/reservations/evaluate`. Presenta mensaje y rango de estancia estimada antes de enviar, invalida resultados cuando cambian personas/fecha/preorden y evita que una respuesta tardía reemplace la evaluación del formulario actualizado.
- La app deja claro que la evaluación es orientativa y la API vuelve a evaluar al crear la solicitud. Devuelve hasta tres alternativas específicas como acciones para probar el horario; un envío rechazado conserva esas alternativas en resultado e historial. Cambiar los datos invalida la evaluación previa. Vitest 30/30, ESLint, TypeScript y exports Expo Android/Web aprobados; sin confirmación automática.
- El flujo usa la API `feature/backend-capacity-order-lifecycle`, incluido Flyway V36. No procesa reembolsos desde la app ni cancela directamente el pedido. Verificación: Vitest 30/30, ESLint, TypeScript y exports Expo Android/Web aprobados; los exports son bundles y no sustituyen una prueba instalada en dispositivo.

## 2026-09-26 — APP-01 y slices iniciales de identidad/reservas

- Rama `feature/mobile-shell`: se agregó app ejecutable Expo SDK 57 / React Native 0.86 / TypeScript con Expo Router y navegación Cliente Inicio, Menú, Reservas y Mi cuenta.
- La autenticación conecta registro, verificación por código, login, refresh rotativo y logout al backend WOK. El access token vive en memoria; el refresh token usa Expo SecureStore y se rota al restaurar la app o ante 401, con rotación concurrente serializada.
- La solicitud de reserva conecta `POST /api/v1/client/reservations`, pide sesión CLIENT, limita localmente a 3 horas, presenta la evaluación pública, y reutiliza `Idempotency-Key` después de errores de red para evitar doble solicitud. Ninguna respuesta se presenta como confirmación automática.
- El menú se mantiene vacío con explicación hasta recibir catálogo y endpoint. Pedidos, pagos, chat, historial, Google OIDC y reset de contraseña no se declaran implementados en móvil.
- Configuración local por `EXPO_PUBLIC_API_BASE_URL`, documentada en `apps/mobile/.env.example`; no se agregó credencial ni archivo `.env`.
- Verificación ejecutada: `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile`, `npx expo export --platform android` y `npx expo export --platform web` pasaron. Los exports verifican el bundle, no generan un APK/iOS installable. `npx expo lint` encontró un problema del comando generado al exigir el directorio `components` ausente; se cambió el script a ESLint sobre `src app` y esa validación pasó.
- Pendiente: build instalable Android/iOS, pruebas en dispositivos reales, pruebas automatizadas de flujos, recuperación de contraseña, Google, y contratos/backend de catálogo, pedidos, pagos, mensajes e historial.

## Plan original al repartir a rama móvil especializada

- El plan móvil Cliente está en `feature/mobile-shell`, worktree `/tmp/wok-worktrees/mobile`, con base `3bbd0ed` (`origin/development`).
- En ese momento el contenido era planificación; luego se implementó el slice inicial descrito arriba.
- La implementación depende del contrato API y de los slices de identidad/backend; la app no confirma reservas, pedidos ni pagos sin respuesta del servidor.
- El fast-forward fue local. No se hizo commit ni push y la rama remota no se actualizó.

## 2026-09-15 — Plan de app exclusivamente Cliente

- Resultado: [plan concreto](../mobile/CLIENT_APP_PLAN.md) con alcance por C-01 a C-13, núcleo y extensiones, arquitectura Expo/API Spring, seis paquetes estimados y criterios de prueba Android/iPhone.
- Restricciones confirmadas: 5–6 semanas totales, últimas 2–3 para seguridad/estabilización; equipo de seis con 3 web, 2 backend y 1 app iniciales, apoyo rotativo. Edgar PM y SM rotativo.
- Corrección de evidencia: no se han presentado fallos de React Native; las dudas son preventivas.
- Tecnología: recomendación React Native + Expo + TypeScript; backend Java/Spring según orientación comunicada por el PM. Versiones y distribución pendientes.
- Capacidad: construcción móvil estimada 36–52 h; revisión/entrega 14–22 h. Horas disponibles y trabajo ya existente todavía no confirmados; no es compromiso de fecha para todas las funciones Cliente.
- Verificación: revisión documental de contratos, límites de alcance, reparto sin doble conteo, formato y enlaces locales. No se instaló Expo ni se ejecutó una app.
- Pendiente: confirmar corte académico, fecha de congelamiento, dispositivos y formato de distribución; inventariar backend real y asignar personas a puestos.
- Git: documentación local; sin commit, push, cambio de rama, merge ni publicación.
# Progreso de la aplicación móvil Cliente

## 2026-10-04 — Actualización automática del chat Cliente

- En la pantalla de Mensajes, mientras está enfocada y seleccionada una conversación `OPEN`/`WAITING`, la app consulta historial y mensajes cada 15 segundos. Al salir de la pantalla, cerrar la conversación o quedar offline, detiene el polling; si una consulta falla conserva el último contenido confirmado.
- Usa únicamente los endpoints Cliente existentes y mantiene ownership/estado bajo control del backend. No requiere push, Meta ni cambios de esquema; el refresco manual sigue disponible para presentar errores de conexión.
- Verificación completada: Vitest 12/12, ESLint, TypeScript `--noEmit` y exportaciones Expo Android/Web aprobados. Los exports comprueban compilación de rutas/bundles, no son APK/IPA ni sustituyen la prueba en dispositivo.

## 2026-10-04 — Formato y validación local del teléfono GT

- Perfil, direcciones y formulario delivery muestran/formatean teléfono como `0000 0000`; al seleccionar un dato guardado se normalizan dígitos y prefijo `+502`. Se rechazan envíos con menos/más de ocho dígitos y se explica el formato junto al campo.
- La API vuelve a validar ese formato antes de guardar. Los registros previos no se reescriben automáticamente; al editarlos la app los presenta agrupados.
- Vitest 12/12, ESLint, TypeScript `--noEmit` y exports Expo Android/Web pasan. Los exports son bundles de revisión, no paquetes instalables ni pruebas físicas.

## 2026-10-04 — Recuperación del estado del intento de pago

- El historial de delivery vuelve a leer desde `GET /api/v1/client/delivery-requests/{requestId}/payment-intents/current` los intentos activos del Cliente y reconstruye la tarjeta de estado después de una recarga. Sólo consulta pedidos aceptados que pidieron cobro online; solicitudes sin intento no crean ninguno.
- Se añadieron etiquetas de estado para los estados del contrato y una función aislada para elegir qué intentos consultar. Los datos financieros siguen viniendo de la API y el texto mantiene claro que el adaptador actual es de prueba.
- Pruebas Vitest: 10/10; ESLint y TypeScript `--noEmit` pasan. Pendiente: export Expo Android/Web y publicar el par de cambios con backend.

## 2026-10-04 — Preferencias de cobro y solicitud de factura pickup/delivery

- Pickup permite elegir efectivo, tarjeta o transferencia al recoger y enviar opcionalmente nombre/NIT para pedir factura. Delivery conserva efectivo al recibir o solicitud de pago en línea y añade los mismos datos fiscales.
- La app explica que la preferencia no procesa cobro y que solicitar factura no emite un DTE/FEL. Los datos quedan ligados al contenido idempotente de la solicitud; un reintento repite exactamente el mismo payload.
- En delivery, el recibo, historial y detalle muestran si se pidió factura y el snapshot fiscal devuelto por backend.
- El historial pickup muestra la preferencia de pago y el snapshot fiscal propio, además de los productos y estado previamente disponibles.
- Verificación: ESLint, TypeScript, Vitest (5 pruebas), export Expo Android y Web pasan. Las exportaciones verifican bundle y rutas; no son paquetes instalables ni pruebas físicas.

## 2026-10-04 — Historial Cliente de facturas emitidas

- Mi cuenta enlaza a `/invoices`, que lista facturas emitidas propias y abre el detalle con receptor, NIT, subtotal/impuestos/total y líneas. Una solicitud de facturación pendiente no se presenta como documento emitido.
- Facturas del adaptador mock se etiquetan como prueba no certificada SAT. No se muestra botón de descarga porque backend todavía no conserva ni entrega XML/PDF.
- Verificación: lint, TypeScript, Vitest 5/5 y Expo export Android/Web pasan; las exportaciones no son builds instalables ni prueba física.

## 2026-10-04 — Perfiles fiscales Cliente

- Mi cuenta enlaza a `/tax-profiles`, donde Cliente puede crear, editar, eliminar y elegir un perfil fiscal predeterminado. El backend guarda esos datos con ownership de cuenta y control de versiones.
- Pickup y delivery precargan nombre/NIT desde el perfil predeterminado al solicitar factura; el cliente puede editar los datos para cada solicitud. Un fallo al leer el perfil no bloquea la entrada manual.
- La pantalla explica que guardar/perfilar datos no emite ni certifica DTE/FEL. No se incluyen credenciales ni proveedor fiscal real.
- Verificación: lint, TypeScript, Vitest 5/5 y Expo export Android/Web pasan; los exports no son paquetes instalables ni prueba física.

## 2026-10-04 — Historial de conversaciones

- Mensajes muestra los últimos 20 hilos, incluido el último mensaje y fecha cuando existen; Cliente puede abrir hilos cerrados para consulta e iniciar otro para escribir. Sólo se permite enviar en hilos activos.
- La selección mantiene el hilo actual durante la recarga; respuestas de una apertura anterior no pueden reemplazar el hilo seleccionado. Los reintentos conservan la clave idempotente por conversación.
- Verificación: lint, TypeScript, Vitest 5/5 y Expo export Android/Web pasan. No se implementaron adjuntos ni mensajería Meta en este slice.

## 2026-10-04 — Zona horaria de reservas

- El campo ahora se identifica explícitamente como hora de Guatemala (`America/Guatemala`) y convierte esa hora local a un instante para el backend, en vez de interpretar según la zona configurada en el dispositivo. El historial también se formatea en zona del restaurante.
- La conversión valida formato/calendario y tiene pruebas independientes de la zona del proceso; se conservan borradores locales como hora de restaurante y los payloads pendientes como instantes idempotentes.
- Verificación: lint, TypeScript, Vitest 8/8 y Expo export Android/Web pasan.

## 2026-10-04 — Seguimiento de pedidos pickup aceptados

- En `feature/mobile-shell`, la pestaña Solicitudes consulta `GET /api/v1/client/orders/tracking` y muestra por separado pedidos ya aceptados por el restaurante, con código, estado operativo, hora solicitada, ETA de cocina cuando backend la entrega y hora de actualización.
- El estado distingue que una solicitud `ACCEPTED` no es por sí misma el progreso de cocina. El ETA se actualiza manualmente o cada 30 segundos mientras el pedido siga `SENT`/`PREPARING`; los estados finales no muestran ETA. Si la sesión está offline no se afirma que se consultó al servidor.
- Sin dependencias nuevas ni persistencia sensible local. La ruta de backend requiere la misma sesión Cliente y sólo entrega pedidos del usuario autenticado.
- Verificación: `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile`, `npm test --workspace mobile`, `npx expo export --platform android` y `npx expo export --platform web` pasaron. Los exports son bundles para revisión, no APK/IPA ni prueba en dispositivo. `npm ci` reportó 31 alertas de auditoría en el árbol del lockfile (11 moderadas y 20 altas); no se aplicó actualización automática.

## 2026-10-04 — Hora y seguimiento de delivery

- Delivery interpreta el horario ingresado como hora de Guatemala (`America/Guatemala`), convierte el instante al formato API y genera sugerencias en la zona del restaurante, sin depender del timezone del teléfono.
- Al refrescar historial, la app muestra el código y estado del pedido delivery aceptado por Operaciones, y su ETA de cocina cuando existe. Un recibo recién enviado sigue indicando claramente que está pendiente y no se ha cobrado.
- Se presenta el motivo de decisión cuando se rechaza la solicitud. El progreso se obtiene del endpoint autenticado y acotado al cliente; el teléfono no mantiene un estado estimado como fuente de verdad.
- Verificación: ESLint, TypeScript, Vitest 8/8, export Expo Android y Web pasan. Los exports no son builds instalables ni prueba física.
# 2026-10-04 — Aislamiento de pantallas al cambiar de usuario

- Se integró de forma compatible el fix remoto de estado entre cuentas: Mi cuenta e Historial de pedidos ahora remontan su contenido cuando cambia el correo autenticado, evitando mostrar temporalmente datos locales de una sesión anterior.
- Conserva el historial unificado actual de pickup y delivery, estados de despacho, ETA y acciones existentes.
- Verificación: Vitest 8/8, ESLint, TypeScript `--noEmit` y export Expo para Android/Web completados.

## 2026-10-04 — Coordinación de rotación de sesión segura

- Se integró el fix remoto para evitar carreras entre refresh simultáneo, cierre de sesión y cambio de cuenta. Las rotaciones se comparten sólo por token; las escrituras a SecureStore se serializan y cada mutación confirma que pertenece a la generación de sesión vigente.
- Pruebas de coordinación cubren refresh concurrente por token, aislamiento entre tokens, limpieza de caché y escrituras ordenadas aun cuando una falle.
- Este cambio ya estaba integrado en el historial actual de `feature/mobile-shell`; se verificó junto con el ajuste de aislamiento por usuario. Vitest 8/8, ESLint, TypeScript `--noEmit` y export Expo para Android/Web aprobaron.

## 2026-10-04 — Pickup usa la zona horaria del restaurante

- El campo de fecha y hora de pickup ahora se interpreta como hora de `America/Guatemala` incluso si el dispositivo está configurado en otra zona. La sugerencia de primera hora también se calcula desde el instante del servidor y se muestra en horario de Guatemala.
- El formulario rechaza formatos o fechas de calendario inválidos antes de construir el payload; las solicitudes pendientes conservan el instante ISO original para reintento idempotente.
- Verificación: Vitest 8/8, ESLint, TypeScript `--noEmit` y export Expo Android/Web completados. Los exports verifican bundles y rutas, no son APK/IPA instalables ni prueba física.

## 2026-10-04 — Intento de pago de prueba para delivery

- En pedidos delivery aceptados con preferencia de pago online, Cliente puede solicitar o recuperar el estado de un intento. La tarjeta muestra el estado, monto/moneda y el mensaje devuelto por el backend; deja claro que el adaptador es mock y no procesa ni confirma cobros.
- El cliente envía una clave idempotente; el backend también converge claves nuevas sobre el único intento activo del pedido, por lo que un timeout seguido de reintento no crea un segundo intento. No se capturan ni almacenan datos de tarjeta.
- Verificación: Vitest 8/8, ESLint, TypeScript `--noEmit` y export Expo Android/Web completados. Los exports no sustituyen build instalable ni prueba física.

## 2026-10-04 — Validación de correo antes de acciones de cuenta

- `Mi cuenta` ahora valida el formato antes de login, registro, verificación y solicitud/completado de recuperación de contraseña; quita espacios externos antes de llamar los métodos de sesión y muestra el error junto al campo.
- La validación compartida limita longitud total/local/domain, exige dominio con TLD y rechaza segmentos de dominio malformados. El backend mantiene su propia validación autoritativa.
- Verificación: Vitest 23/23, ESLint y TypeScript aprobados; export Expo Android y Web completados. No es build instalable ni prueba física.

## 2026-10-04 — Cancelación delivery por endpoint de modalidad

- La acción para cancelar una solicitud delivery pendiente ahora llama `DELETE /api/v1/client/delivery-requests/{requestId}`. Antes usaba la ruta pickup por error; backend/app quedan alineados con rutas específicas por modalidad.
- La app sólo marca cancelada la solicitud después de una respuesta exitosa del servidor; si el pedido fue aceptado o hubo conflicto, conserva el estado y muestra error.
- Verificación: Vitest 23/23, ESLint, TypeScript y export Expo Android/Web. Prueba backend `ClientDeliveryCancellationIntegrationTest` 4/4 y suite completa 198/198 con PostgreSQL 18/Testcontainers.

## 2026-10-04 — Validación local del rango de contraseña nueva

- Registro y restablecimiento ahora bloquean contraseñas menores a 12 o mayores a 128 caracteres, en línea con el DTO de autenticación backend. Login conserva compatibilidad con credenciales existentes. El campo de contraseña nueva limita entrada a 128 caracteres y comunica ambos límites.
- Verificación: Vitest 25/25, ESLint, TypeScript `--noEmit` y exports Expo Android/Web. Los exports no son binarios instalables ni prueba física.

## 2026-10-04 — Nombre de registro y códigos de verificación

- Registro bloquea nombres fuera de 2–100 caracteres y limita el campo antes de enviar. Verificación de cuenta y reset bloquean códigos distintos de seis dígitos antes de llamar al servidor.
- Verificación: Vitest 27/27, ESLint, TypeScript `--noEmit` y exports Expo Android/Web completados.
## 2026-10-05 — Validación funcional y revisión Expo Go

- `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile` y `npm run test --workspace mobile` pasan; Vitest reporta 9 archivos y 30 pruebas, sin fallos.
- Expo SDK `57.0.25` / React Native `0.86.3`. `npx expo run:android` requiere Android SDK local, pero no es necesario para Expo Go. Se verificó que `ANDROID_HOME`, `ANDROID_SDK_ROOT` y `adb` no están configurados en la laptop.
- Metro por LAN responde en `/status` y sirve en `0.0.0.0:8081`; durante el intento desde Expo Go no se observó conexión TCP entrante. Se regeneró QR tras el cambio de Wi‑Fi. La prueba de dispositivo sigue pendiente; probar desde navegador del mismo teléfono `http://<IP-LAN>:8081/status` permite distinguir bloqueo de red de compatibilidad Expo Go.
- El túnel temporal Expo/ngrok fue autorizado por el propietario, pero no inició porque ngrok terminó con `remote gone away`; no se conservaron dependencias ni cambios temporales del intento.
## 2026-10-05 — Actualización automática de solicitudes de reserva

- La pantalla de Reservas refresca el historial cada 30 segundos mientras está enfocada, hay una sesión online y quedan solicitudes en estado `REQUESTED`. Se detiene al salir de la vista o al perder esas condiciones; evita solapar llamadas si coincide con una actualización manual.
- Esto permite que Cliente vea la decisión operativa sin volver a entrar ni pulsar actualizar. Las confirmaciones no se transforman en pedido y la preorden sigue siendo un snapshot sujeto al flujo operativo.
- Verificación: Vitest 38/38, ESLint, TypeScript y export Expo Android/Web (17 rutas). No requiere cambios backend ni credenciales externas.

## 2026-10-05 — Aclaración de facturas en Cliente

- La vista de facturas ya consulta documentos propios emitidos; se corrigió el texto para no limitarlo a pickup. Backend valida ownership por cuenta y admite cuentas con pedidos pickup/delivery aceptados.
- Verificación móvil: Vitest 38/38, ESLint y TypeScript. Prueba backend sobre PostgreSQL 18 valida ambas modalidades y rechazo de acceso a otro cliente.
## 2026-10-05 — Carrito aislado por cuenta y canal

- Los borradores y modificadores de pickup y delivery ahora usan SecureStore namespaced por canal y por identidad (hash SHA-256 del correo normalizado); el espacio anónimo es independiente. Cambiar de cuenta ya no restaura el carrito de otra persona.
- Las claves de reintento pendientes también quedan en el scope de la cuenta; los intentos legacy sólo se migran si el correo coincide con la sesión activa, conservando idempotencia. Se descartan carritos legacy sin dueño verificable.
- Verificación: Vitest 40/40, ESLint, TypeScript y export Expo Android/Web (17 rutas). Tests unitarios validan separación entre cuentas/canales y el scope anónimo.

## 2026-10-07 — Estado de reservas sincronizado con Admin

- La pantalla Cliente consulta `RESERVATIONS` desde `/api/v1/public/service-capabilities` al abrirse y la refresca mientras está enfocada. Si Admin publica `PAUSED` o `DISABLED`, informa al cliente y bloquea solicitudes nuevas; `ENABLED` y `MANUAL_APPROVAL` siguen disponibles.
- Los formularios de pickup y delivery consultan la misma fuente y comunican el estado `PAUSED`/`DISABLED` o la revisión `MANUAL_APPROVAL`. Conservan el reintento idempotente previamente guardado cuando el servicio se pausa.
- Si la respuesta omite una capability, las pantallas indican que el estado no fue publicado; si la consulta falla, muestran el error de conexión por separado.
- Pickup y delivery vuelven a consultar el estado mientras su pantalla está enfocada, y se detienen al navegar fuera o al mandar la app a segundo plano, reduciendo el tiempo que una pausa reciente tarda en reflejarse.
- La app permite resolver un reintento idempotente previamente guardado incluso mientras el servicio está pausado, para no ocultar el resultado de una solicitud posiblemente aceptada antes de la pausa. El backend aplica la misma capability dentro de la transacción y sigue siendo autoritativo.
- Si el estado no se pudo consultar, se informa que es desconocido; la app no inventa que esté disponible y deja que el backend valide el envío.
- Verificación: Vitest 46/46, ESLint, TypeScript `--noEmit`, export Expo Android y Web (17 rutas). Los exports no son APK instalable ni prueba física de dispositivo.
