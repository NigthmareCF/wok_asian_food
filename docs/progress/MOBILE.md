# Progreso de planificación móvil

## 2026-10-06 — Inicio visual centrado en platillos

- Inicio ahora sigue el orden aprobado: logo oficial, hero fotográfico de 280 px, carrusel «Los más antojables», enlace discreto al menú, tres accesos compactos y servicios publicados al final. Se conservaron sesión, consultas, refresco y rutas existentes.
- El hero elige la primera imagen HTTPS válida del catálogo publicado; si no hay imagen o falla, usa un gradiente cálido y el logo oficial. Nombre y precio vienen de la API; el caso sin catálogo no inventa platillos ni precios. «Pedir ahora» conserva el botón compartido y ocupa solamente el ancho de su contenido.
- Texto inferior sobre fondo opaco oscuro con contraste mínimo de 4.5:1, verificado con los colores reales. Gradiente neutro previo sin cambios; variantes cálida y scrim son opcionales y usan Views estáticas.
- Carrusel con seis platillos en el orden publicado, sin etiquetas comerciales inventadas. Detalle y «+» son acciones separadas; agregar respeta restauración, intento pendiente, consulta/error del menú y máximo de 50 unidades mediante la lógica de carrito existente. Web usa snapping CSS mediante pagingEnabled; nativo conserva snapToInterval y desaceleración rápida.
- Base observada: lint, TypeScript y 34/34 pruebas aprobados. RED observado: 0/7 pruebas nuevas antes de implementar; GREEN 7/7, más una prueba de rutas. Después de normalizar solamente los seis archivos autorizados: `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile` y `npm run test --workspace mobile` aprobados, 42/42 pruebas; `git diff --check` del alcance aprobado sin errores.
- Pendiente HOME-03: verificación independiente y revisión visual a 390 px/escritorio por coordinación. API/BFF detenido sin autorización para reiniciar; datos reales, imágenes remotas, carrito, dispositivos y lector de pantalla no están verificados. HTML 200 confirma compilación y nuevo orden/textos; no equivale a prueba de navegador montado o API real.
- Tamaño observado: aproximadamente 1,044 líneas agregadas/eliminadas respecto de la base de esta revisión de Inicio, antes de esta nota final. La suite ejecutable suma 432 líneas legibles normalizadas; no se redujeron pruebas ni se comprimió código para cumplir la estimación orientativa de 450–650.
- Sin commits, cambios de rama, dependencias, `.env`, backend ni modificaciones de sesión/workflows.

### Corrección acotada y revisión visual de coordinación

- La revisión independiente de requisitos confirmó el alcance funcional y detectó contraste de 3.5813:1 al presionar los enlaces de menú/contacto con opacidad 0.7. Se mantuvo opacidad 1 y se agregó un fondo oscuro elevado como feedback, sin cambiar controles compartidos. Una regresión ejecuta los callbacks reales y calcula contraste en ambos estados: RED 8/9 y GREEN 9/9 pruebas de Inicio.
- Después de normalizar solamente Inicio y su prueba: `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile` y `npm run test --workspace mobile` aprobados, 43/43 pruebas.
- Coordinación inspeccionó antes de esta corrección 390×844 y 1280×900: ancho del documento 390/1280, sin desbordamiento horizontal; fallback cálido con marca, un CTA de 119.85×49.6 px, título del carrusel, error recuperable, enlace discreto, tres accesos y estado al final. El CTA genérico abrió el menú existente sin enviar pedido. Evidencia visual montada; coordinación actualizará la comprobación tras el ajuste.
  Bundles Web/servidor compilaron y el HTML actualizado respondió 200. No se tocaron listeners antiguos ni backend. HOME-03 sigue parcial por refresco visual del ajuste, consentimiento/inventario de revisión nativa, datos/cart reales, gestos nativos, dispositivos y lector de pantalla.

### Corrección del área táctil realmente renderizada

