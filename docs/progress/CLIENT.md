# Progreso del canal Cliente

## 2026-09-15 — Flujo unificado por canal

- Se retiraron las barras de navegación de demostración de las rutas Cliente para que el `AppShell` sea la navegación única.
- Se conectaron los accesos de inicio y sidebar con Reservas, Mensajes, Ubicación, Pedidos, Menú y Carrito.
- Los formularios de reserva y mensajería quedan identificados como pendientes de ampliación; sus rutas ya son alcanzables dentro del flujo.
- Cliente mantiene fixtures y estado local propios; Operativo y Administrativo conservan sus layouts y rutas independientes.

## 2026-09-15 — Integración funcional del flujo Cliente

- Se conectó el checkout de Cliente con el `CartProvider`: los artículos, cantidades, opciones, servicio y subtotal ahora provienen del carrito de la sesión.
- El carrito ofrece acceso directo a revisar la solicitud; el checkout permite revalidación local y envío pendiente demostrativo.
- Inicio enlaza Reservar, Ubicación y Mensajes con sus vistas del canal.
- Verificaciones: typecheck, diff check y 216 pruebas aprobadas.

## 2026-09-11 — Correcciones PR #8 C-07, C-09 y C-10

- Rama: `feature/client-views-c07-c12`
- Completado: C-09 ahora identifica Mesa, Para recoger y Delivery mediante controles de demostración con query validado. Mesa oculta precios, total, pago, métodos y propina; presenta únicamente una solicitud pendiente simulada. Para recoger y Delivery conservan el resumen monetario y métodos orientados a Cliente, sin datos ni acciones Operativas.
- Completado: C-07 dirige el preorden “Sí” temporalmente a `/menu`, con un aviso explícito de selección de platillos y sin carrito ni persistencia. C-08 y `?demo=late` se conservan.
- Completado: C-10 incorpora `/client/orders`, una lista demostrativa de Cliente con enlaces a `/client/orders/[orderId]`, estado vacío y fixtures exclusivos de Cliente. Se mantienen los controles de estados dentro del seguimiento individual.
- Decisiones: no se crearon `/orders`, `/orders/[orderId]`, carrito, provider, integración de pago, API ni persistencia. No se modificaron `/menu`, módulos de menú, AppShell, navegación compartida ni módulos Operativos.
- Pendiente: integrar C-05 como fuente real de servicio y artículos del checkout, y sustituir los controles demostrativos cuando exista el contrato de carrito aprobado.

## 2026-09-11 — C-11 y C-12

- Rama: `feature/client-views-c07-c12`
- Vistas: ubicación pública y mensajería demostrativa de Cliente
- Completado: `/location` conserva `PublicHeader` y muestra una ficha `LocationSnapshot` con dirección, horario y `navigationUrl` opcionales. Sin datos confirmados, informa “Ubicación pendiente de confirmación” y “Proveedor de navegación pendiente”, y deshabilita “CÓMO LLEGAR”. También se cubre el permiso de ubicación denegado sin solicitar geolocalización.
- Completado: `/client/messages` permite seleccionar conversaciones genéricas demostrativas, enviar texto únicamente en memoria y mostrar estados de conexión, envío local, error y atención humana requerida. La selección local de comprobante solo presenta su nombre, no lee ni transfiere el archivo, y se limpia al cambiar de conversación.
- Archivos principales: `apps/web/src/modules/location`, `apps/web/src/modules/messaging`, fixtures tipados de ubicación y mensajería de Cliente, y sus rutas.
- Decisiones: no se implementaron mapas, SDKs, geolocalización, coordenadas, rastreo, distancia, APIs, WebSocket, cookies, localStorage ni backend. Se conserva la navegación pública en C-11 y el `AppShell` existente en C-12.
- Pendiente: confirmar dirección, horario, proveedor y `navigationUrl` oficiales; integrar mensajería real y reglas de adjuntos solo con contratos aprobados. La integración futura C-05 → C-09 sigue pendiente y no se creó otro carrito.

## 2026-09-11 — C-09 y C-10

