# Plan de la app Cliente de WOK Asian Food

> **Plan vigente desde 2026-09-25.** El plan de pickup conservado más abajo queda `SUPERSEDED` como alcance total. La app cubre todo el canal Cliente. Se implementará por slices integrados con la API WOK; una pantalla Expo o un mock no acredita un caso de uso.

## Estado verificado al 2026-10-05

`feature/mobile-shell` contiene APP-01, identidad Cliente parcial, y flujos conectados para menú, pickup, delivery, reservas e historial. La reserva permite adjuntar una preorden del menú; la app y la agenda Operativa presentan los snapshots revisables sin aceptar el pedido ni apartar inventario. Persisten huecos en flujos completos de checkout/pagos, factura propia, mensajería, pruebas de dispositivo Android/iOS y builds instalables. Consultar [progreso móvil](../progress/MOBILE.md) para evidencia y límites. Esto no equivale a completar la app Cliente.

## Arquitectura vigente

React Native + Expo + TypeScript + Expo Router. TanStack Query administra datos del servidor; React Hook Form y Zod validan entrada; un cliente tipado desde OpenAPI comparte contrato con la web, no entidades JPA ni componentes DOM. Access JWT breve en memoria, refresh revocable en almacenamiento seguro; la app nunca contiene secretos del servidor, backend ni modelo IA. Usa `https://api.<dominio>/api/v1` dentro y fuera del local mediante DNS dividido, sin detectar Wi-Fi por código. Carrito, caché y borradores pueden sobrevivir offline; pedidos, reservas, disponibilidad y pagos requieren confirmación online y revalidación.

## Cobertura funcional completa

| Slice            | Vistas y resultado                                                                          | API/dependencia                   |
| ---------------- | ------------------------------------------------------------------------------------------- | --------------------------------- |
| APP-01 Base      | navegación, diseño accesible, estados carga/error/offline y configuración pública           | API/health                        |
| APP-02 Identidad | registro CLIENT, verificación, login, Google, reset, sesión, logout y perfil                | IAM, email mock/real              |
| APP-03 Catálogo  | menú público, detalle, modificadores, disponibilidad y carrito local                        | catálogo y servicio; menú real    |
| APP-04 Reservas  | formal y mesa digital, 3 h, horarios compatibles, preorden con snapshots, solicitudes y política | capacidad/reservas             |
| APP-05 Pedidos   | pickup/delivery, dirección y contacto, checkout, ETA, seguimiento e historial               | pedidos/KDS/ownership             |
| APP-06 Finanzas  | pasarela segura/3DS, métodos habilitados, facturas propias y perfiles fiscales              | pagos/FEL; adapter real pendiente |
| APP-07 Atención  | mensajes, adjuntos permitidos, estado humano/IA y notificaciones                            | messaging/AI Gateway              |
| APP-08 Calidad   | ownership A/B, doble envío, WAN, refresh reuse, accesibilidad Android/iOS y build instalado | todos los slices                  |

El backend calcula precio, disponibilidad, ETA, impuestos, comisiones y total. WOK nunca recibe PAN/CVV en la app. Una imagen de comprobante puede abrir revisión; OCR no significa pago verificado. Solicitudes no recibidas durante corte WAN permanecen como borrador y no se envían solas al volver la red.

## Contratos y entregas

Cada slice incluye navegación, DTO de `/api/v1`, estado vacío/carga/error, prueba de permiso y recorrido cruzado con Web Operativo/Administrativo cuando aplica. La app no habla con PostgreSQL ni runtime IA. El acceso Google nuevo exige Internet; sesiones WOK ya vigentes siguen las reglas del core local cuando el dispositivo está en LAN. Publicar en tiendas, proveedor de pago, dominio y Apple OAuth son decisiones separadas; no frenan los mocks y pruebas de los flujos.

---

## Historial: plan de pickup `SUPERSEDED`