- Coordinación encontró el enlace real al menú con alto 20px, min-height 0px y sin padding, aunque el callback declaraba 44px. La prueba anterior del callback aislado no validaba su paso por NativeWind.
- Causa verificada al ejecutar el adaptador Web instalado: className reemplaza un style de tipo función por un objeto CSS; RN Web no invoca ese objeto como callback. Se retiró className solamente de los nueve Pressables nuevos de Inicio y se trasladó el estilo completo al callback intacto: mínimos 44px, alineación, padding/radio, opacidad habilitada 1, fondo al presionar y borde de foco. Hero, controles compartidos, rutas y bloqueos de carrito sin cambios.
- Regresión del adaptador real: RED 10/11 y GREEN 11/11 pruebas de Inicio. Después de normalizar solamente Inicio/prueba: lint y TypeScript aprobados; `npm run test --workspace mobile` 45/45. La prueba demuestra transporte de estilos, no la medida de un navegador montado.
  Coordinación comprobará los hitboxes, estados presionado/foco y ausencia de overflow en el DOM actualizado; cards/+ con datos reales, dispositivos y revisión nativa siguen pendientes. Sin commits, backend, listeners antiguos ni dependencias nuevas.
  Es evidencia del estilo emitido, no de medidas montadas ni del flujo real de cards/+.
- Validación montada posterior de coordinación: enlace al menú con alto real 44px/min-height 44px/opacidad 1; acceso Menú 106.4×65.2px a 390px. Tab desde el enlace enfocó Menú con borde real rgb(240, 108, 71). Sin overflow horizontal a 1280px; la inspección previa a 390px tampoco mostró overflow. Se observaron fallback/CTA/orden y se actualizó la captura móvil. Evidencia montada separada de las 11 pruebas del adaptador/JSX; no confirma imágenes/catalogue/cards/+ reales con BFF detenido ni dispositivos. La validación independiente de contraste 9/9 correspondía al lote previo al ajuste de interop.

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
  Si el resultado se pierde, ofrece reintento manual del mismo payload. La solicitud sigue pendiente de revisión humana y no reserva stock ni crea una orden.
- Requiere `feature/backend-api` delivery request y V11 en `feature/database-migrations`; no se ha integrado con zonas, tarifas, ETA de ruta, transporte ni pago real.
- Verificación: Expo SDK 57 lint, typecheck y export Android/web pasaron; las rutas `/messages` y `/delivery` aparecen en las rutas estáticas. La exportación no es una prueba del flujo con API/PostgreSQL ni una prueba física.

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

## 2026-10-05 — Rediseño móvil aprobado (en curso)

- UI-01: marca oscura coherente con Web, logo oficial sin modificar, gradiente estático con Views nativas, controles compartidos accesibles y estados reutilizables.
- Base: typecheck y 23/23 pruebas pasaron. RED observado al exigir tema oscuro; GREEN 23/23 después. Typecheck posterior pasó; lint bloqueado por EPERM del sandbox al recorrer el directorio de usuario (resolución ESLint), no por una regla desactivada.
- Sin commits, nuevas dependencias ni cambios en proveedores/backend. QA visual pendiente.

- UI-02: Inicio con CTA dominante, selección del catálogo real, accesos rápidos y servicios publicados; no se inventan horarios/apertura. Typecheck y 23/23 pruebas pasaron. Lint completo pasó con lectura elevada de directorios ancestros; no se cambió configuración ni se desactivaron reglas. QA visual pendiente.

- UI-03: búsqueda/categorías fijas, lista virtualizada con precios e imágenes, agregado rápido bloqueado ante intentos pendientes, resumen fijo y selector nativo de cantidad/comentario general. Ruta de detalle conservada. URL local BFF documentada sin leer .env real.
- RED de 2 regresiones de configuración observado, luego GREEN 25/25; typecheck y lint con lectura elevada pasaron. Payload y claves idempotentes del carrito intactos. QA de foco/teclado pendiente.

- UI-04: selector de días y horas sugeridas (no disponibilidad), fecha/hora libre y contador de 1–50 personas. Validación de 3 horas, body requestedAt, cancelación y revisión humana conservados; sin corte frontend de 21:30.
- RED 26/28 antes del módulo de helpers; GREEN 28/28 verificó preservación de hora, cambio de mes y límites de personas. Typecheck y lint elevado pasaron.