- Rama: `feature/client-views-c07-c12`
- Vistas: C-09 checkout demostrativo y C-10 seguimiento de pedido de Cliente
- Completado: ruta `/client/checkout` compuesta con un `CheckoutSnapshot` inmutable y fixture temporal claramente identificado; selección visual de pago, revalidación local simulada y solicitud pendiente sin procesar pagos ni confirmar pedidos. La ruta `/client/orders/[orderId]` muestra los estados pendiente, confirmado, en preparación, listo, retrasado y entregado con fixtures exclusivos de Cliente.
- Aislamiento: C-10 no importa `modules/orders`, `OrderSessionProvider`, `orders.ts` ni estilos/rutas Operativas. Los fixtures de tracking son propios de Cliente y no contienen proveedores, teléfonos, ubicaciones ni información real.
- Pendiente: integrar C-05 → C-09 mediante un adaptador que construya `CheckoutSnapshot` desde la API pública real del `CartProvider`; no se creó carrito, provider, contexto, persistencia ni lógica duplicada.

## 2026-09-11 — C-07 y C-08

- Rama: `feature/client-views-c07-c12`
- Responsable: Carlos Chan
- Vistas: C-07 creación de reservación y C-08 reservación tardía
- Completado: ruta `/client/reservations/new`, formulario con fecha, hora, personas, preorden, nota y hora objetivo opcional; validación, disponibilidad y confirmación pendiente simuladas; aviso integrado para horas posteriores a 21:15 con preorden obligatorio y acciones para usar 21:15 o elegir otra hora
- Archivos principales: `apps/web/src/modules/reservations`, `apps/web/src/data/fixtures/reservations.ts` y la ruta de Cliente de reservaciones
- Pruebas: 30 pruebas unitarias aprobadas y lint aprobado. `format:check` reporta problemas preexistentes fuera del bloque; typecheck y build se detienen en tipos generados bajo `.next/dev/types`.
- Decisiones: se conserva `AppShell` y su navegación existente para evitar duplicar la barra del mockup; los datos y la confirmación se identifican explícitamente como simulados.
- Pendiente: revisión visual manual a 390, 768, 1280 y 1440 px cuando estén disponibles las dependencias; confirmar con coordinación si la navegación específica del mockup debe sustituir o complementar la navegación compartida.

Responsables: Barrera y Carlos Chan.

Agregar aquí los avances más recientes siguiendo la plantilla de [README.md](README.md).

## 2026-09-11 — Revisión para publicación de C-01 a C-06