| Campo           | Base de planificación                                                                        |
| --------------- | -------------------------------------------------------------------------------------------- |
| Revisión        | 2026-09-15; propuesta documental                                                             |
| Plataforma      | Android e iPhone; sólo contexto Cliente                                                      |
| Backend         | Java/Spring Boot mediante REST/OpenAPI; comparte API con la web                              |
| App recomendada | React Native + Expo + TypeScript                                                             |
| Plazo global    | 5–6 semanas; fecha exacta pendiente                                                          |
| Reserva final   | Últimas 2–3 semanas para seguridad, integración, estabilidad y entrega                       |
| Equipo          | M1 principal; B2 apoya por bloques; una segunda persona completa depende de liberar frontend |
| Coordinación    | Edgar continúa PM; Scrum Master rotativo                                                     |
| Evidencia móvil | No se han producido fallos; dudas de compatibilidad preventivas                              |

## 1. Decisión de tecnología y resultado esperado

Recomiendo **React Native con Expo**, conservando React/TypeScript del trabajo web y utilizando el backend Spring conocido por el equipo. Expo es un framework sobre React Native: la comparación relevante es usar React Native con sus herramientas, configurarlo manualmente o adoptar Flutter. La guía oficial de React Native recomienda un framework para nuevos proyectos y presenta Expo como opción. [React Native: inicio](https://reactnative.dev/docs/environment-setup).

Para este proyecto, la facilidad proviene de un entorno reproducible y pocas piezas: Expo, navegación consistente, cliente REST y componentes nativos sencillos. No desarrollar un backend Node adicional para la app. Flutter sigue siendo una alternativa válida si el equipo ya tiene mayor experiencia demostrable allí, pero no hay un fallo observado que justifique cambiar sólo por temor a incompatibilidad. Su integración iOS también necesita herramientas y firma apropiadas. [Flutter: configuración iOS](https://docs.flutter.dev/platform-integration/ios/setup).

Resultado de la entrega candidata: un cliente inicia sesión, consulta menú/detalle, arma carrito, envía una solicitud para recoger y observa su aceptación/preparación/listo desde la misma información que usa Operativo. Nunca podrá cobrar, editar catálogo, ver inventario interno o aceptar pedidos ajenos desde la app.

El catálogo funcional Cliente completo sigue incluyendo reservas, mensajes y perfil. **El recorte de entrega no está aprobado por existir este plan**: PM e ingeniero deben contrastarlo con la rúbrica durante los primeros dos días. Si todas las funciones Cliente son obligatorias, reestimar y reasignar personas antes de comprometer el calendario; no trasladarlas al período reservado a seguridad.

## 2. Alcance y pantallas

Referencias: [guía Cliente](../frontend/channels/CLIENT.md), [reglas comunes](../frontend/channels/README.md) y [plan backend](../backend/DEVELOPMENT_PLAN.md). La web sirve como referencia funcional y visual, no como código HTML que se copie directamente a React Native.

| Vista de origen | Pantalla/flujo móvil      | Entrega candidata                                                      | Criterio observable                                                                       |
| --------------- | ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| C-01            | Acceso y cierre de sesión | Núcleo; registro/verificación/recuperación condicionados a API/rúbrica | Login real, error neutral, sesión revocada no permite operar                              |
| C-02            | Inicio                    | Núcleo sencillo                                                        | Estado del servicio, acceso a menú y mis pedidos; sin recomendaciones inventadas          |
| C-03            | Menú                      | Núcleo                                                                 | Categorías/listado, estado vacío/error/carga y disponibilidad simplificada                |
| C-04            | Detalle                   | Núcleo                                                                 | Opciones min/max válidas, cantidad y precio orientativo; no admite extras no configurados |
| C-05            | Carrito                   | Núcleo                                                                 | Editar cantidad/eliminar, resumen y navegación; no reserva stock                          |
| C-06            | Solicitud/reconexión      | Núcleo de error/degradación                                            | No confirmar sin API; conservar borrador y resolver envío de resultado incierto           |
| C-07/08         | Reservas y reserva tardía | Extensión posterior o intercambio de alcance aprobado                  | API valida horario/capacidad; no prometer reserva desde validación local                  |
| C-09            | Revisar y enviar          | Núcleo para recoger                                                    | Revalidación de servidor; envío idempotente; estado pendiente visible                     |
| C-10            | Mis pedidos y detalle     | Núcleo                                                                 | Sólo propios, estados/ETA del servidor y actualización al volver a primer plano           |
| C-11            | Ubicación                 | Extensión de bajo esfuerzo si datos confirmados                        | Abrir enlace externo autorizado; sin SDK de mapas ni rastreo para el núcleo               |
| C-12            | Mensajes y comprobantes   | Posterior salvo obligación de rúbrica                                  | Requiere API, aislamiento por conversación, permisos y política de archivos               |
| C-13            | Mi cuenta                 | Núcleo: datos mínimos y salir; gestión completa posterior              | Leer `/me`, cerrar sesión, limpiar datos privados locales; no simular borrado de cuenta   |

La app incluye exclusivamente Cliente. Operativo, KDS y Administrativo permanecen en web. No se duplican sus módulos móviles ni se añade selector de rol operativo al menú de Cliente. El servidor sigue validando permisos aunque alguien modifique el cliente.

Navegación sugerida: Inicio, Menú, Pedidos y Mi cuenta; acceso al carrito con contador. Detalle, checkout y seguimiento se abren sobre esa estructura. Ocultar accesos a extensiones no implementadas o indicar claramente su condición de demostración; nunca mostrar éxito ficticio.

Modalidad inicial: para recoger; pago al recibir mediante método habilitado en servidor. La app no registra cobros. Delivery, reservas con preorden, pagos online, push, chat, adjuntos, biometría y cámara no se añaden al núcleo por disponibilidad de un SDK.

## 3. Entorno de trabajo

1. Revisar si ya existe proyecto móvil y conservar código aprovechable. No se verificó una app Expo existente en la rama local al preparar este documento.
2. Elegir SDK estable de Expo con sus versiones compatibles de React Native/React y runtime Node. Registrar versión en README y lockfile; no copiar automáticamente las versiones de Next.js.
3. Usar Expo Router para una navegación única si no existe otra solución ya validada. Evitar mezclar librerías de navegación por integrante.
4. Comenzar con Android físico/emulador y un iPhone físico disponible. Probar ambos en la primera semana.
5. Expo Go puede servir para el experimento inicial; usar development build cuando la funcionalidad/distribución lo requiera y acordar qué se entregará. [Development builds](https://docs.expo.dev/develop/development-builds/introduction/).
6. Preparar perfiles development y preview; production sólo cuando se necesite publicar. Configuración pública de la app contiene URL/flags, nunca claves de DB, firma o proveedor.
7. No convertir la app en WebView de la web salvo cambio de alcance explícito del ingeniero. La propuesta es una UI nativa sencilla.

Backend local: Spring Boot en IDE y PostgreSQL en contenedor. El teléfono debe acceder a una URL alcanzable de la API; `localhost` en el teléfono no apunta a la computadora. La conexión del bundler Expo no expone por sí misma la API Spring. Probar LAN/hostname, TLS y acceso desde el dispositivo real. No desactivar globalmente verificación TLS ni abrir PostgreSQL al teléfono para resolver conectividad.

Si se confirma monorepo, estructura candidata:

```text
apps/mobile/
  app/                  rutas y layouts Expo Router
  src/features/         auth, menu, cart, checkout, orders, profile
  src/services/         API y adaptadores de sesión
  src/components/       controles nativos compartidos
  src/config/           configuración pública validada
  src/test/             utilidades de pruebas
```

Crear carpetas conforme se implementen. Si el equipo usa repos distintos, conservarlos durante la entrega y compartir el contrato OpenAPI versionado. Java mantiene sus DTO; web/app pueden compartir cliente TypeScript, utilidades puras y textos cuando convenga. No compartir entidades JPA, CSS Modules ni providers de sesión ligados a Next.js.

## 4. Contratos que debe entregar backend

Todas las rutas son propuestas bajo `/api/v1`, no endpoints existentes confirmados. B1/B2 y M1 las revisan en los primeros dos días; publicar ejemplos sintéticos para desarrollar pantallas mientras llega la implementación.

| Operación                                                            | Contrato mínimo                                                    | Comportamiento de app                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `POST /auth/login`, `/auth/logout`; renovación según sesión acordada | Sesión, vencimiento y error neutral                                | No almacenar contraseña; cerrar acceso ante revocación       |
| `GET /me`                                                            | ID y datos públicos del cliente autenticado                        | No utilizar IDs arbitrarios para determinar dueño del pedido |
| `GET /service-status`                                                | Servicios habilitados, hora de consulta, mensaje y ETA orientativo | Mostrar estado desactualizado si falla red                   |
| `GET /menu`, `/menu/items/{id}`                                      | IDs, nombres, precio decimal/moneda, opciones y disponibilidad     | Adaptar al componente; cache no garantiza venta              |
| `POST /order-requests`                                               | Líneas con IDs/cantidades/opciones, modalidad y clave idempotente  | Guardar ID de solicitud; `202` significa pendiente           |
| `GET /order-requests/{id}`                                           | Estado y `orderId` sólo si fue aceptada                            | Seguir solicitud antes de existir pedido                     |
| `GET /orders?scope=mine`, `/orders/{id}`                             | Lista/detalle propio, estado operativo, pago separado y ETA        | El backend limita propiedad; el parámetro no concede acceso  |
| `POST /client/order-requests/{id}/change-requests/items/{itemId}/quantity` | Cantidad positiva + motivo; dueño, versiones y estado de cocina validados | Mantener la cantidad actual hasta decisión del personal; repetir con la misma clave recupera el mismo resultado |
| `GET /client/order-requests/change-requests` + `PATCH /operational/order-change-requests/{id}` | Estado, cantidad solicitada, decisión Operativa versionada | Refrescar al aprobar/rechazar; no asumir un cambio mientras siga pendiente |
| Consulta/reintento de operación                                      | Misma clave, hash y resultado estable                              | Resolver timeout sin crear un segundo envío                  |

Si el backend permite cancelar una solicitud pendiente, agregar un comando explícito con control concurrente frente a aceptación. No ofrecer “Cancelar pedido confirmado” sin reglas y endpoint implementados.

Convenciones: UUID/string, fechas ISO con zona, dinero como string decimal y moneda, enums técnicos en inglés, textos visibles en español. Usar código de error estable y `requestId`; no mostrar trazas Java al usuario. Diferenciar 401 (sesión), 403 (permiso), 409 (conflicto), 422 (regla), 503 (servicio no disponible).

Si cambió el precio o un producto dejó de estar disponible, presentar el cambio y pedir revisión antes de enviar una solicitud nueva. No confiar en total del cliente. Mantener clave idempotente para reintentos idénticos; una edición deliberada genera una nueva operación después de resolver el estado anterior.

Prueba contractual obligatoria: una solicitud enviada desde app aparece en Operativo; su aceptación genera un pedido cuyo estado vuelve a app. Una solicitud no aceptada nunca aparece como venta confirmada.

## 5. Estado, red y autenticación

- **Carrito:** estado local, sin reserva de existencias. Puede guardarse como borrador sin credenciales; revalidar antes de enviar y separar/limpiar al cambiar de cuenta.
- **Datos del servidor:** mantener caché pequeña con fecha de consulta. Menú puede mostrarse desactualizado; pedido confirmado requiere evidencia de API.
- **Seguimiento:** polling configurable sólo con pantalla/app activa, por ejemplo cada 10 segundos como propuesta a validar. Detener al cerrar sesión/ir a segundo plano y refrescar al volver. WebSocket/push pueden añadirse después.
- **Envío:** deshabilitar doble toque visualmente y garantizar idempotencia en servidor. Persistir metadatos mínimos de operación pendiente vinculados al usuario para resolver una respuesta perdida tras reinicio; no almacenar secretos en ellos.
- **Offline:** permitir editar borrador y consultar caché identificada. No enviar automáticamente al reconectar, ni confirmar pedido o pago fuera de línea.
- **Sesión:** acordar un mecanismo con Spring Security y comprobarlo desde web/móvil durante semana 1. Propuesta móvil si se usan tokens: acceso breve en memoria y refresh revocable en SecureStore, renovación única ante solicitudes paralelas, sin reintentos infinitos. No crear otro emisor de tokens exclusivo de móvil.
- **Salida:** revocar sesión en API cuando exista conexión, borrar tokens y datos privados locales, descartar resultados de peticiones antiguas. Si logout remoto falla, informar y limpiar localmente; no afirmar revocación remota ya realizada.

SecureStore ofrece almacenamiento local protegido, pero no reemplaza revocación del servidor ni un plan de sesión perdida/reinstalación. [Referencia oficial](https://docs.expo.dev/versions/latest/sdk/securestore/).

## 6. Organización y backlog móvil

M1 conserva responsabilidad del flujo; B2 apoya contrato/sesión y tareas acotadas. F1 puede revisar UX/contrato de Cliente y pasar a móvil cuando termine su trabajo web asignado. La segunda persona no cuenta como disponible completa hasta registrar esa reasignación.

Las estimaciones siguientes son esfuerzo total del paquete, incluidas pruebas/revisión propias, y no se suman de nuevo al antiguo MB-01/MB-02. Son candidatos de trabajo nuevo: descontar únicamente lo ya implementado y verificado.

| ID     | Trabajo                                            | Responsable / apoyo       | Dependencia                                | Horas | Aceptación                                                            |
| ------ | -------------------------------------------------- | ------------------------- | ------------------------------------------ | ----- | --------------------------------------------------------------------- |
| APP-01 | Base Expo, navegación y experimento Android/iPhone | M1 / B2                   | Dispositivos y distribución acordada       | 6–8   | App abre y consulta API de prueba en ambos; lockfile reproducible     |
| APP-02 | Cliente HTTP, sesión y Mi cuenta mínima            | M1 / B2                   | Contrato/auth backend                      | 8–12  | Login/logout real, error neutral, sesión vencida y limpieza local     |
| APP-03 | Inicio, menú/detalle y carrito                     | M1 / F1 cuando disponible | DTO catálogo y servicio                    | 10–14 | Opciones válidas, cantidades, estados de carga/error/vacío y borrador |
| APP-04 | Checkout, solicitud y seguimiento                  | M1 / B2                   | Idempotencia, solicitud y estados backend  | 12–18 | Flujo real compartido con Operativo; timeout/reinicio no duplica      |
| APP-05 | Revisión de seguridad y regresión móvil            | M1 + revisor rotativo     | APP-01–04 terminados                       | 8–12  | IDs ajenos, revocación, logs, errores y cambio de cuenta probados     |
| APP-06 | Builds, dispositivos, documentación y ensayo       | M1 + revisor rotativo     | APP-05 y distribución probada desde APP-01 | 6–10  | Artefacto acordado instala/ejecuta y guion se reproduce               |

**Construcción APP-01–04: 36–52 h. Bloque final APP-05–06: 14–22 h. Total: 50–74 h.** No incluye registro/recuperación por correo, reservas, chat, pagos nativos ni publicación en tiendas.

Con 1.5 personas equivalentes, 12–15 h/semana y 30% de margen, hay sólo 25–32 h para construir en dos semanas o 38–47 h en tres. El extremo alto no cabe: revisar disponibilidad/avance real, simplificar UI y liberar apoyo del frontend. No quitar pruebas de autorización o idempotencia para compensar. Consultar [capacidad conjunta](../backend/DEVELOPMENT_PLAN.md).

## 7. Calendario móvil sincronizado

| Bloque                                      | Entrega de app                                              | Dependencia y límite                                                                             |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Días 1–2                                    | APP-01 iniciado y decisión de distribución                  | No esperar al final para acceso a iPhone, API y firma                                            |
| Semana 1                                    | Acceso/base, navegación, catálogo y carrito inicial         | Contratos estables; mock explícito permitido hasta integrar                                      |
| Semana 2                                    | Envío/seguimiento con API; flujo Cliente completo candidato | Necesita aceptación backend; congelar aquí si quedan tres semanas de seguridad en plazo de cinco |
| Semana 3, sólo si autorizada como funcional | Completar corte comprometido y prueba cruzada               | No abrir reservas/chat para llenar tiempo; congelar al final                                     |
| Primera semana final                        | APP-05: seguridad, red y regresión                          | Sesión/permiso ya existen; aquí se revisan y corrigen                                            |
| Segunda semana final                        | APP-06: builds y ensayo con backend desplegado              | Artefacto/dispositivos/versiones identificados                                                   |
| Tercera semana final, si existe             | Correcciones, accesibilidad, ensayo y entrega               | Sin funciones nuevas ni migración de framework                                                   |

Si se elige cinco semanas con tres de seguridad, APP-01–04 deben caber en dos semanas: el plan no presupone una tercera semana oculta. Si no cabe con evidencia del día 2, negociar capacidad o alcance con PM/ingeniero de inmediato.

## 8. Seguridad básica y revisión final

Desde la primera historia: validación de servidor, contraseñas protegidas, autorización por objeto, mínimos datos, transporte seguro en entorno compartido y sesión revocable. El bloque de 2–3 semanas finales revisa esos controles, corrige debilidades y mejora operación; no introduce por primera vez Spring Security.

| Prueba                                         | Resultado esperado                                    | Responsable principal |
| ---------------------------------------------- | ----------------------------------------------------- | --------------------- |
| Cambiar ID de solicitud/pedido a otro cliente  | Servidor deniega sin exponer detalle                  | B2; M1 reproduce      |
| Suspender/revocar sesión y volver a pantalla   | Acceso denegado, caché privada limpiada               | B2 + M1               |
| Dos toques y timeout después de commit         | Un solo efecto y estado recuperable                   | B1 + M1               |
| Cambiar de cuenta con solicitud HTTP pendiente | Respuesta anterior no aparece en nueva sesión         | M1                    |
| Precio/stock cambian durante carrito           | Servidor revalida; app muestra conflicto comprensible | B1 + M1               |
| WAN caída y posterior reconexión               | Borrador permanece; no confirmación/autoenvío         | Equipo                |
| Reiniciar app durante envío                    | Recuperar resultado con operación existente           | M1 + B1               |
| Logs/configuración/paquete                     | Sin contraseña, refresh token o secretos de servidor  | Revisor rotativo      |
| Texto grande, teclado y áreas seguras          | Controles legibles y accesibles en Android/iPhone     | M1 + F1               |
| Build instalado distinto al desarrollo         | Misma API, sesión y navegación verificadas            | M1 + SM               |

Registrar pruebas con dispositivo/OS/build, entorno API, datos sintéticos, resultado y defecto vinculado. Un emulador Android por sí solo no prueba iPhone; abrir Expo Go no prueba el binario independiente de entrega.

## 9. Distribución y evidencias

Definir con el ingeniero qué cuenta como entrega: demostración desde Expo Go, development build, build interno o publicación. Son productos distintos. No asumir que el curso exige tiendas ni contratar servicios sin decisión.

EAS Build puede construir binarios para Android e iOS; para iOS se deben resolver firma y provisioning. Distribución ad hoc en iOS requiere membresía Apple Developer de pago y dispositivos registrados; eso se comprueba al principio. Linux puede utilizar compilación remota, pero no ejecutar el simulador iOS local de Xcode. [EAS Build](https://docs.expo.dev/build/introduction/), [distribución interna](https://docs.expo.dev/build/internal-distribution/).

Entregables:

- Proyecto con versiones/lockfile fijados y README de ejecución.
- Contrato API correspondiente al build y configuración de entorno sin secretos.
- Artefacto o modalidad de demostración acordada, probado en Android e iPhone.
- Matriz de funciones reales, demostrativas y pendientes.
- Evidencia de seguridad y flujo completo entre app y web.
- Guion reproducible: acceder → menú → carrito → solicitud → aceptación Operativa → cocina → seguimiento; cobro sólo si está en corte backend.
- Registro de limitaciones y handoff para el siguiente SM; sin chats ni datos de clientes reales.

## 10. Decisiones de arranque

PM confirma fecha y semana de congelamiento; el equipo confirma horas, puestos F1/F2/F3/B1/B2/M1 y fracción del apoyo. B1/B2 realizan el inventario del backend ya desarrollado y publican contrato mínimo. M1 prueba Android/iPhone y distribución. El ingeniero valida el corte Cliente requerido.

Hasta obtener esas decisiones se puede revisar código, preparar contratos y priorizar; no se declara que el catálogo completo Cliente cabe en el plazo ni que existen incompatibilidades móviles comprobadas. La opción recomendada sigue siendo Spring Boot para aprovechar experiencia backend y Expo para reducir configuración móvil.