- UI-05: vacíos accionables e iconos en Solicitudes, estados con texto/color; Mi cuenta con marca, campos con iconos, mostrar/ocultar contraseña, errores junto al campo y enlaces secundarios. Cinco modos de autenticación y handlers/versiones/revocación sin cambios. Lint elevado, typecheck y 28/28 pruebas pasaron; QA de autenticación pendiente.

- UI-06: cinco destinos conservados, indicador coral y badge accesible de cantidad; lint elevado/typecheck/29 pruebas pasaron. Normalización limitada a archivos autorizados; no se formatearon archivos protegidos.
- Export Web pasó. Android falló inicialmente por ejecución Hermes denegada por sandbox y luego pasó con permiso elevado local; son bundles, no APK ni prueba de dispositivo. Salidas temporales, sin instalación ni publicación.
  El proceso viejo en ::1:8081 quedó intacto y muestra UI anterior. CORS existente del BFF sólo admite localhost:8081 y rechaza127.0.0.1:8081; la revisión nueva puede verificar errores amigables, no afirmar catálogo/flujo API exitoso. No se cambió backend/proxy.
- Pendiente: verificación independiente, QA390px/escritorio, foco/teclado y dispositivos; QA-01 sigue abierto. Sin commits ni secretos.

## 2026-10-05 — Corrección acotada de aceptación del rediseño

- UI-01/06: se conservaron todos los tokens Web y se agregó semántica móvil con texto oscuro sobre coral; botones, chips y badge cumplen contraste normal. La presión usa coral hover sin desvanecer texto. Contrastes calculados: 5.259:1 normal, 6.184:1 presionado y 4.714:1 mínimo del acento pequeño sobre cada banda del gradiente.
- Logo oficial discreto reutilizado por Page en Menú, Reservas, Solicitudes, cuenta autenticada/carga, carrito y detalle, sin duplicar Inicio/login. UI-03: pie de pedido sólo con cantidad mayor a cero; rutas y payloads intactos.
- UI-04: eliminada entrada técnica ISO; semanas futuras paginadas y controles de hora 00–23/minuto 00–59 con resumen legible. Sugerencias no garantizan disponibilidad; requestedAt local, validación de 3 horas y handlers originales conservados.
- RED 29/33 observado para pie vacío, contraste y semanas futuras; GREEN 34/34 tras corrección. Lint elevado, typecheck y diff-check pasaron después de normalización acotada. Exports Web y Android/Hermes corregidos pasaron sin instalar/publicar; no verifican dispositivos.
  HTML de reservas verificado con nuevos selectores y sin placeholder ISO. Listener IPv6 ajeno y CORS/backend intactos; flujo API exitoso, QA final de navegador y dispositivos pendientes. QA-01 permanece abierto; sin commits.

## 2026-10-05 — Implementación completa; QA parcial documentado

- La verificación independiente cerró los hallazgos de la corrección sin nuevos bloqueos del cambio: `npm run lint --workspace mobile` con lectura elevada de ancestros, `npm run typecheck --workspace mobile`, `npm run test --workspace mobile` (34/34) y diff-check pasaron. El coordinador repitió el comando exacto de typecheck: pasó.
- Comparación SHA-256 del coordinador: 11/11 archivos preexistentes protegidos intactos y logo oficial idéntico al original. Rama sin cambios: `feature/mobile-design-tokens`.
- Navegador del preview corregido en 390×844 y 1280×900: ancho del documento igual al viewport, sin desbordamiento horizontal. Se observaron logo oficial, hero, CTA, tabs activos y marca en las demás pestañas; texto primario renderizado `rgb(18, 18, 20)`.
- Menú: error amigable y Reintentar visibles, pie de carrito vacío ausente. Reservas: semana futura del 12–18 de octubre de 2026 accesible; lunes 12 + sugerencia 18:00 + incremento de hora/minuto mostró 19:01; personas 2→3; sin textbox ISO. Solicitudes: estado sin sesión con acceso accionable al login.
- Mostrar/ocultar contraseña y errores inline al enviar login vacío se observaron antes de la corrección; handlers conservados. No se enviaron logins, reservas ni pedidos, ni se crearon datos de prueba backend.