- Rama: `feature/frontend-client`; destino: PR hacia `development`, sin merge.
- Vistas trabajadas: C-01 (`/login`, `/register`, `/forgot-password`, `/verify-email` y formularios relacionados), C-02 (`/client`), C-03 (`/menu`), C-04 (`/menu/[productId]`), C-05 y C-06 (`/client/cart`). Implementación demostrativa; no se declara completo todo el catálogo de criterios de estas vistas.
- Resultado: navegación desde autenticación e inicio hasta catálogo, configuración, carrito en memoria y espera pendiente. Se conservan modificadores, cantidades y servicio durante navegación SPA; recargar vacía la sesión. C-05/C-06 sustituyen los límites históricos de C-04/C-05 descritos más abajo.
- Áreas principales: rutas Cliente/menú, `modules/auth`, `modules/clients`, `modules/menu`, `modules/cart`, fixtures de menú/servicio/carrito/espera, proveedor, navegación, shell, campos y estilos. Se incluye el logo local utilizado por autenticación; su aprobación como asset oficial no está documentada.
- Revisión: 49 archivos de Cliente seleccionados, sin secretos detectados ni archivos personales. Se excluye `apps/web/next-env.d.ts` por ser una variación generada por Next.js, conservándola localmente. Sin cambios de dependencias, APIs ni credenciales.
- Pruebas: `npm run lint`, `npm run typecheck`, `npm run test` (50 pruebas en 12 archivos) y `npm run build:web` aprobados. Se usó `npm.cmd` por la política de PowerShell. Prettier 3.6.2 temporal: los archivos seleccionados pasan; `npm run format:check` global falla en 81 archivos sin cambios respecto de HEAD. El fallo inicial incluía 121 archivos; se corrigió únicamente el formato de los archivos seleccionados.
- Responsive y accesibilidad: Brave headless, 390, 768, 1280 y 1440 px (también 375 para C-02/C-03/C-04/C-06), sin overflow horizontal observado. Búsqueda/vacío, opciones obligatorias, producto no disponible/inexistente, Q75/Q150, espera, aviso local, cancelación y reconexión comprobados. Teclado Espacio/Escape, foco visible y touch emulado de opción en C-04 verificados. C-01 conserva botones de método de acceso y enlaces menores de 44 px: pendiente corregir. No equivale a auditoría de lector de pantalla ni dispositivos físicos.
- Capturas: generadas fuera del repositorio para C-02/C-03/C-04/C-06; revisadas muestras C-04 móvil y C-06 escritorio. Adjuntarlas al PR permanece pendiente.
- Decisiones: se explicita en C-01 que no se crean cuentas ni se envían datos, correos o SMS; recordar sesión no persiste. Los textos legales indican publicación pendiente. Agregar al carrito no reserva stock; ninguna espera confirma un pedido ni representa aceptación del restaurante. No se añadieron precios ni promociones durante esta revisión.
- Pendientes: formato global preexistente; objetivos táctiles de C-01; observación y ETA adicional de C-04 no implementados; integración backend y C-07+ fuera de esta entrega; revisión transversal de shell/tokens/navegación. `development` tiene cuatro commits posteriores al punto de partida; verificar conflictos antes de integrar, sin sobrescribirlos.
- Referencia C-04/C-06: [Figma Cliente 4-6](https://www.figma.com/design/CdxvIftlgsjx1gGfUl33pz/MAKUPS-CLIENTE-4-6?node-id=1-3). Contraste visual pendiente por la falta de acceso registrada en C-04. Logo oficial, fotografías y tipografía oficial siguen pendientes de validación/definición.
- Publicación: commit `4761111` (`feat: implementa flujo principal del canal cliente`) publicado en `origin/feature/frontend-client`.
- PR: [#12](https://github.com/NigthmareCF/wok_asian_food/pull/12), borrador hacia `development`. GitHub informa conflictos de integración (`mergeable: false`); quedan pendientes de resolución y revisión. Sin merge.

## 2026-09-11 — C-06: solicitud pendiente y servicio degradado

- Rama: feature/frontend-client; responsables: Barrera y Carlos Chan; asistencia: Codex.
- Vista: estado dentro de /client/cart después de la revisión local de C-05, según la guía Cliente. No se agrega otra navegación ni una ruta de checkout. Este avance sustituye el mensaje anterior de siguiente paso pendiente de C-05.
- Implementación: PendingRequestView muestra advertencia con tokens existentes, título Aún no podemos confirmar tu pedido, resumen de artículos, cantidades, modificadores, servicio y subtotal derivados del carrito compartido. Reutiliza AppShell, Button, StatusBadge, lucide-react, menu.ts y cálculos de C-04/C-05; no cambia los productos.
- Modelo: fixture pending-request.ts centraliza highDemand, degradedService, offline, reconnecting y pendingConfirmation, mensajes y duración del reintento. El estado inicial demostrativo es degradedService; alta demanda puede inyectarse mediante initialPendingStatus. No existe un estado confirmado en este modelo.
- Esperar: reintento local identificado como demostrativo; conserva la misma solicitud y termina pendiente o sin conexión. Bloquea reintentos simultáneos. Una generación de ejecución y cancelación del temporizador impiden recuperar solicitudes abandonadas mediante callbacks anteriores.
- Cancelar: abandona únicamente la espera; mantiene artículos, opciones, cantidades y servicio. Vuelve al carrito con anuncio y foco en su título. No necesita confirmación destructiva porque no elimina el carrito.
- Avisarme: muestra explícitamente que no se enviarán SMS, correos ni notificaciones. Solo cambia una indicación local, sin registrar una suscripción ni prometer un aviso real.
- Reconexión: el evento offline cambia el mensaje y detiene una espera activa; recuperar conexión requiere reintento explícito y nunca envía ni confirma pedidos. Volver al carrito permite retomar la misma solicitud. Modificar artículos o servicio cancela la espera anterior. El proveedor raíz conserva todo durante navegación SPA; recargar vacía la sesión como en C-05.
- Archivos nuevos: apps/web/src/data/fixtures/pending-request.ts; apps/web/src/modules/cart/use-pending-request.ts y use-pending-request.test.ts; apps/web/src/modules/cart/components/pending-request-view.tsx y pending-request.module.css.
- Archivos ajustados: apps/web/src/modules/cart/cart-provider.tsx; apps/web/src/modules/cart/components/cart-view.tsx y cart-view.test.tsx; docs/progress/CLIENT.md.
- Verificaciones: npm run lint, npm run typecheck, npm run test (50 pruebas en 12 archivos) y npm run build:web aprobados. Pruebas de reintentos repetidos, cancelación durante espera, limpieza al desmontar, desconexión/reconexión explícita, aviso local e integración C-04/C-05/C-06.
- Navegador: Brave headless contra build de producción en 375×812, 390×844, 768×1024, 1280×720 y 1440×900. Sin overflow horizontal; una navegación; controles visibles de al menos 44×44 px. Capturas revisadas en móvil, tablet y desktop. Panko con Solo atún, cantidad 2, conserva Q150 y modificadores al esperar/cancelar. Desconexión emulada por navegador y reconexión dejan la solicitud pendiente. Sin excepciones JavaScript.
- Accesibilidad: estructura semántica, foco al entrar/salir de la espera, acciones con nombres visibles, advertencia con icono y texto, anuncios role=status y estilo de foco existente. Pendiente validación con lector de pantalla y dispositivos físicos.
- Límites: experiencia local demostrativa, sin backend, confirmación, notificaciones, pagos, reserva de disponibilidad ni C-07+. Logo, fotografías y tipografía oficiales continúan pendientes. Sin imágenes externas ni dependencias nuevas.
- Git: cambios locales anteriores preservados; sin cambiar rama, commit, push ni merge. PR: pendiente.

## 2026-09-11 — C-05: carrito local del cliente

- Rama: `feature/frontend-client`; responsables: Barrera y Carlos Chan; asistencia: Codex.
- Vista: C-05 en `/client/cart`, con conexión imprescindible del CTA de C-04 y accesos desde menú/detalle/Cliente. Se conserva Inicio, Menú, Pedidos y Perfil en la navegación existente.
- Completado: Tu pedido, regreso al menú, artículos con nombre, precio base, opciones elegidas, precio unitario, cantidad y subtotal; incremento/decremento con mínimo 1, eliminación explícita y resumen sin cargos adicionales. Vacío útil con Ver menú.
- Estado: CartProvider en AppProviders comparte memoria entre rutas públicas y Cliente, sin localStorage, cookies, API ni persistencia. Estado inicial vacío. Recargar o cerrar la sesión de página vacía el carrito. Modelos CartItem/CartInput almacenan productId, quantity y selectedOptions; id identifica la configuración. Producto, unitPrice y subtotales se derivan de menu.ts mediante configureProduct de C-04.
- Configuraciones: se agrupan únicamente producto y opciones idénticas; configuraciones distintas quedan separadas. Opciones vacías equivalentes no duplican artículos. No se editan modificadores complejos en C-05.
- Precios: (base + suplementos) × cantidad; suma del resumen en centavos. Panko Q70 + Solo atún Q5 × 2 = Q150. Panko anterior + Pollo a la Naranja con Chao mein = Q215. Validación de cantidades enteras positivas y límites numéricos seguros sin inventar stock.
- Servicio: selección local Mesa / Para recoger / Delivery, ya definidas en OrderChannel y el flujo operativo existente; C-05 contempla elegir servicio en la guía Cliente. Las etiquetas se centralizan en data/fixtures/cart.ts. No se implementan mesa asignada, dirección, delivery real, cargos ni disponibilidad de servicios.
- Revalidación: Continuar muestra Revalidando disponibilidad… durante una comprobación local demostrativa. Se bloquean cambios durante la revisión; se cancela al cambiar entradas o desmontar la vista. Cambios posteriores invalidan la revisión anterior. Artículos desaparecidos, no disponibles o con opciones inválidas permanecen visibles y bloquean avance, con eliminación o regreso al menú como salida.
- Límite de continuación: tras revisar se informa que el siguiente paso aún no está habilitado. No se navega a checkout ni se confirma un pedido. Agregar al carrito no reserva disponibilidad; se informa que la disponibilidad real debe revalidarse antes de confirmar.
- Reutilización: AppShell mediante slot contextualActions (shared no importa negocio), Button, StatusBadge, tokens, lucide-react, menu.ts, configureProduct y formatMenuPrice. Nuevo CartLink con contador de unidades. Se mantiene una sola navegación; Pedidos/Perfil conservan sus avisos existentes.
- Nuevos archivos: app/(private)/(client)/client/cart/page.tsx; data/fixtures/cart.ts; modules/cart/cart-provider.tsx e index.ts; modules/cart/lib/cart.ts y cart.test.ts; modules/cart/components/cart-view.tsx, cart-item-card.tsx, cart-link.tsx, cart.module.css y cart-view.test.tsx.
- Archivos ajustados: providers/app-providers.tsx, shared/components/app-shell.tsx, layout de Cliente, página /menu, product-detail.tsx, product-configurator.tsx y su prueba; este registro. menu.ts y precios existentes permanecen intactos.
- Verificaciones: lint, typecheck, 47 pruebas en 11 archivos y build:web aprobados. Nueve pruebas nuevas cubren cálculos/agrupación/validaciones, conflictos, integración C-04, vacío, cantidades/eliminación, servicio por teclado, revalidación local y ausencia de persistencia. Prueba de C-04 adaptada al proveedor real en memoria.
- Navegador: Brave headless en 375×812, 390×844, 768×1024, 1280×720 y 1440×900; sin overflow horizontal, una navegación y controles/labels visibles de al menos 44×44 px. Flujo real de navegación SPA desde C-04 conserva selecciones; Q150/Q215 verificados. Servicio por Espacio y foco visible, estado revalidando, continuación explicativa, decremento mínimo, eliminación con foco al título y recarga vacía comprobados. Sin excepciones JavaScript. Capturas temporales fuera del repositorio.
- Pendientes: backend/revalidación real y siguiente flujo en tareas autorizadas; logo, fotos y tipografía oficiales. Validación adicional con lectores de pantalla y dispositivos físicos. Sin C-06, checkout, pagos, promociones, imágenes remotas ni dependencias nuevas.
- Git: cambios locales previos preservados; sin cambiar rama, commit, push ni merge. PR: pendiente.

## 2026-09-11 — C-04: detalle y configuración de producto

- Rama: `feature/frontend-client`; responsables: Barrera y Carlos Chan; asistencia: Codex.
- Vista: C-04, `/menu/[productId]`. C-03 incorpora únicamente enlaces Ver detalle en sus 33 tarjetas. C-01 y C-02 conservan su implementación y datos.
- Completado: detalle con nombre, categoría, precio base, descripción opcional, disponibilidad y configuración. Ruta desconocida presenta Producto no encontrado y regreso a /menu. Se prerenderizan los 33 productos.
- Reutilización: fixture único menu.ts, PublicHeader y estilos de página del catálogo, Button, StatusBadge, tokens, lucide-react. Iconos y etiquetas de disponibilidad se extraen a product-presentation.ts para reutilizarse entre tarjeta y detalle. No se agrega otro shell ni encabezado duplicado.
- Modelo: MenuOption existente ya permite grupos con obligatoriedad y elecciones con suplemento; se documenta que cada grupo admite una sola elección. No se alteran precios ni opciones existentes; se conserva también el suplemento de Oniguiris Surimi configurado en C-02/C-03.
- Configuración: radios derivados de options, sin lógica por nombre. Opcionales permiten Sin suplemento; bases de especialidades requieren una elección explícita. Productos sin opciones no muestran radios. Cantidad mínima 1, controles de incremento/decremento y validación de números seguros sin límites comerciales ficticios.
- Precios: precio unitario = base + suplementos seleccionados; total = unitario × cantidad. Panko con Solo atún Q75; dos unidades Q150. Oniguiris Atún Chipotle con panko Q50. Bases de especialidades sin suplemento.
- CTA: Agregar al pedido · Qtotal. Deshabilitado si faltan opciones obligatorias o el producto está no disponible, con explicación. La acción válida muestra confirmación demostrativa local; no guarda carrito, no envía pedido ni reserva existencias. La confirmación se limpia al cambiar opciones o cantidad.
- Archivos nuevos: app/(public)/menu/[productId]/{page,layout,not-found}.tsx; modules/menu/components/{product-detail.tsx,product-configurator.tsx,product-detail.module.css,product-configurator.test.tsx}; modules/menu/lib/{configure-product,product-presentation}.ts.
- Archivos ajustados: modules/menu/index.ts, menu-product-card.tsx, menu-catalog.module.css, data/fixtures/menu.ts (documentación del contrato) y este registro. Cambios locales anteriores preservados.
- Figma: se intentaron get_design_context y get_screenshot sobre CdxvIftlgsjx1gGfUl33pz, nodo 1:3. Ambos fueron rechazados por falta de acceso de edición de la cuenta conectada. No se obtuvo estructura ni captura; implementación basada en requisitos explícitos y patrones del proyecto. Pendiente contraste visual con la referencia cuando sea accesible: https://www.figma.com/design/CdxvIftlgsjx1gGfUl33pz/MAKUPS-CLIENTE-4-6?node-id=1-3
- Pruebas: lint, typecheck, 38 pruebas en 9 archivos y build:web aprobados. Seis pruebas nuevas: suplementos/cantidad/confirmación, bases exclusivas con teclado, configuración independiente del nombre, producto sin opciones, disponibilidad cambiada y rechazo de selecciones/cantidades inválidas.
- Navegador: Brave headless en 375×812, 390×844, 768×1024, 1280×720 y 1440×900; sin overflow horizontal, un encabezado y enlaces/botones/labels táctiles de al menos 44×44 px. Capturas temporales revisadas en móvil, tablet y escritorio. Verificados precios Q75/Q150, confirmación demo, base requerida, teclado Espacio y foco visible, producto no disponible, ruta inexistente y 33 enlaces desde catálogo; sin excepciones JavaScript.
- Accesibilidad: fieldset/legend, labels completos, radios nativos exclusivos, botones icon-only etiquetados, estados textuales, total anunciado y confirmación con role=status. Pendiente auditoría con lector de pantalla y dispositivos físicos.
- Límites: sin C-05, carrito, checkout, pagos, backend, persistencia, stock real, imágenes externas ni datos comerciales añadidos. No se simulan estados de red porque los datos son locales.
- Pendientes: acceso a Figma, logo, fotografías y tipografía oficiales; integraciones futuras en tareas autorizadas. Sin dependencias nuevas, cambio de rama, commit, push o merge. PR: pendiente.

## 2026-09-11 — C-03: catálogo compartido y exploración

- Rama: `feature/frontend-client`; responsables: Barrera y Carlos Chan; asistencia: Codex.
- Vista: únicamente C-03, `/menu`; compatibilidad de datos de C-02 conservada sin modificar su vista.
- Completado: encabezado compacto, buscador etiquetado, seis filtros (Todos y las cinco categorías solicitadas), tarjetas compactas con nombre, precio, categoría, disponibilidad y opciones. Grid de una, dos y tres columnas según ancho; sin fotografías remotas, carrito ni detalle C-04.
- Fixture: se sustituyeron los seis productos antiguos por los 33 productos reales ya usados en C-02. Una única colección `menuFixtures`, categorías `menuCategories`, tipos de producto/disponibilidad y opciones con elecciones, obligatoriedad y suplemento. Bases de especialidades compartidas. `homeMenuProducts` y `homeMenuCategories` se derivan de la misma fuente para conservar el contrato de C-02.
- Búsqueda: por nombre, tolerante a mayúsculas, tildes y espacios; se combina con categoría. Limpiar filtros restaura Todos y devuelve foco al buscador. Cantidad de resultados anunciada con role=status.
- Estados: normal, búsqueda sin coincidencias, categoría vacía y catálogo vacío; disponibles, limitados y no disponibles con texto. Aviso general de disponibilidad demostrativa. Camarón Crunchy usa limitada y Blue Matcha no disponible solo como ejemplos visuales; no representan inventario. Bebidas +18 diferenciadas por nombre, icono y descripción de categoría.
- Componentes: reutilizados PublicHeader, FormField, Button, StatusBadge, panel y tokens globales; nuevo MenuProductCard y función filterMenu. MenuCatalog mantiene únicamente la interacción; la página sigue siendo Server Component y entrega el fixture mediante props.
- Archivos: `app/(public)/menu/page.tsx`, `data/fixtures/menu.ts`, `modules/menu/components/menu-catalog.tsx`; nuevos `menu-product-card.tsx`, `menu-catalog.module.css`, `menu-catalog.test.tsx` y `modules/menu/lib/filter-menu.ts`. Estilos encapsulados sin modificar globals.css durante C-03.
- Pruebas: lint, typecheck, 32 pruebas en 8 archivos y build:web aprobados. Seis pruebas nuevas cubren búsqueda/filtros, vacíos, disponibilidad/opciones/+18, teclado y compatibilidad del fixture de portada.
- Navegador: Brave headless en 375×812, 390×844, 768×1024, 1280×720 y 1440×900; sin overflow horizontal ni controles visibles menores de 44×44 px. Verificados búsqueda ATUN, combinación con Bebidas, limpieza, foco visible y activación con Espacio de +18. Sin imágenes remotas ni excepciones de JavaScript. Capturas temporales revisadas para móvil, tablet y escritorio; C-02 conserva sus tres productos de portada.
- Límites: fixtures locales sin estados artificiales de red ni llamadas API. No se implementaron selectores de opciones, C-04, compras, stock real ni verificación de edad. Validación headless, no auditoría completa de lectores de pantalla o dispositivos físicos.
- Pendientes: logo, fotos y tipografía oficiales; disponibilidad real e integración en tareas autorizadas. Se resuelve el pendiente anterior de unificar las colecciones C-02/C-03. Formateador Prettier local no disponible; no se instalaron dependencias.
- Git: cambios previos conservados, sin cambio de rama, commit, push ni merge. PR: pendiente.

## 2026-09-11 — C-02: inicio gastronómico responsive

- Rama: `feature/frontend-client`
- Responsables: Barrera y Carlos Chan; asistencia: Codex.
- Vista: únicamente C-02, `/client`.
- Completado: home oscura con CTA al menú, estado/ETA demostrativos, accesos desplegables, cinco categorías y selección de tres productos reales. Navegación única con Inicio, Menú, Pedidos y Perfil; los dos últimos abren un diálogo demostrativo sin rutas inexistentes.
- Archivos: página `client/page.tsx`; nuevo `modules/clients` (ClientHome, ServiceSummary, CSS Module y pruebas); fixtures `menu.ts` y `client-home.ts`; `config/navigation.ts`, `shared/components/app-shell.tsx` y estilos de Cliente en `globals.css`.
- Reutilización: AppShell, StatusBadge, Button, estilos de enlaces tipo botón, tokens globales y lucide-react. PortalOverview deja de componer C-02; se preserva para los demás contextos.
- Datos: menú proporcionado centralizado en una colección tipada exclusiva de C-02; C-03 conserva su fixture previo. Servicio abierto y preparación de 25–35 minutos son ejemplos explícitos, sin traslado. Se contemplan cerrado y ETA ausente. Reservar/Mensajes no envían solicitudes; Ubicación informa que faltan datos oficiales.
- Pruebas: lint, typecheck, 26 pruebas unitarias y build:web aprobados. Brave headless: 375×812, 390×844, 768×1024, 1280×720 y 1440×900 sin overflow horizontal; una navegación y controles visibles de al menos 44×44 px. Verificados foco visible, apertura de avisos, Escape, foco del diálogo y desplegables con Espacio. Capturas temporales revisadas en móvil, tablet y escritorio, fuera del repositorio.
- Estados: no se agregan carga/error de red porque la home consume fixtures locales sin transporte asíncrono; servicio cerrado y ETA ausente cubiertos por pruebas.
- Formato: Prettier no está instalado localmente; la ejecución opcional no se completó por acceso al registro npm. No se instalaron dependencias.
- Pendiente: logo, fotografías y tipografía oficiales; dirección validada; integración futura de servicio y flujos autorizados. La selección de C-02 y el catálogo previo C-03 deberán unificarse en una tarea posterior del menú.
- Git: cambios locales previos preservados; sin cambio de rama, commit, push ni merge. PR: pendiente.

## 2026-09-09 — Estado inicial

- Rama: `development`
- Responsables: coordinación frontend
- Asistencia: Codex
- Vistas: rutas base `/login`, `/register`, `/menu`, `/location` y `/client`
- Completado: fundación navegable con autenticación visual, catálogo simulado y entrada del canal
- Archivos principales: `apps/web/src/app` y `apps/web/src/modules`
- Pruebas: lint, typecheck, 5 pruebas unitarias y build aprobados
- Decisiones: disponibilidad y autenticación son simuladas hasta integrar backend
- Pendiente: seleccionar IDs del sprint e implementar vistas asignadas
- PR: `https://github.com/NigthmareCF/wok_asian_food/pull/2`

## 2026-09-10 — C-01 a C-03

- Rama: `feature/frontend-client`
- Vistas: C-01 Login/Registro, C-02 Inicio de Cliente y C-03 Menú
- Completado: autenticación visual demostrativa con validaciones y navegación a Cliente; inicio con accesos a Menú y Ubicación; catálogo con categorías, búsqueda, precios, imágenes y estados de disponibilidad simulados.
- Datos: se amplió `menuFixtures`; no se integró backend ni persistencia.
- Archivos principales: `modules/auth`, `modules/menu`, `portal-overview`, `form-field` y `globals.css`.
- Pruebas: lint, typecheck, 23 pruebas unitarias y build aprobados.
- Decisiones: el detalle de platillo y las acciones de carrito permanecen fuera de alcance; las imágenes del catálogo son externas y demostrativas.
- Pendiente: integrar datos y assets definitivos cuando exista contrato o referencia visual adicional.

## 2026-09-11 — Integración de development en PR #12

- Rama: feature/frontend-client; integración de origin/development (95f678a).
- Conflicto de AppShell resuelto combinando navegación y diálogos demostrativos del cliente con menú lateral contraíble, icono de solicitudes y mejoras operativas.
- Conservados los módulos, rutas y estilos propios del cliente. Ajustados nombres accesibles del menú contraído, botones demo, etiquetas persistentes en móvil y color del logo público.
- Validación: lint, typecheck, 67 pruebas en 16 archivos y build:web aprobados. Nueva regresión del shell verifica enlaces Inicio/Menú y diálogos Pedidos/Perfil con menú contraído.
- Brave headless: /client, /menu, /menu/maki-tuna, /client/cart, /login, /register, /location y /operation en 390, 768, 1280 y 1440 px, sin desbordamiento horizontal. Verificados contraer, abrir diálogo y pasar de escritorio contraído a móvil conservando etiquetas.
- Cambio local previo de next-env.d.ts respaldado en stash; la compilación regeneró exactamente las mismas referencias de tipos de producción y se conserva en la entrega.
- Sin nuevas dependencias ni integraciones. Validación de navegador automatizada; no sustituye pruebas con dispositivos físicos.
- Formato: format:check no pudo ejecutarse porque Prettier no está instalado localmente; no se instalaron dependencias.
