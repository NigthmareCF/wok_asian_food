# Progreso de planificación móvil

## 2026-10-06 — MP-02 durable reservation replay

- The production reservation screen persists a validated owner/key/exact JSON body before POST and uses `expo-crypto` UUIDs. Restart restores pending requests without submission; retries retain the original body/key even when the form or requested date has changed.
- Owner/session-keyed screen state resets form, history, errors, notices, and locks. Layout cleanup guards stale submit/history/cancellation closures; serialized owner-scoped storage prevents late operations from reaching another account. Guest cannot submit; web uses process-local isolated memory.
- Only a schema-valid server evaluation whose `requestId` matches the idempotency key and whose `submitted`/reservation ID agree releases pending evidence. Core explicitly returns this key in `ReservationRequestService.Result`. HTTP error status alone does not distinguish non-execution from prior uncertain execution, so timeout, 5xx, and all 4xx retain the replay. Failed cleanup remains locked.
- Drafts use a separate reservation namespace. Matching normalized legacy-owner evidence is copied without deleting the legacy key. A cleared scoped marker prevents completed requests from resurrecting an old draft. Pending attempts never expire automatically; expired/malformed ownerless drafts stay untouched.
- Verification: fresh baseline mobile tests 30/30, typecheck/lint passed. RED observed 8 failing new tests (three missing-helper contracts and five actual-screen behavioral failures). GREEN: focused reservation tests 12/12, full mobile tests 42/42, typecheck/lint/diff checks passed. Interim React ref-in-render lint errors were corrected with lifecycle binding in layout effects, without suppressions.
- Deterministic production-screen harness covers persistence-before-POST, storage/clear failures, restart replay, double tap, secure UUID, stale callbacks/responses/restores, logout/relogin, history/form isolation, and native-style/web draft boundaries. Real devices, native SecureStore, bundles, backend/HTTP runtime remain unverified. MP-02 local commit, independent parent spot-check, and native assessment are pending; no remote operation or original-checkout mutation occurred.

## 2026-10-06 — MP-01 account-isolated carts

- The active mobile cart now selects an owner-normalized storage namespace and store for the current session. Account changes/logout immediately isolate items and pending pickup attempts; stale restores, queued writes, and retained callbacks cannot publish into the new account.
- Guest selections remain independent. Legacy migration copies only a validated pending attempt whose normalized owner matches the session, deriving quantities from its immutable request body. Ownerless legacy carts are not assigned to arbitrary accounts, and legacy evidence is retained without cross-owner deletion.
- The existing pickup prepare-before-POST path, exact pending body/key replay, quantity limits, and terminal-outcome rules are preserved. No auth, backend, UI redesign, payment, or dependency-install scope was added.
- Baseline: mobile tests 18/18, typecheck, and lint passed after exposing installed dependencies through an ignored local junction. Focused RED observed seven isolation failures plus the missing new helper; focused GREEN passed 12/12, full mobile tests 30/30, typecheck/lint/diff checks passed.
- Tests execute the production cart hook with deterministic React/session/storage boundaries, including delayed restore/persistence, same-owner relogin, guest/logout isolation, web memory, and persistence failure preventing submission. Native SecureStore/device/backend flows remain unverified. MP-01 is committed as `f93be79efe782ed6304a1fda307a52840ab812fa` (352 authored lines); native assessment is `medium/under_budget`, with no START or approval. The original dirty checkout was not modified.

## 2026-10-02 — Auditoria de dependencias Expo

- El CI conserva el bloqueo de alertas altas y criticas mediante una politica verificable, en lugar de degradar Expo con `npm audit fix --force`.
- Se documento una excepcion temporal y exacta para `GHSA-86w9-cpqp-85rv`, introducida por `node-forge` a traves de las herramientas de compilacion de Expo 57. El aviso no publica una version npm corregida al momento de la revision.
- Cualquier otro aviso alto o critico continua bloqueando la integracion. La excepcion debe revisarse el 2026-11-02 o antes si Expo o `node-forge` publican una correccion.
- Verificacion: cuatro pruebas de la politica, auditoria real del lockfile, lint y TypeScript movil, 279 pruebas Web y build Web de produccion aprobados.

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

## 2026-10-06 — Reparación de integración móvil y validación de contacto

- La rama remota `fix/mobile-corrections` contenía marcadores de conflicto literales en cinco archivos (`account.tsx`, `menu.tsx`, `_layout.tsx`, `package.json` y `ui.tsx`). Se reparó la base en el worktree de esa rama y se restauró la configuración NativeWind que requerían sus pantallas (Babel, Metro, Tailwind, CSS global, tipos y lockfile). Se mantuvieron exports de estilo compatibles con vistas existentes.
- El perfil, libreta de direcciones y entrega formatean teléfonos GT como grupos de cuatro dígitos y validan ocho dígitos locales, opcionalmente precedidos por `+502`. Se añadieron casos de prueba de normalización/formato.
- Se eliminó el límite arbitrario de 20 líneas de carrito; los límites de payload de API se elevan a 100 líneas técnicas y capacidad/inventario continúan evaluándose de forma agregada por backend, no SKU por SKU. La app no reserva stock ni confirma una orden al crear una solicitud.
- Verificación: suites móvil y NativeWind, ESLint y TypeScript pasaron. `expo export` completó para Android y web; el export web generó 17 rutas estáticas. Los bundles no son APK instalable ni equivalen a pruebas en dispositivo.
- El README móvil se actualizó para describir correctamente el alcance disponible y los límites de pagos, Google OIDC y verificación de edad. Los cambios están locales en `fix/mobile-corrections`; falta commit/push después de sincronizar con el remoto.