- QA-01 sigue parcial y sin marcar: catálogo, selector de producto y carrito exitosos bloqueados por CORS existente (admite localhost:8081, rechaza Origin 127.0.0.1:8081); foco/teclado del selector, lector de pantalla y Android/iOS reales no verificados. Exports no sustituyen esas pruebas.

## 2026-10-06 — Prueba controlada de catálogo y carrito

- Cuenta Cliente y catálogo de prueba autorizados permitieron comprobar sesión, lectura privada y quick-add; se preservaron registros preexistentes. No se publica información de la cuenta ni identificadores de datos locales.

No se almacenaron contraseñas ni tokens.
Dependencias existentes reutilizadas; sin imagen ni receta. Las 10 comparaciones de registros previos de identidad/catálogo/dependencias permanecieron idénticas.
Health 200/UP; menú exacto, CORS de ambos orígenes 8083, login, me autenticado y lectura de solicitudes: 200. Preview 8083 conservado. Sin reinstalar, reconstruir, modificar fuentes/configuración ni detener otros servicios.

- El coordinador observó login real, perfil Cliente/email de prueba, platillo a Q35 y quick-add de una unidad. El carrito muestra el platillo exacto, cantidad 1, subtotal Q35 y botón de solicitud pickup; se dejó la sesión iniciada en `http://127.0.0.1:8083/cart`. DATA-03 completo. No se envió la solicitud.
- Envío/aceptación operativa, accesibilidad, dispositivos físicos y cobertura de inventario por receta no verificados. No se enviaron pedidos ni reservas, no se ejecutó limpieza y no hubo commits/staging. Frescura del binario respecto de fuentes actuales no comprobada.

## 2026-10-07 — Fechas y accesibilidad corregidas (FIX-01)

- Selector tipado reutilizado en Pasar a recoger y Reservas, con hora de Guatemala UTC−6 y resumen legible. Hora/minuto se anuncian como texto real, no sliders; contador de personas intacto.
- Consulta de política real integrada y validada con respuestas inyectadas: anticipación y ventana, sin promesas de disponibilidad ni días cerrados inventados. La prueba de política en el servidor en ejecución sigue bloqueada (ver FIX-03). Preparación del pedido, margen conservador y reintento con body/key exactos conservados.
- RED 9/14, GREEN 15/15; lint, typecheck y 51/51 pruebas pasaron tras normalización acotada. Fallo inicial de lint por Date.now en render corregido y comandos completos repetidos.
- Sin env/backend/dependencias/commits ni envíos reales. Navegador, dispositivo y revisión independiente pendientes (FIX-03).

## 2026-10-07 — Mensajería real corregida (FIX-02)

SecureStore nativo y memoria Web por cuenta/conversación; aviso explícito de pérdida al salir o recargar, sin localStorage.

- Historial exitoso separado de recuperación local; error no se presenta como vacío. Envío bloqueado durante carga/error/estado inseguro, recuperación validada de formatos anteriores, protección de respuestas tardías y dobles pulsaciones.
- Mensaje confirmado sigue confirmado aunque falle limpieza o actualización; reintento de limpieza no repite POST. Body/key exactos preservados y ningún reenvío automático.
- RED de pantalla real transpilada e incompatibilidad SecureStore Web observado (0/10); GREEN 16/16 de mensajería y 32/32 combinado. Lint, typecheck y 68/68 pruebas completas pasaron tras normalización; diff-check pasó. Fechas/presentación 16/16 también con TZ Asia/Tokyo.
- Pruebas con solicitudes inyectadas, sin envíos reales, login, cambios backend/env/dependencias, commits ni procesos ajenos. GET invitados de mensajes/reservas/carrito devolvieron200; SSR de reservas muestra Guatemala y sin entrada ISO, no sustituye QA montado/autenticado. FIX-03 sigue pendiente de navegador/dispositivos/verificación independiente; no hay aprobación nativa inventada.

## 2026-10-07 — QA montado e independiente (FIX-03 parcial)

- Coordinador: login de cuenta de prueba, Inicio → Contacto → Mensajes; historial real y actualización manual correctos, sin error anterior mezclado con vacío. Enviar deshabilitado con borrador vacío.
- Reservas: 8 de octubre, 18:00 → 18:01; árbol de accesibilidad anuncia Hora 18 / Minuto 01, cero sliders. Los cuatro botones ± miden 44.9125×49.6px; sin desbordamiento horizontal en 390px.
- Carrito original restaurado: Gyozas, cantidad 1, subtotal Q68. Pasar a recoger usa selector compartido; Sugerir primera hora mostró 7 de octubre, 06:58 Guatemala. Cero entradas técnicas de fecha y sin desbordamiento en 390 / 1280px.
- Verificación independiente: lint/typecheck y 68/68 pruebas completas, más 16/16 de fechas/presentación con America/Los_Angeles; sin bloqueos de implementación.
- Política en ejecución bloqueada: API 405 / BFF 404 para GET, confirmado independientemente; no es incompatibilidad de DTO. JAR BFF antiguo del 5 de octubre carece de ruta, aunque las clases compiladas desde fuentes la contienen. Aviso frontend y bloqueo de envío esperados; reconstruir/reiniciar API/BFF requiere aprobación local explícita para no desplegar cambios backend preexistentes sin permiso.
  Expo 56551 conservado; este escritor solo actualizó documentación, sin acciones de runtime.
- No se enviaron mensajes, pedidos ni reservas ni se creó conversación. FIX-03 sigue parcial por política real, revisión nativa y Android/iOS; resultados reales de envío no probados. Fuentes congeladas sin modificaciones.

## 2026-10-07 — Controles compactos del menú (MENU-01)

- Título y separaciones reducidos; eliminado el texto redundante superior. Buscar platillos conserva etiqueta accesible y placeholder, sin etiqueta visual; densidad compacta opcional sin cambiar los campos de otros formularios.
- Categorías en una fila horizontal con objetivo mínimo de 44px, marca visible de selección y foco de teclado con token existente. Estilos de interacción sin className para conservarlos con el adaptador Web instalado. Tarjetas, imágenes, datos, filtros y protecciones de agregado intactos.
- RED ejecutable 12/14 por etiqueta y texto superior aún visibles; GREEN 14/14. Lint, typecheck y 70/70 pruebas completas pasaron tras normalización acotada de fuentes. Typecheck inicial detectó propiedades de color inexistentes y se corrigieron antes de repetir los comandos.
- MENU-02 parcial: pruebas de componentes transpilados/adaptador no acreditan medidas montadas. Pendientes QA del coordinador en 390px/escritorio, primer platillo visible, búsqueda/categorías/foco, desbordamiento, hashes protegidos y dispositivos/revisión nativa.
- Sin cambios de tarjetas/servidor/env/dependencias, envíos ni commits. La solicitud actual no autoriza reconstruir API/BFF; se mantiene el bloqueo de política real documentado en FIX-03.
  Expo instalado/offline, CI1, sin dotenv, BFF explícito y resolución IPv4.

## 2026-10-07 — Política real de reservas verificada

- La política exportada por Core y reenviada por BFF valida anticipación mínima de3 horas y ventana14:00–21:15. Invitados y roles no Cliente quedan rechazados; la UI consume el esquema real y mantiene la decisión final del servidor.
- Se corrigió la deriva de los artefactos publicados localmente sin reescribir la implementación correcta. Nueve regresiones verifican DTO/consistencia, autorización, reenvío privado, errores, ruta exacta y CORS. No se inventó un RED de código: el defecto era la diferencia entre fuentes y binarios anteriores.
  Intentos restringidos por sockets/Docker no se presentan como prueba final; un primer Core omitió8 pruebas. El empaquetado BFF original falló al renombrar un JAR abierto y se preservó el artefacto anterior antes de producir uno separado.
- Prueba Web montada con perfil Cliente:3h/14:00–21:15 reales; fecha8 de octubre18:00→18:01, advertencia de ventana a13:00, advertencia de anticipación el mismo día a13:01 y retención de fecha/política tras refrescar solicitudes. Preorden informativa restaurada a No.
- Controles44×50/45×50 en390×844 y ausencia de overflow en1280×900. La rama exitosa no mostró Actualizar política; su recuperación no fue verificada independientemente. No hubo envíos de reservas, pedidos, mensajes, cancelaciones ni perfil en esta comprobación.
- Sigue pendiente la comparación directa del payload Core autenticado, Android/iOS instalados, WAN y resultados de envíos reales. La prueba Web no sustituye dispositivos ni acredita aprobación nativa.
- Próximas decisiones: carrito de invitado al iniciar sesión y durabilidad Web; no asumir transferencia, descarte ni persistencia.

## 2026-10-06 — Correcciones de integración y contacto conservadas

- Se conserva la reparación previa de conflictos de integración y configuración NativeWind de Babel, Metro, Tailwind, CSS global, tipos y lockfile; controles compartidos compatibles con pantallas históricas.
- Perfil, direcciones y pantalla histórica de entrega conservan normalización Guatemala: ocho dígitos agrupados y prefijo +502 opcional. Delivery/direcciones siguen fuera de esta entrega y sus rutas no se habilitan en el BFF.
- Corrección documental: Core actual acepta hasta20 platillos distintos por solicitud, no100. Se conserva el guard de20 líneas del carrito por autorización explícita, sin ampliar límites API. Precio, capacidad, inventario y aceptación siguen siendo decisiones del servidor.
  Se reutilizaron dependencias instaladas; no se modificó el lockfile ni se instalaron paquetes. Los exports históricos Android/Web no son APK ni prueba física.

## 2026-10-09 — Reservas aisladas por cuenta y sesión

- Formulario, historial y avisos se reinician al cambiar de cuenta, iniciar una nueva sesión o cerrarla.
- Las respuestas anteriores no modifican la sesión actual; las operaciones del borrador local permanecen ordenadas entre sesiones.
- Se conservan la selección según política, la hora de Guatemala y la cancelación de solicitudes pendientes.

- Verificación observada: 80/80 pruebas móviles, 10/10 de ciclo de reservas y 14/14 de presentación.
- Lint, typecheck y comprobación del diff pasaron después de la normalización acotada.
- Versiones de dependencias y lockfile sin cambios; se reutilizó la instalación existente.

- Pendiente: completar las protecciones del reintento y la validación del resultado de la solicitud.
- No se realizaron aún pruebas en dispositivos, builds nativos ni comprobación de compatibilidad de dependencias para este cambio.

## 2026-10-09 — Reintentos de reservas con resultado validado

- Envío protegido frente a pulsaciones repetidas; cada intento conserva su cuenta, sesión, datos y clave originales.
- Un resultado incierto bloquea la edición y ofrece reintentar la misma solicitud. No se crean reenvíos automáticos ni persistencia adicional del intento al reiniciar la aplicación.
- Una evaluación sin envío conserva el formulario editable. Sólo una respuesta validada que acredita el envío lo vacía; esto no confirma la reserva.
- Un rechazo explícito del primer envío permite corregir el formulario. Si ya hubo incertidumbre, un rechazo posterior no acredita por sí solo el resultado anterior.
- La restauración tardía y los guardados pendientes no reemplazan los datos bloqueados ni recrean un borrador ya enviado.
- Verificación observada: 107/107 pruebas móviles, 37/37 de reservas y 14/14 de presentación; lint, typecheck y comprobación del diff pasaron.
- Dependencias, lockfile, controles de transporte, política, hora de Guatemala y comportamiento de pickup conservados.
- Compatibilidad no confirmada: la comprobación Expo sin conexión falló por diferencias de versiones en dependencias que no se modificaron y advirtió que la validación offline no es fiable. Pendientes verificación en línea, QA en dispositivos físicos y builds nativos.

## 2026-10-09 — Candidato combinado verificado

- Responsable confirma conservar PR36/50 y excluir PR34. Bundles Android e iOS Hermes y exportación web móvil con 17 rutas aprobados; 109 pruebas, lint y tipos pasan. No equivale a compilación firmada o QA físico.
- Compatibilidad Expo comprobada en línea. Overrides de parser CSS y UUID reducen los avisos; puerta de seguridad local pasa con excepciones existentes y caducidad obligatoria.
