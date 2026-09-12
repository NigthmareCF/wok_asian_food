# WOK ASIAN FOOD — Fundación frontend y plano UI/UX

Fecha: 2026-09-09. Estado: especificación consolidada para revisión local.

Este documento integra la fundación técnica del primer requerimiento y el plano visual del segundo. El segundo prevalece en identidad, navegación e interacción; el primero conserva la arquitectura y los requisitos técnicos compatibles. No es una declaración de funcionalidad implementada.

## 1. Alcance y autoridad

La entrega actual es exclusivamente este documento. No incluye código de aplicación, instalación de dependencias, creación o cambio de ramas, commits, push, PR ni integración. La consulta del remoto está permitida; su modificación no está autorizada. El archivo permanece local y sin commit en el checkout actual.

La implementación posterior tendrá dos niveles: una fundación ejecutable y features de producto. El catálogo completo define el destino del producto; no autoriza implementar todas sus vistas en la fundación.

Orden de decisión: instrucciones vigentes del responsable; decisiones confirmadas del proyecto; esta especificación. Ante un conflicto con una decisión confirmada, registrar el conflicto antes de implementar. No redefinir ERD, módulos, planificación Scrum ni tecnologías pendientes.

### Evidencia consultada

- `README.md`, `CONTRIBUTING.md`, `docs/git/BRANCHING.md` y `docs/git/BRANCH_CATALOG.md`.
- Referencias de `origin` actualizadas mediante fetch, sin publicar cambios. Historial disponible: preparación inicial `de63ba4` y ajuste de archivos ignorados `84592f3` en `origin/chore/tooling`.
- El checkout `development` contiene preparación de Git; las ramas reservadas no prueban que existan features.
- No se encontraron `AGENTS.md`, `docs/project/PROJECT_CONTEXT.md`, `PROJECT_SCOPE.md`, `CURRENT_STATE.md`, `TECH_DECISIONS.md`, `MODULE_CATALOG.md`, `ARCHITECTURE_OVERVIEW.md` ni documentación en `docs/architecture/frontend/` en el material disponible.
- No se encontraron prototipos, logos, imágenes de producto, archivos Excalidraw ni enlaces de diseño utilizables en ese material. No se afirma haber inspeccionado Figma, Canva o v0 externos.

### Estados de las decisiones

**Requisito**: procede de los textos entregados y se conserva aquí. **Propuesta**: concreta un vacío y requiere validación antes de convertirse en contrato. **Pendiente**: falta evidencia o una decisión necesaria.

Next.js, React, TypeScript, TanStack Query, herramientas de testing, React Native/Expo y shell desktop no están verificados como `CONFIRMED_CLASS`. La estructura Next.js descrita abajo es condicional a esa confirmación; no equivale a elegir tecnologías pendientes.

## 2. Resolución de diferencias

| Tema | Resolución consolidada |
| --- | --- |
| Código frente a plano | Documentar ahora; implementar la fundación en una ejecución posterior. |
| Prioridad visual | Adoptar el segundo requerimiento: dark theme WOK, tokens semánticos y personalidad por canal. |
| Branch | La implementación futura usa `feature/frontend-foundation`, previa comprobación de su estado. Este trabajo documental no cambia ramas. |
| Publicación | El commit y push del primer texto quedan fuera de la autorización actual. No ejecutar automáticamente al terminar este documento. |
| Vistas | Documentar todas las solicitadas; construir inicialmente auth mock, shells y páginas mínimas de entrada. |
| Componentes | Unificar ambos catálogos; especificar todos y construir progresivamente los que consume la fundación. |
| Rutas | Conservar las iniciales; identificar las ampliaciones como propuestas. |
| Canales | CLIENT, OPERATIONAL y ADMIN son contextos de navegación, nunca roles ni módulos. |
| Documentos | Un solo archivo de revisión contiene el contenido técnico y visual; podrá dividirse sin cambiar sus decisiones. |
| Realtime | Contrato y simulación en la fundación; servidor, transporte concreto y operación real quedan fuera. |
| Logos/prototipos ausentes | Registrar dependencia. Los wireframes son propuestas estructurales, no reproducciones de diseños existentes. |
| Árboles de carpetas | Representan responsabilidades; no obligan a crear directorios o archivos vacíos. |

## 3. Arquitectura y límites

| Capa | Responsabilidad | Límite |
| --- | --- | --- |
| GLOBAL | Root layout, tema, estilos, providers, configuración, loading y errores globales | Sin reglas de negocio en root layout. |
| AUTH | Formularios, estados y servicios de acceso y recuperación | Mock explícito; sin criptografía ni seguridad real en frontend. |
| PUBLIC | Menú y ubicación accesibles sin sesión | No filtrar información privada hacia estas vistas. |
| PRIVATE | Sesión, permisos y shells de navegación | Autorización visual para UX; backend será autoridad final. |
| MODULAR | Funciones de dominio encapsuladas | API pública mediante `index.ts` cuando aplique. |
| SHARED | Componentes y utilidades sin dominio | No importar módulos de negocio. |
| DATA | Fixtures, mocks e integración mediante adaptadores | Sin acceso directo a bases de datos. |

### Estructura objetivo, condicionada al stack confirmado

```text
apps/web/src/
  app/                 # Composición de rutas y layouts
  modules/             # Funciones de dominio
  shared/              # UI y utilidades transversales
  data/mocks/          # Comportamiento simulado
  data/fixtures/       # Datos reproducibles
  providers/           # Composición de contextos globales
  config/              # Entorno, navegación y configuración
packages/
  contracts/           # Contratos compartibles
  validation/          # Validaciones compartibles
  api-client/          # Transporte y errores normalizados
  design-tokens/       # Tokens independientes de plataforma
  config/              # Configuración de herramientas cuando aplique
  utils/               # Funciones puras compartibles
```

Crear packages solo cuando tengan contenido y consumidores claros. No introducir Nx, Turbo, microfrontends o Redux por costumbre. Web y mobile pueden compartir contratos, validación, cliente API, utilidades puras y tokens; los componentes DOM no se comparten directamente con React Native.

### Módulos

Catálogo conservado: `auth`, `users`, `roles`, `clients`, `staff`, `tables`, `reservations`, `menu`, `recipes`, `inventory`, `suppliers`, `purchases`, `production`, `availability`, `orders`, `kitchen`, `delivery`, `messaging`, `billing`, `payments`, `cash`, `operations`, `reports`, `settings`, `ai`, `vision`, `audit`.

`roles-permissions` es un nombre de rama existente, no una instrucción para renombrar el módulo `roles`. Carrito y checkout son vistas que consumen dominios existentes; no se inventan módulos nuevos por cada entrada del menú.

Plantilla por módulo: `components/`, `models/`, `dtos/`, `adapters/`, `services/`, `hooks/`, `schemas/`, `types/`, `utils/`, `index.ts`. Solo crear las piezas necesarias. Los consumidores externos usan la API pública; evitar ciclos y accesos a internals. Las páginas componen módulos y no implementan transporte.

`shared/` contempla `components/`, `hooks/`, `lib/`, `types/`, `constants/` y `utils/`, con el mismo criterio de contenido útil.

## 4. Rutas, shells y navegación

Si Next.js App Router está confirmado, `app/layout.tsx` compone GLOBAL y `app/page.tsx` representa la entrada `/`. Los grupos `(auth)`, `(public)` y `(private)` tienen layouts; los grupos no aparecen en la URL.

Dentro de `(private)`, `(client)/client`, `(operational)/operation` y `(admin)/admin` producen `/client`, `/operation` y `/admin`. Un usuario puede disponer de varios canales si sus permisos lo permiten. No inferir el canal a partir de `role === ADMIN`.

Rutas iniciales del primer requerimiento: `/`, `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/locked`, `/menu`, `/location`, `/client`, `/operation`, `/admin`. El resto del catálogo es propuesta. `ChangePasswordForm` existe como capacidad de perfil; no obliga a añadir una ruta auth adicional.

La entrada `/` será, como propuesta, una presentación pública con acceso al menú, ubicación e inicio de sesión. `/client` es Home autenticado. Reutilizar la experiencia de catálogo entre `/menu` y `/client/menu` sin duplicar lógica. El carrito invitado y la política de redirección tras login quedan pendientes.

### Shells

| Canal | Desktop | Mobile | Personalidad |
| --- | --- | --- | --- |
| CLIENT | Cabecera, catálogo visual y contenido de baja densidad | Cabecera compacta y navegación inferior Home/Menu/Orders/Profile; carrito visible cuando aplique | Fotografías, claridad, prioridad táctil. |
| OPERATIONAL | Navegación lateral, área de trabajo y detalle contextual | Drawer y lista/tablero adaptado; acciones principales grandes | Rapidez, legibilidad, densidad útil y estado operativo. |
| ADMIN | Sidebar, cabecera, toolbar y tabla con detalle | Drawer, filtros en sheet y lista de tarjetas o tabla desplazable | Información ordenada, teclado y mouse, compatible con touch. |

Reservas y mensajes del cliente deben ser accesibles desde Home/perfil o un acceso visible; no caben todas las secciones en la barra inferior. La selección final de navegación se valida con usuarios.

Navegación central configurable: `label`, `route`, `icon`, `requiredPermission`, `context`, `featureFlag`. Marcar página actual, conservar foco, cerrar drawer tras navegar y ofrecer acceso visible al cambio de canal cuando corresponda. Ocultar un enlace no protege una ruta.

## 5. Sistema visual

### Color y tema

| Token semántico dark | Valor | Uso |
| --- | --- | --- |
| `color.background.canvas` | `#121214` | Fondo general |
| `color.background.navigation` | `#0F1115` | Sidebar/superficie más oscura |
| `color.surface.default` | `#1E1E22` | Paneles |
| `color.surface.elevated` | `#2A2A30` | Superficies elevadas |
| `color.border.default` | `#343A46` | Separación visual |
| `color.text.primary` | `#F5F5F5` | Texto principal |
| `color.text.secondary` | `#B4B4BE` | Texto secundario |
| `color.action.primary` | `#E85930` | Marca/acción principal |
| `color.status.info` | `#3584E4` | Información |
| `color.status.success` | `#2EA05A` | Éxito |
| `color.status.warning` | `#EBB134` | Advertencia |
| `color.status.error` | `#D24141` | Error |

No asumir que todos los pares de esta paleta ofrecen contraste suficiente. Antes de implementar, validar texto/fondo, iconos y foco; definir `onPrimary`, `onStatus`, bordes de controles, foco y variantes hover/pressed con contraste medido. Conservar los colores de marca como base; los colores semánticos derivados pueden resolver legibilidad sin recolorear el logo. Nunca transmitir estado solo por color.

El tema principal es dark. Resolver componentes contra tokens semánticos y preparar un contrato de tema para light; no diseñar ni activar light en esta fase.

### Escalas propuestas

| Familia | Propuesta inicial |
| --- | --- |
| Tipografía | Familia sans del sistema hasta disponer de tipografía oficial; cuerpo 16px, auxiliar 14px, títulos fluidos 24–36px; interlineado 1.4–1.6. |
| Espaciado | Escala 4, 8, 12, 16, 24, 32, 48 y 64px. |
| Radio | Tokens pequeño 6px, medio 10px, grande 16px y circular para usos puntuales. |
| Elevación | Base, panel y overlay; superficies y bordes primero, sombra discreta cuando ayude a separar planos. |
| Densidad | Cómoda para CLIENT, operativa para OPERATIONAL y compacta legible para ADMIN. La densidad no reduce los controles táctiles críticos. |
| Touch | Objetivo mínimo de diseño de 44×44 CSS px en acciones principales; acciones operativas propuestas de 48–56px de alto. |
| Motion | Transiciones discretas propuestas de 120–200ms; reducir/eliminar movimiento según `prefers-reduced-motion`. |
| Iconos | Una familia consistente pendiente de selección; etiquetas accesibles y texto visible en acciones críticas. |
| Breakpoints | Tokens orientativos 640/768/1024/1280/1536px, ajustables según contenido; no identifican dispositivos. |

Usar grid, flex, minmax y clamp; container queries cuando el componente deba responder a su contenedor. Centralizar tokens: no dispersar valores visuales por componentes.

### Identidad y assets

Usar únicamente variantes oficiales del logo para fondos claros u oscuros; conservar proporción y colores, evitar recortes y asegurar espacio libre según la guía oficial cuando exista. No redibujar, recrear con CSS ni inventar el logo. En ausencia del asset, usar un marcador de contenido en el plano, no un sustituto gráfico presentado como oficial. Fotografías, derechos de uso y tipografía de marca quedan pendientes.

## 6. Catálogo de componentes

Todo componente interactivo define estados aplicables: idle, hover, focus, pressed, selected, disabled, loading, success, warning y error. Offline y stale pertenecen a componentes conectados, no obligatoriamente a cada control.

| Grupo | Componentes | Contrato de interacción |
| --- | --- | --- |
| Acciones | Button, IconButton | Variantes primaria/secundaria/destructiva; nombre accesible, Enter/Space y estado pending que evita envíos duplicados. |
| Formularios | Input, Select, Checkbox, Switch | Labels persistentes, ayuda y error asociados; required/disabled/pending/success distinguibles. |
| Navegación | Tabs, Navigation, Sidebar, BottomNavigation | Estado actual y foco visibles; semántica adecuada y navegación de teclado conforme al patrón. |
| Contenido | Card, Badge, PageHeader, StatusIndicator | Jerarquía clara; badge combina texto y color; cabecera con título y acción primaria. |
| Listados | Table/DataTable, ResponsiveList | Table es base semántica y DataTable composición con herramientas; selección por ID estable. |
| Herramientas | SearchInput, FilterBar, SortControl, Pagination | Limpiar búsqueda, filtros activos, orden visible y paginación según capacidad del servicio. |
| Overlays | Modal, Drawer, Sheet, ConfirmDialog | Modal es comportamiento; Drawer/Sheet son presentaciones. Gestionar foco y retorno al disparador. |
| Feedback | Toast, Skeleton, LoadingState, EmptyState, ErrorState, ForbiddenState, RealtimeIndicator | Feedback local y accesible; toast no es el único lugar para errores importantes. |

Diálogos: nombre accesible, foco inicial apropiado, contención de foco cuando sean modales, fondo no interactuable, cierre con Escape cuando proceda y retorno de foco. En operación irreversible no poner el foco inicial en confirmar. Evitar overlays anidados. No bloquear el cierre sin explicar el motivo y conservar entradas cuando sea posible.

En la fundación se implementan los componentes que necesitan auth, shells, estados y un listado demostrativo. Los restantes quedan especificados para features; no crear implementaciones ficticias solo para completar una lista.

## 7. Patrones UX compartidos

### Responsive, entrada y accesibilidad

Adaptar composición, no escalar desktop. Sidebar pasa a drawer; tabla puede pasar a tarjetas/lista; detalle lateral pasa a sheet/pantalla. Tablas comparativas que necesitan columnas pueden conservar scroll horizontal controlado con indicación visible. Validar cambios dinámicos de ventana y orientación, también con teclado virtual.

Soportar click, tap, trackpad y teclado en todos los canales. Hover es feedback adicional. Swipe puede revelar acciones con botón/menú equivalente; long press solo ofrece funciones secundarias; pull-to-refresh tiene alternativa de actualizar cuando corresponda. Una acción destructiva mediante gesto siempre lleva al mismo flujo de confirmación y no se ejecuta inmediatamente.

Usar HTML semántico, labels, orden lógico de tabulación, foco visible, Enter/Space y Escape. Evitar ARIA redundante. Anunciar resultados y cambios importantes sin saturar lectores de pantalla ni trasladar foco automáticamente. Validar contraste y zoom; ningún estado depende exclusivamente del color.

### Formularios y confirmaciones

Desktop: una o dos columnas según relación entre campos; mobile: una columna. Mantener etiquetas visibles, errores por campo y resumen cuando ayude; preservar datos ante errores recuperables. Considerar autocomplete, inputmode y teclado virtual.

Confirmaciones sensibles muestran acción, objeto afectado, impacto, motivo cuando la política lo requiera, confirmar y cancelar. Aplican a suspender usuario, cambiar permiso crítico, deshabilitar producto, suspender pedidos online, cerrar servicio, cancelar ítem enviado y ajustar inventario. No inventar reglas de obligatoriedad del motivo: parametrizarlas.

### Búsqueda, filtros, orden y paginación

- Búsqueda reutilizable con debounce propuesto de 300ms, clear, cancelación de petición anterior y descarte de respuestas fuera de orden. Estados: buscando, error y sin resultados. No emitir una petición por tecla sin control.
- Desktop: filtros inline si caben; mobile: sheet/drawer con aplicar/limpiar. Mostrar filtros activos y cantidad de resultados cuando sea fiable.
- Orden: cabecera de columna o select en desktop; select/sheet en mobile. El servicio aplica un orden determinista con desempate estable, por ejemplo `createdAt DESC, id DESC`.
- Offset para listados administrativos estables cuando el contrato lo permita. Cursor para flujos de alta frecuencia cuando sea apropiado. No convertir una preferencia conceptual en contrato de API confirmado.
- Mobile: anterior/siguiente o cargar más; evitar largas filas de números. Cursor no implica conocer total ni última página. Reiniciar página/cursor al cambiar búsqueda, filtros u orden.
- Reflejar estado navegable relevante en URL web para refresh, back, forward, deep-link y compartir. Serializar valores permitidos, validar y normalizar parámetros; no incluir datos sensibles. Debounce puede usar replace y cambios explícitos push según la experiencia elegida.
- La selección usa IDs estables; definir si abarca página o resultados completos y no ampliar su alcance silenciosamente tras refrescar.

### Loading, errores y vacíos

Separar initial loading (skeleton cuando aporte valor), background refreshing (contenido visible), loading more (indicador al final) y mutation pending (acción local). Diferenciar error de red, validación, permisos, servidor y conflicto/stale. Reintentar de forma apropiada sin duplicar mutaciones sensibles. Diferenciar “aún no hay datos” de “ningún resultado coincide con los filtros”, ofreciendo crear o limpiar filtros según permiso.

Evitar layout shift, recarga completa y animación innecesaria. Permitir posteriormente lazy loading, route splitting, optimización de imágenes y virtualización, sin optimización prematura.

## 8. Contratos de datos, estado y seguridad visual

Lectura: `API → DTO → Adapter → Model → Query/Hook → Component → Page`. Escritura: `Form → Schema → Request DTO → Service → API`. Los adapters de representación convierten DTO/modelo; el adapter de transporte implementa el acceso mock o HTTP. Son responsabilidades distintas aunque compartan nombre.

Hoy: `Component → Hook/Service → Mock transport → Fixtures`. Futuro: `Component → Hook/Service → HTTP transport → API`. Mantener una interfaz de servicio estable para sustituir el transporte sin reescribir componentes. La validación frontend mejora UX; el backend vuelve a validar.

El API client centraliza base URL, headers, normalización de errores, timeout, cancelación y puntos de extensión para autenticación, requestId, correlationId y clientActionId. No hacer fetch disperso desde componentes. No fijar todavía estrategia de tokens o almacenamiento de sesión; tampoco incluir secretos en configuración pública.

Separar server state de UI state. Si TanStack Query está confirmado, usarlo con factories como `ordersKeys.all`, `ordersKeys.list(filters)` y `ordersKeys.detail(id)`, filtros normalizados e invalidación explícita. Si no, documentar la dependencia sin seleccionar otra librería arbitrariamente.

RBAC: tipos `Role` y `Permission`; helpers `hasPermission`, `hasAnyPermission`, `hasAllPermissions`. La navegación, las rutas y las acciones consultan capacidades. El backend futuro controla además propiedad del recurso y restricciones de negocio. PRIVATE representa loading, authenticated, unauthenticated y forbidden sin mostrar fugazmente contenido privado.

Configurar interfaces para horarios, reglas de delivery, propinas, tolerancia de reservas, estado de servicio y umbrales. Una abstracción mínima de feature flags controla exposición de UI, nunca sustituye permisos. No inventar valores comerciales definitivos.

### Auth mock

Módulo auth inicial: LoginForm, RegisterForm, VerificationPinForm, ForgotPasswordForm, ResetPasswordForm, ChangePasswordForm y AccountLockedCard.

| Flujo | Estados y comportamiento |
| --- | --- |
| Registro | REGISTER → pending verification → PIN → verified → active. Mostrar envío, PIN inválido/expirado y reintento simulado; no presentar verificación mock como seguridad real. |
| Login | Credenciales enviadas → éxito o fallo con intentos restantes → locked. Umbral y duración de bloqueo son configuración mock explícita pendiente de política real. |
| Recuperación | Email → challenge → new password → success. Challenge puede presentarse dentro del flujo existente; no requiere inventar una ruta pública adicional. |
| Cambio de contraseña | Acción de perfil autenticado, validación y feedback; requisitos de reautenticación pendientes del backend. |

Usar fixtures sintéticos reproducibles, sin credenciales reales hardcodeadas. No almacenar contraseñas como persistencia mock ni implementar criptografía frontend. Política de contraseña, caducidad del PIN, reenvíos, intentos y semántica de sesión quedan pendientes. Respuestas públicas de recuperación no deben exponer innecesariamente la existencia de una cuenta.

## 9. Realtime y consistencia

Preparar `RealtimeClient` con subscribe/unsubscribe, ciclo de conexión, eventos tipados y notificación de estado. Transporte futuro WebSocket o SSE pendiente. Sobre de evento propuesto: ID único, tipo, entidad/ID y versión o secuencia cuando el backend la soporte; no asumir que un timestamp basta para resolver conflictos.

Eventos previstos: `order.created`, `order.updated`, `order.cancelled`, `kitchen.ticket.updated`, `inventory.changed`, `availability.changed`, `production.updated`, `delivery.updated`, `message.created`, `service.status.changed`.

Estados: connected, reconnecting, disconnected y stale. Mostrar indicador solo donde aporte información operacional. Stale expresa incertidumbre sobre vigencia de datos, no necesariamente falta actual de conexión.

Evaluar cada evento contra búsqueda, filtros, orden y paginación. No insertar ciegamente ni romper límites de página, cursor, conteos o selección. Invalidar/refetch cuando una actualización manual sea riesgosa. Deduplicar eventos y no sobreescribir versiones nuevas con datos antiguos; al reconectar, reconciliar mediante revalidación y permitir polling como fallback futuro.

UX: actualización silenciosa para campos que no cambian posición; indicador “hay nuevos elementos” o refresco dirigido cuando cambia el orden. No mover filas bajo el puntero ni quitar foco. KDS puede requerir mayor inmediatez, conservando la tarjeta activa y resaltando novedades sin saltos agresivos. Mensajería solo sigue automáticamente el final si el usuario ya estaba allí.

Optimistic UI solo en acciones predecibles y reversibles, con rollback y reconciliación. Pagos, cierre de caja y ajustes críticos de inventario esperan confirmación autoritativa; el estado pending no equivale a éxito.

## 10. Catálogo de vistas y wireframes

Las fichas siguientes especifican destino funcional, no pantallas ya construidas. Todas las rutas ampliadas son propuestas. Los permisos son nombres conceptuales propuestos y deben mapearse al catálogo backend; no crean una política RBAC aprobada. Dependencias expresan composición de UI, no autorización para cambiar módulos.

### Convenciones de las fichas

- **L**: listado con búsqueda, filtros, orden y paginación según columnas de la ficha; estados initial loading, refreshing, loading more si aplica, empty inicial, empty filtrado, error y forbidden.
- **D**: detalle con loading, error, forbidden y not found; pending/success/conflict para mutaciones.
- **F**: formulario con idle, errores de campo, pending, success, error y forbidden cuando sea privado.
- **B**: tablero con loading, empty, error, refreshing y estados de conexión si RT está activo.
- **C**: contenido con loading/error cuando dependa de datos, y vacío cuando corresponda.
- En todas las fichas click/tap activan controles, teclado permite navegación y acciones, trackpad permite scroll; foco visible obligatorio. “Touch” especifica la adaptación adicional.
- **RT sí** significa capacidad prevista, con estados connected/reconnecting/disconnected/stale; no servidor implementado. “No inicial” permite evolución futura sin hacerla requisito actual.
- Un permiso `.read` no autoriza escritura: las acciones de modificar requieren capacidad específica y validación backend, pendientes de confirmación.

Los ASCII individuales usan `[contenido]` como esquema de componentes, no como texto final. Aplican los shells y transformaciones de esta sección; no son mockups oficiales.

### CLI-01 — Home
- **Canal / ruta:** CLIENT · `/client` (ruta inicial).
- **Propósito / usuario:** Presentar accesos y actividad personal. Cliente autenticado con acceso a sus recursos.
- **Módulos:** menu, orders, reservations.
- **Permisos requeridos:** propuesta `menu.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** No / No / No / No.
- **Desktop:** Secciones de contenido jerarquizadas.
- **Mobile:** Secciones apiladas.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Ver menú.
- **Secundarias:** Ver pedidos y reservas.
- **Sensibles:** Ninguna.
- **Estados:** perfil C de las convenciones.

```text
[CLIENT / Home]
[Título | contexto | estado]
[Secciones de contenido jerarquizadas]
[Ver menú]
Mobile → Secciones apiladas
```

### CLI-02 — Menu
- **Canal / ruta:** CLIENT · `/client/menu` (propuesta).
- **Propósito / usuario:** Explorar platos disponibles. Cliente autenticado con acceso a sus recursos.
- **Módulos:** menu, availability.
- **Permisos requeridos:** propuesta `menu.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Texto / categoría, disponibilidad / relevancia o nombre / cursor propuesto.
- **Desktop:** Grid de platos con fotos + filtros.
- **Mobile:** Cards de platos + categorías + filtros en sheet.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Ver plato.
- **Secundarias:** Buscar y filtrar.
- **Sensibles:** Ninguna.
- **Estados:** perfil L de las convenciones.

```text
[CLIENT / Menu]
[Búsqueda | filtros | orden]
[Grid de platos con fotos + filtros]
[Ver plato]
Mobile → Cards de platos + categorías + filtros en sheet
```

### CLI-03 — Dish Detail
- **Canal / ruta:** CLIENT · `/client/menu/[dishId]` (propuesta).
- **Propósito / usuario:** Consultar plato y configurar selección. Cliente autenticado con acceso a sus recursos.
- **Módulos:** menu, availability, orders.
- **Permisos requeridos:** propuesta `menu.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** No / No / No / No.
- **Desktop:** Contenido principal + resumen/detalle lateral.
- **Mobile:** Secciones apiladas + acciones visibles.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Agregar al carrito.
- **Secundarias:** Editar cantidad y opciones.
- **Sensibles:** Ninguna.
- **Estados:** perfil D de las convenciones.

```text
[CLIENT / Dish Detail]
[Título | contexto | estado]
[Contenido principal + resumen/detalle lateral]
[Agregar al carrito]
Mobile → Secciones apiladas + acciones visibles
```

### CLI-04 — Cart
- **Canal / ruta:** CLIENT · `/client/cart` (propuesta).
- **Propósito / usuario:** Revisar selección y precio estimado. Cliente autenticado con acceso a sus recursos.
- **Módulos:** orders, menu, availability.
- **Permisos requeridos:** propuesta `orders.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** No / No / No / No.
- **Desktop:** Contenido principal + resumen/detalle lateral.
- **Mobile:** Secciones apiladas + acciones visibles.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Ir a checkout.
- **Secundarias:** Cambiar cantidad; retirar ítem con opción de deshacer.
- **Sensibles:** Ninguna irreversible.
- **Estados:** perfil D de las convenciones.

```text
[CLIENT / Cart]
[Título | contexto | estado]
[Contenido principal + resumen/detalle lateral]
[Ir a checkout]
Mobile → Secciones apiladas + acciones visibles
```

### CLI-05 — Checkout
- **Canal / ruta:** CLIENT · `/client/checkout` (propuesta).
- **Propósito / usuario:** Revisar entrega, importes y confirmación. Cliente autenticado con acceso a sus recursos.
- **Módulos:** orders, delivery, billing, payments.
- **Permisos requeridos:** propuesta `orders.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** No / No / No / No.
- **Desktop:** Formulario de 1–2 columnas + resumen.
- **Mobile:** Formulario de una columna compatible con teclado virtual.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Confirmar pedido según política.
- **Secundarias:** Volver al carrito.
- **Sensibles:** Confirmación del pedido/pago; sin éxito optimista.
- **Estados:** perfil F de las convenciones.

```text
[CLIENT / Checkout]
[Título | contexto | estado]
[Formulario de 1–2 columnas + resumen]
[Confirmar pedido según política]
Mobile → Formulario de una columna compatible con teclado virtual
```

### CLI-06 — Order Tracking
- **Canal / ruta:** CLIENT · `/client/orders/[orderId]` (propuesta).
- **Propósito / usuario:** Consultar avance del pedido propio. Cliente autenticado con acceso a sus recursos.
- **Módulos:** orders, kitchen, delivery.
- **Permisos requeridos:** propuesta `orders.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** No / No / No / No.
- **Desktop:** Contenido principal + resumen/detalle lateral.
- **Mobile:** Secciones apiladas + acciones visibles.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Ver seguimiento.
- **Secundarias:** Contactar soporte.
- **Sensibles:** Cancelar solo si política y estado lo permiten.
- **Estados:** perfil D de las convenciones; estados de conexión y reconciliación.

```text
[CLIENT / Order Tracking]
[Título | contexto | estado]
[Contenido principal + resumen/detalle lateral]
[Ver seguimiento]
Mobile → Secciones apiladas + acciones visibles
```

### CLI-07 — Reservation
- **Canal / ruta:** CLIENT · `/client/reservations` (propuesta).
- **Propósito / usuario:** Consultar y solicitar reservas propias. Cliente autenticado con acceso a sus recursos.
- **Módulos:** reservations, tables.
- **Permisos requeridos:** propuesta `reservations.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** No / estado, fecha / fecha e ID / offset propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Solicitar reserva.
- **Secundarias:** Ver detalle.
- **Sensibles:** Cancelar reserva con confirmación.
- **Estados:** perfil L de las convenciones.

```text
[CLIENT / Reservation]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Solicitar reserva]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### CLI-08 — Messages
- **Canal / ruta:** CLIENT · `/client/messages` (propuesta).
- **Propósito / usuario:** Conversar sobre la atención. Cliente autenticado con acceso a sus recursos.
- **Módulos:** messaging.
- **Permisos requeridos:** propuesta `messaging.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** Texto / conversación / secuencia e ID / cursor histórico.
- **Desktop:** Conversaciones + hilo + compositor.
- **Mobile:** Lista → hilo a pantalla completa con compositor visible.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Enviar mensaje.
- **Secundarias:** Cargar historial.
- **Sensibles:** Ninguna definida.
- **Estados:** perfil L de las convenciones; estados de conexión y reconciliación.

```text
[CLIENT / Messages]
[Búsqueda | filtros | orden]
[Conversaciones + hilo + compositor]
[Enviar mensaje]
Mobile → Lista → hilo a pantalla completa con compositor visible
```

### CLI-09 — Profile
- **Canal / ruta:** CLIENT · `/client/profile` (propuesta).
- **Propósito / usuario:** Gestionar datos propios y acceso. Cliente autenticado con acceso a sus recursos.
- **Módulos:** clients, users, auth.
- **Permisos requeridos:** propuesta `clients.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** No / No / No / No.
- **Desktop:** Formulario de 1–2 columnas + resumen.
- **Mobile:** Formulario de una columna compatible con teclado virtual.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Guardar perfil.
- **Secundarias:** Cambiar contraseña; cerrar sesión.
- **Sensibles:** Cambiar contraseña según política.
- **Estados:** perfil F de las convenciones.

```text
[CLIENT / Profile]
[Título | contexto | estado]
[Formulario de 1–2 columnas + resumen]
[Guardar perfil]
Mobile → Formulario de una columna compatible con teclado virtual
```

### CLI-10 — Orders
- **Canal / ruta:** CLIENT · `/client/orders` (propuesta).
- **Propósito / usuario:** Consultar historial de pedidos propios. Cliente autenticado con acceso a sus recursos.
- **Módulos:** orders.
- **Permisos requeridos:** propuesta `orders.read` con alcance propio; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** ID / estado, fecha / fecha e ID / cursor propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir pedido.
- **Secundarias:** Filtrar historial.
- **Sensibles:** Cancelar desde detalle si está permitido.
- **Estados:** perfil L de las convenciones; estados de conexión y reconciliación.

```text
[CLIENT / Orders]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir pedido]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### OPE-11 — Operational Dashboard
- **Canal / ruta:** OPERATIONAL · `/operation` (ruta inicial).
- **Propósito / usuario:** Priorizar trabajo del turno. Personal operativo con capacidades asignadas.
- **Módulos:** operations, orders, tables.
- **Permisos requeridos:** propuesta `operations.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** No / turno o estado / prioridad estable / No.
- **Desktop:** Paneles o columnas con prioridades visibles.
- **Mobile:** Paneles apilados o tabs por estado.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir tarea.
- **Secundarias:** Ver estado de servicio.
- **Sensibles:** Ninguna directa.
- **Estados:** perfil B de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Operational Dashboard]
[Título | contexto | estado]
[Paneles o columnas con prioridades visibles]
[Abrir tarea]
Mobile → Paneles apilados o tabs por estado
```

### OPE-12 — Tables
- **Canal / ruta:** OPERATIONAL · `/operation/tables` (propuesta).
- **Propósito / usuario:** Ver ocupación y seleccionar mesa. Personal operativo con capacidades asignadas.
- **Módulos:** tables, reservations, orders.
- **Permisos requeridos:** propuesta `tables.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Mesa / zona, estado / número e ID / No inicial.
- **Desktop:** Paneles o columnas con prioridades visibles.
- **Mobile:** Paneles apilados o tabs por estado.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir mesa.
- **Secundarias:** Filtrar zona.
- **Sensibles:** Ninguna directa.
- **Estados:** perfil B de las convenciones.

```text
[OPERATIONAL / Tables]
[Título | contexto | estado]
[Paneles o columnas con prioridades visibles]
[Abrir mesa]
Mobile → Paneles apilados o tabs por estado
```

### OPE-13 — Table Detail
- **Canal / ruta:** OPERATIONAL · `/operation/tables/[tableId]` (propuesta).
- **Propósito / usuario:** Trabajar sobre atención de una mesa. Personal operativo con capacidades asignadas.
- **Módulos:** tables, orders, reservations, billing.
- **Permisos requeridos:** propuesta `tables.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** No / No / No / No.
- **Desktop:** Contenido principal + resumen/detalle lateral.
- **Mobile:** Secciones apiladas + acciones visibles.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir o gestionar pedido.
- **Secundarias:** Ver cuenta.
- **Sensibles:** Cancelar ítem enviado desde detalle.
- **Estados:** perfil D de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Table Detail]
[Título | contexto | estado]
[Contenido principal + resumen/detalle lateral]
[Abrir o gestionar pedido]
Mobile → Secciones apiladas + acciones visibles
```

### OPE-14 — Orders
- **Canal / ruta:** OPERATIONAL · `/operation/orders` (propuesta).
- **Propósito / usuario:** Gestionar pedidos activos. Personal operativo con capacidades asignadas.
- **Módulos:** orders, availability.
- **Permisos requeridos:** propuesta `orders.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** ID / estado, canal, fecha / prioridad o fecha e ID / cursor propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir pedido.
- **Secundarias:** Buscar y filtrar.
- **Sensibles:** Cancelación con impacto y motivo.
- **Estados:** perfil L de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Orders]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir pedido]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### OPE-15 — Order Detail
- **Canal / ruta:** OPERATIONAL · `/operation/orders/[orderId]` (propuesta).
- **Propósito / usuario:** Consultar y modificar pedido permitido. Personal operativo con capacidades asignadas.
- **Módulos:** orders, kitchen, billing.
- **Permisos requeridos:** propuesta `orders.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** No / No / No / No.
- **Desktop:** Contenido principal + resumen/detalle lateral.
- **Mobile:** Secciones apiladas + acciones visibles.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Avanzar estado permitido.
- **Secundarias:** Ver ítems e historial.
- **Sensibles:** Cancelar pedido o ítem enviado.
- **Estados:** perfil D de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Order Detail]
[Título | contexto | estado]
[Contenido principal + resumen/detalle lateral]
[Avanzar estado permitido]
Mobile → Secciones apiladas + acciones visibles
```

### OPE-16 — Kitchen/KDS
- **Canal / ruta:** OPERATIONAL · `/operation/kitchen` (propuesta).
- **Propósito / usuario:** Procesar tickets de cocina. Personal operativo con capacidades asignadas.
- **Módulos:** kitchen, orders.
- **Permisos requeridos:** propuesta `kitchen.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** ID / estación, estado / prioridad, antigüedad e ID / No; ventana activa pendiente.
- **Desktop:** Paneles o columnas con prioridades visibles.
- **Mobile:** Paneles apilados o tabs por estado.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Aceptar; marcar listo según estado.
- **Secundarias:** Ver notas y detalle.
- **Sensibles:** Reversión de estado según política.
- **Estados:** perfil B de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Kitchen/KDS]
[Título | contexto | estado]
[Paneles o columnas con prioridades visibles]
[Aceptar; marcar listo según estado]
Mobile → Paneles apilados o tabs por estado
```

### OPE-17 — Reservations
- **Canal / ruta:** OPERATIONAL · `/operation/reservations` (propuesta).
- **Propósito / usuario:** Gestionar agenda de reservas. Personal operativo con capacidades asignadas.
- **Módulos:** reservations, tables.
- **Permisos requeridos:** propuesta `reservations.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Cliente o ID / fecha, estado / fecha e ID / offset propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir reserva.
- **Secundarias:** Asignar mesa si está permitido.
- **Sensibles:** Cancelar reserva.
- **Estados:** perfil L de las convenciones.

```text
[OPERATIONAL / Reservations]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir reserva]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### OPE-18 — Delivery
- **Canal / ruta:** OPERATIONAL · `/operation/delivery` (propuesta).
- **Propósito / usuario:** Gestionar entregas activas. Personal operativo con capacidades asignadas.
- **Módulos:** delivery, orders.
- **Permisos requeridos:** propuesta `delivery.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** ID / estado, responsable / prioridad e ID / cursor propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir y actualizar entrega.
- **Secundarias:** Ver detalle.
- **Sensibles:** Cancelar o reasignar según impacto.
- **Estados:** perfil L de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Delivery]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir y actualizar entrega]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### OPE-19 — Messaging
- **Canal / ruta:** OPERATIONAL · `/operation/messages` (propuesta).
- **Propósito / usuario:** Responder conversaciones operativas. Personal operativo con capacidades asignadas.
- **Módulos:** messaging.
- **Permisos requeridos:** propuesta `messaging.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** Texto / estado o conversación / actividad e ID / cursor.
- **Desktop:** Conversaciones + hilo + compositor.
- **Mobile:** Lista → hilo a pantalla completa con compositor visible.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir y responder.
- **Secundarias:** Cargar historial.
- **Sensibles:** Ninguna definida.
- **Estados:** perfil L de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Messaging]
[Búsqueda | filtros | orden]
[Conversaciones + hilo + compositor]
[Abrir y responder]
Mobile → Lista → hilo a pantalla completa con compositor visible
```

### OPE-20 — Bills
- **Canal / ruta:** OPERATIONAL · `/operation/bills` (propuesta).
- **Propósito / usuario:** Consultar cuentas y sus conceptos. Personal operativo con capacidades asignadas.
- **Módulos:** billing, orders.
- **Permisos requeridos:** propuesta `billing.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Cuenta o mesa / estado, fecha / fecha e ID / offset propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir cuenta.
- **Secundarias:** Ver desglose.
- **Sensibles:** Modificar o anular según política.
- **Estados:** perfil L de las convenciones.

```text
[OPERATIONAL / Bills]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir cuenta]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### OPE-21 — Payments
- **Canal / ruta:** OPERATIONAL · `/operation/payments` (propuesta).
- **Propósito / usuario:** Registrar y consultar pagos autorizados. Personal operativo con capacidades asignadas.
- **Módulos:** payments, billing.
- **Permisos requeridos:** propuesta `payments.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Referencia / estado, fecha / fecha e ID / offset propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir o registrar pago.
- **Secundarias:** Ver comprobante.
- **Sensibles:** Registrar/anular con confirmación autoritativa.
- **Estados:** perfil L de las convenciones.

```text
[OPERATIONAL / Payments]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir o registrar pago]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### OPE-22 — Cash
- **Canal / ruta:** OPERATIONAL · `/operation/cash` (propuesta).
- **Propósito / usuario:** Controlar caja del turno. Personal operativo con capacidades asignadas.
- **Módulos:** cash, payments.
- **Permisos requeridos:** propuesta `cash.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** No / turno / No / No.
- **Desktop:** Contenido principal + resumen/detalle lateral.
- **Mobile:** Secciones apiladas + acciones visibles.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Consultar movimientos.
- **Secundarias:** Ver resumen.
- **Sensibles:** Cerrar caja; sin optimismo.
- **Estados:** perfil D de las convenciones.

```text
[OPERATIONAL / Cash]
[Título | contexto | estado]
[Contenido principal + resumen/detalle lateral]
[Consultar movimientos]
Mobile → Secciones apiladas + acciones visibles
```

### OPE-23 — Inventory
- **Canal / ruta:** OPERATIONAL · `/operation/inventory` (propuesta).
- **Propósito / usuario:** Consultar existencias y movimientos. Personal operativo con capacidades asignadas.
- **Módulos:** inventory, availability.
- **Permisos requeridos:** propuesta `inventory.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** Insumo / categoría, umbral / nombre e ID / offset propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir insumo.
- **Secundarias:** Ver movimientos.
- **Sensibles:** Ajustar inventario con motivo.
- **Estados:** perfil L de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Inventory]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir insumo]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### OPE-24 — Production
- **Canal / ruta:** OPERATIONAL · `/operation/production` (propuesta).
- **Propósito / usuario:** Gestionar producción activa. Personal operativo con capacidades asignadas.
- **Módulos:** production, recipes, inventory.
- **Permisos requeridos:** propuesta `production.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** Lote o receta / estado, fecha / prioridad e ID / cursor propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir lote.
- **Secundarias:** Ver insumos.
- **Sensibles:** Confirmar consumo/ajuste según política.
- **Estados:** perfil L de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Production]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir lote]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### OPE-25 — Availability
- **Canal / ruta:** OPERATIONAL · `/operation/availability` (propuesta).
- **Propósito / usuario:** Consultar y cambiar disponibilidad permitida. Personal operativo con capacidades asignadas.
- **Módulos:** availability, menu, inventory.
- **Permisos requeridos:** propuesta `availability.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** Plato / categoría, estado / nombre e ID / offset propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir disponibilidad.
- **Secundarias:** Ver causa.
- **Sensibles:** Deshabilitar producto.
- **Estados:** perfil L de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Availability]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir disponibilidad]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### OPE-26 — Operational State
- **Canal / ruta:** OPERATIONAL · `/operation/state` (propuesta).
- **Propósito / usuario:** Consultar y controlar el servicio. Personal operativo con capacidades asignadas.
- **Módulos:** operations, settings.
- **Permisos requeridos:** propuesta `operations.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** No / No / No / No.
- **Desktop:** Contenido principal + resumen/detalle lateral.
- **Mobile:** Secciones apiladas + acciones visibles.
- **Touch:** controles ≥44px; acciones operativas principales de 48–56px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Ver estado vigente.
- **Secundarias:** Ver historial disponible.
- **Sensibles:** Cerrar servicio; suspender pedidos online.
- **Estados:** perfil D de las convenciones; estados de conexión y reconciliación.

```text
[OPERATIONAL / Operational State]
[Título | contexto | estado]
[Contenido principal + resumen/detalle lateral]
[Ver estado vigente]
Mobile → Secciones apiladas + acciones visibles
```

### ADM-27 — Dashboard
- **Canal / ruta:** ADMIN · `/admin` (ruta inicial).
- **Propósito / usuario:** Resumir indicadores administrativos. Personal administrativo con capacidades asignadas.
- **Módulos:** reports, operations.
- **Permisos requeridos:** propuesta `reports.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** No / período / No / No.
- **Desktop:** Paneles o columnas con prioridades visibles.
- **Mobile:** Paneles apilados o tabs por estado.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir reporte.
- **Secundarias:** Cambiar período.
- **Sensibles:** Ninguna.
- **Estados:** perfil B de las convenciones.

```text
[ADMIN / Dashboard]
[Título | contexto | estado]
[Paneles o columnas con prioridades visibles]
[Abrir reporte]
Mobile → Paneles apilados o tabs por estado
```

### ADM-28 — Users
- **Canal / ruta:** ADMIN · `/admin/users` (propuesta).
- **Propósito / usuario:** Administrar cuentas. Personal administrativo con capacidades asignadas.
- **Módulos:** users, roles.
- **Permisos requeridos:** propuesta `users.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Nombre o email / estado, rol / nombre e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir usuario.
- **Secundarias:** Crear o editar según permiso.
- **Sensibles:** Suspender usuario.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Users]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir usuario]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-29 — Roles
- **Canal / ruta:** ADMIN · `/admin/roles` (propuesta).
- **Propósito / usuario:** Administrar capacidades por rol. Personal administrativo con capacidades asignadas.
- **Módulos:** roles.
- **Permisos requeridos:** propuesta `roles.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Nombre / estado / nombre e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir rol.
- **Secundarias:** Ver asignaciones.
- **Sensibles:** Cambiar permiso crítico.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Roles]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir rol]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-30 — Staff
- **Canal / ruta:** ADMIN · `/admin/staff` (propuesta).
- **Propósito / usuario:** Administrar personal. Personal administrativo con capacidades asignadas.
- **Módulos:** staff, users.
- **Permisos requeridos:** propuesta `staff.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Nombre / estado / nombre e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir personal.
- **Secundarias:** Editar datos.
- **Sensibles:** Suspender acceso asociado según política.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Staff]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir personal]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-31 — Menu
- **Canal / ruta:** ADMIN · `/admin/menu` (propuesta).
- **Propósito / usuario:** Administrar catálogo de platos. Personal administrativo con capacidades asignadas.
- **Módulos:** menu, availability.
- **Permisos requeridos:** propuesta `menu.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Nombre / categoría, estado / nombre e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir plato.
- **Secundarias:** Crear o editar.
- **Sensibles:** Deshabilitar producto.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Menu]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir plato]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-32 — Recipes
- **Canal / ruta:** ADMIN · `/admin/recipes` (propuesta).
- **Propósito / usuario:** Administrar recetas e insumos. Personal administrativo con capacidades asignadas.
- **Módulos:** recipes, inventory.
- **Permisos requeridos:** propuesta `recipes.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Nombre / categoría, estado / nombre e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir receta.
- **Secundarias:** Editar composición.
- **Sensibles:** Cambio con impacto en producción según política.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Recipes]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir receta]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-33 — Suppliers
- **Canal / ruta:** ADMIN · `/admin/suppliers` (propuesta).
- **Propósito / usuario:** Administrar proveedores. Personal administrativo con capacidades asignadas.
- **Módulos:** suppliers.
- **Permisos requeridos:** propuesta `suppliers.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Nombre / estado / nombre e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir proveedor.
- **Secundarias:** Crear o editar.
- **Sensibles:** Desactivar según dependencias.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Suppliers]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir proveedor]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-34 — Purchases
- **Canal / ruta:** ADMIN · `/admin/purchases` (propuesta).
- **Propósito / usuario:** Gestionar compras y recepción. Personal administrativo con capacidades asignadas.
- **Módulos:** purchases, suppliers, inventory.
- **Permisos requeridos:** propuesta `purchases.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Referencia / proveedor, estado, fecha / fecha e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir compra.
- **Secundarias:** Crear borrador.
- **Sensibles:** Confirmar recepción o anular.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Purchases]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir compra]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-35 — Production
- **Canal / ruta:** ADMIN · `/admin/production` (propuesta).
- **Propósito / usuario:** Supervisar producción e historial. Personal administrativo con capacidades asignadas.
- **Módulos:** production, recipes, inventory.
- **Permisos requeridos:** propuesta `production.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** Sí.
- **Search / Filter / Sort / Pagination:** Lote / estado, fecha / fecha e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir producción.
- **Secundarias:** Ver historial.
- **Sensibles:** Ajustes y consumo crítico.
- **Estados:** perfil L de las convenciones; estados de conexión y reconciliación.

```text
[ADMIN / Production]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir producción]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-36 — Reports
- **Canal / ruta:** ADMIN · `/admin/reports` (propuesta).
- **Propósito / usuario:** Consultar reportes autorizados. Personal administrativo con capacidades asignadas.
- **Módulos:** reports.
- **Permisos requeridos:** propuesta `reports.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Nombre / tipo, período / nombre e ID / offset si catálogo extenso.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir reporte.
- **Secundarias:** Exportar si está autorizado.
- **Sensibles:** Ninguna definida.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Reports]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir reporte]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-37 — Cash Closings
- **Canal / ruta:** ADMIN · `/admin/cash-closings` (propuesta).
- **Propósito / usuario:** Consultar cierres y diferencias. Personal administrativo con capacidades asignadas.
- **Módulos:** cash, reports.
- **Permisos requeridos:** propuesta `cash.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Referencia / fecha, responsable / fecha e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir cierre.
- **Secundarias:** Ver desglose.
- **Sensibles:** Reapertura/corrección solo si política lo permite.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Cash Closings]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir cierre]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-38 — Clients
- **Canal / ruta:** ADMIN · `/admin/clients` (propuesta).
- **Propósito / usuario:** Consultar y administrar clientes. Personal administrativo con capacidades asignadas.
- **Módulos:** clients, users.
- **Permisos requeridos:** propuesta `clients.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Nombre / estado / nombre e ID / offset.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir cliente.
- **Secundarias:** Editar según permiso.
- **Sensibles:** Suspender cuenta asociada según política.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Clients]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir cliente]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### ADM-39 — Settings
- **Canal / ruta:** ADMIN · `/admin/settings` (propuesta).
- **Propósito / usuario:** Gestionar configuración del negocio. Personal administrativo con capacidades asignadas.
- **Módulos:** settings.
- **Permisos requeridos:** propuesta `settings.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** No / sección / No / No.
- **Desktop:** Formulario de 1–2 columnas + resumen.
- **Mobile:** Formulario de una columna compatible con teclado virtual.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Guardar cambios.
- **Secundarias:** Restablecer edición local.
- **Sensibles:** Cambiar configuración crítica.
- **Estados:** perfil F de las convenciones.

```text
[ADMIN / Settings]
[Título | contexto | estado]
[Formulario de 1–2 columnas + resumen]
[Guardar cambios]
Mobile → Formulario de una columna compatible con teclado virtual
```

### ADM-40 — AI
- **Canal / ruta:** ADMIN · `/admin/ai` (propuesta).
- **Propósito / usuario:** Delimitar acceso a capacidades AI pendientes. Personal administrativo con capacidades asignadas.
- **Módulos:** ai.
- **Permisos requeridos:** propuesta `ai.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Pendiente / Pendiente / Pendiente / Pendiente.
- **Desktop:** Secciones de contenido jerarquizadas.
- **Mobile:** Secciones apiladas.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Pendiente de alcance.
- **Secundarias:** Pendiente.
- **Sensibles:** Pendiente; no permitir acciones autónomas por inferencia.
- **Estados:** perfil C de las convenciones.

```text
[ADMIN / AI]
[Título | contexto | estado]
[Secciones de contenido jerarquizadas]
[Pendiente de alcance]
Mobile → Secciones apiladas
```

### ADM-41 — Vision
- **Canal / ruta:** ADMIN · `/admin/vision` (propuesta).
- **Propósito / usuario:** Delimitar acceso a capacidades Vision pendientes. Personal administrativo con capacidades asignadas.
- **Módulos:** vision.
- **Permisos requeridos:** propuesta `vision.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Pendiente / Pendiente / Pendiente / Pendiente.
- **Desktop:** Secciones de contenido jerarquizadas.
- **Mobile:** Secciones apiladas.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Pendiente de alcance.
- **Secundarias:** Pendiente.
- **Sensibles:** Pendiente de alcance y datos.
- **Estados:** perfil C de las convenciones.

```text
[ADMIN / Vision]
[Título | contexto | estado]
[Secciones de contenido jerarquizadas]
[Pendiente de alcance]
Mobile → Secciones apiladas
```

### ADM-42 — Audit
- **Canal / ruta:** ADMIN · `/admin/audit` (propuesta).
- **Propósito / usuario:** Consultar trazabilidad autorizada. Personal administrativo con capacidades asignadas.
- **Módulos:** audit.
- **Permisos requeridos:** propuesta `audit.read`; acciones de escritura requieren capacidad específica pendiente.
- **Realtime:** No inicial.
- **Search / Filter / Sort / Pagination:** Referencia / actor, acción, fecha / fecha e ID / cursor propuesto.
- **Desktop:** Toolbar + tabla/lista + detalle contextual.
- **Mobile:** Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla.
- **Touch:** controles ≥44px; scroll sin depender de hover; alternativas visibles a gestos.
- **Acciones principales:** Abrir evento.
- **Secundarias:** Filtrar; exportar si está autorizado.
- **Sensibles:** Ninguna; vista de consulta.
- **Estados:** perfil L de las convenciones.

```text
[ADMIN / Audit]
[Búsqueda | filtros | orden]
[Toolbar + tabla/lista + detalle contextual]
[Abrir evento]
Mobile → Tarjetas/lista + filtros en sheet + detalle en sheet/pantalla
```

### Vistas públicas y de autenticación

Estas fichas heredan interacción click/tap/keyboard/trackpad, targets de 44px y foco visible. No requieren permisos privados, realtime, búsqueda, filtros, orden ni paginación, salvo `/menu`, que hereda la ficha Menu CLIENT para esas herramientas. En auth, desktop usa un panel centrado de ancho acotado y mobile una columna con teclado virtual; no mostrar credenciales de ejemplo como acceso real.

| ID | Nombre / ruta inicial | Propósito / usuario | Módulos | Principal / secundaria / sensible | Estados | Desktop → mobile |
| --- | --- | --- | --- | --- | --- | --- |
| PUB-01 | Home `/` | Presentar WOK a visitantes | menu | Ver menú / ubicación y login / ninguna | C | Secciones visuales → secciones apiladas |
| PUB-02 | Menu `/menu` | Explorar catálogo sin sesión | menu, availability | Ver plato / filtrar / ninguna | L | Grid y toolbar → cards y filter sheet |
| PUB-03 | Location `/location` | Consultar ubicación y horario | settings | Consultar dirección / contacto / ninguna | C | Información y recurso de ubicación → bloques apilados |
| AUT-01 | Login `/login` | Iniciar sesión; visitante | auth | Entrar / recuperar y registrarse / ninguna | F + intentos restantes y locked | Panel → formulario de una columna |
| AUT-02 | Register `/register` | Solicitar cuenta; visitante | auth | Registrarse / volver a login / ninguna | F + pending verification | Panel → formulario de una columna |
| AUT-03 | Verify Email `/verify-email` | Verificar solicitud pendiente | auth | Verificar PIN / reenviar según política / ninguna | F + PIN inválido, expirado y verified | Panel → formulario con pegado de PIN y labels |
| AUT-04 | Forgot Password `/forgot-password` | Iniciar recuperación | auth | Enviar solicitud / volver / ninguna | F + confirmación neutral | Panel → formulario de una columna |
| AUT-05 | Reset Password `/reset-password` | Resolver challenge y nueva contraseña | auth | Restablecer / reiniciar recuperación / cambio de contraseña | F + challenge inválido o expirado | Panel → pasos en una columna |
| AUT-06 | Locked `/locked` | Explicar bloqueo y vía de recuperación | auth | Seguir recuperación permitida / volver / ninguna | C + locked | AccountLockedCard → card de ancho disponible |

No inventar dirección, horarios, datos de contacto ni contenido comercial. Un mapa externo o proveedor de ubicación queda pendiente. El acceso público a detalle de plato necesita definir ruta y política de compra invitada; no redirigir silenciosamente todo el catálogo público al canal privado.

### Wireframes compuestos de referencia

```text
CLIENT MOBILE
┌──────────────────────────────┐
│ [Logo oficial]  [Carrito] [Yo]│
├──────────────────────────────┤
│ Título y contexto            │
│ [Buscar____________] [Filtro]│
│ [Foto] Plato    Precio       │
│        [Ver detalle]         │
│ [Foto] Plato    Precio       │
│        [Ver detalle]         │
├──────────────────────────────┤
│ Home | Menu | Orders | Profile│
└──────────────────────────────┘

OPERATIONAL KDS DESKTOP
┌─────────────────────────────────────────────────────────────┐
│ COCINA     [Estación]    Carga: alta     [Estado de conexión]  │
├───────────────────┬───────────────────┬─────────────────────┤
│ NUEVOS            │ EN PREPARACIÓN    │ LISTOS              │
│ #581 · 08:42      │ #579 · 05:13      │ #576                │
│ Plato x2          │ Plato x1          │ Plato x2            │
│ Nota del pedido   │                   │                     │
│ [ACEPTAR] [Más]   │ [LISTO] [Más]     │ [Acción permitida]  │
└───────────────────┴───────────────────┴─────────────────────┘
Mobile/tablet estrecha: tabs por estado con contadores + tarjetas.
No ocultar estados restantes; conservar selección al redimensionar.
Las transiciones y quién puede ejecutarlas dependen del dominio.

ADMIN DESKTOP
┌──────────────┬──────────────────────────────────────────────┐
│ Logo oficial │ Título                         [Acción]      │
│ Navegación   ├──────────────────────────────────────────────┤
│              │ [Buscar] [Filtros activos] [Orden]           │
│              │ Tabla con columnas relevantes               │
│              │ Fila                         [Ver] [Más]    │
│              │ [Anterior] Estado de página [Siguiente]      │
└──────────────┴──────────────────────────────────────────────┘
Mobile: [Menú] + título; [Buscar] [Filtros] [Orden]; tarjetas;
detalle en sheet/pantalla y paginación compacta.
```

Estos esquemas proporcionan estructura provisional. La correspondencia con los 16 prototipos administrativos solicitados no puede verificarse hasta recibir los originales; no se declara cumplida esa fidelidad visual.

## 11. Plan de implementación posterior

Este plan establece dependencias técnicas, sin modificar planificación Scrum.

1. Recuperar y leer el contexto de proyecto, decisiones, alcance y referencias faltantes. Confirmar stack, políticas y assets; resolver los bloqueos relevantes de la sección 14.
2. Revisar el plano consolidado y validar las propuestas de rutas, permisos y patrones. Mantener pendientes explícitos para AI/Vision y reglas de negocio no definidas.
3. Preparar fundación en `feature/frontend-foundation` cuando se autorice implementación y se confirme la branch. Comprobar working tree e historial antes de cualquier checkout o actualización. No crear una rama sustituta ni integrar a development automáticamente.
4. Configurar workspace y aplicación web según stack confirmado; TypeScript strict, ESLint, Prettier y framework de pruebas confirmado. Scripts objetivo: `dev:web`, `lint`, `typecheck`, `test`, `format`.
5. Implementar GLOBAL, tokens dark, providers, configuración, manejo de errores/loading y shells AUTH/PUBLIC/PRIVATE. Preparar navegación por permisos y contextos.
6. Implementar auth mock completo, servicios/adapters, estados privados, helpers RBAC, cliente API y fixtures. Crear páginas mínimas de rutas iniciales; ninguna promete una feature no implementada.
7. Implementar un listado demostrativo con datos sintéticos que valide búsqueda, filtros, orden, offset/cursor, URL state y estados. Mantenerlo como demostración técnica, no módulo comercial nuevo. Simular realtime para validar invalidación y UX sin servidor.
8. Probar la fundación, documentar APIs públicas y registrar componentes/especificaciones que quedan para features.

### Alcance ejecutable mínimo de la fundación

- Shell público con `/`, `/menu` y `/location` mínimos y contenido real únicamente cuando esté disponible.
- Las seis rutas auth y los siete componentes auth, con escenarios mock verificables.
- Entradas `/client`, `/operation` y `/admin` con navegación configurada y estados de acceso.
- Componentes compartidos consumidos por esos flujos, tokens y patrones de listado/confirmación.
- Contratos de servicio mock/HTTP, configuración de entorno, permisos y abstracción realtime.
- Documentación del resto de módulos y vistas; sin archivos vacíos por módulo.

No se incluyen backend, PostgreSQL, rediseño ERD, secretos, credenciales reales, todas las páginas, transporte realtime real, operaciones financieras reales ni acceso directo a DB.

Mobile: crear `apps/mobile` solo si React Native/Expo están confirmados; de lo contrario conservar aquí los requisitos hasta que se autorice su README específico. Desktop: no elegir Tauri/Electron; documentar touch, mouse, keyboard, resize y reutilización de layout. Su shell requiere framework confirmado.

## 12. Validación y criterios de aceptación

### Pruebas automatizadas previstas para la fundación

| Área | Evidencia requerida |
| --- | --- |
| Permisos | Ninguno, uno, varios, any/all y denegación; documentar semántica de listas vacías. |
| Auth adapter | Conversión DTO/modelo, datos inválidos y error normalizado. |
| Auth schema | Entradas válidas/inválidas según política confirmada, sin reglas comerciales inventadas. |
| LoginForm | Labels, validación, pending, error, intentos y bloqueo mock. |
| Search | Debounce con tiempo controlado, clear, cancelación y respuesta antigua ignorada. |
| Pagination | Límites offset, ausencia de total en cursor, reset por filtros y selección estable. |
| URL params | Serialización y lectura equivalentes, defaults, entradas inválidas, back/forward. |
| Realtime | Evento que coincide, deja de coincidir, duplicado, invalidación de página y reconexión. |
| Confirmación | Cancelar no muta; confirmar evita doble envío; motivo según configuración. |

No fijar framework antes de consultar `TECH_DECISIONS.md`. El plano documental no requiere ejecutar tests de aplicación inexistentes.

### Validación manual de UX

- Anchuras aproximadas: 390px, tablet (768px como punto de prueba), laptop (1024–1280px), desktop 1440px y wide 1920px. Probar también anchuras intermedias y redimensionamiento continuo.
- Touch: tap, separación y tamaño de targets, scroll, alternativa a swipe/long press, formularios con teclado virtual y modal/sheet. Comprobar desktop con pantalla táctil.
- Teclado: tab order, foco visible, Enter/Space, Escape, apertura/cierre de overlays, retorno de foco y ausencia de trampas involuntarias.
- Accesibilidad: labels, estructura semántica, nombres accesibles, contraste medido, zoom, reduced motion y anuncios de feedback.
- Realtime: listas no saltan durante interacción; reconexión revalida; stale es comprensible; refresco de fondo no bloquea toda la vista.
- Formularios: errores preservan datos, pending evita duplicación y móvil permite ver campo, error y acción con teclado abierto.

### Checklist técnico futuro

Comprobar inicio de Next.js si fue confirmado, compilación strict, lint y tests; presencia de capas, auth, público, privado y canales; módulos documentados, shared, mocks y API client; ausencia de DB y secretos; responsive, touch y teclado; búsqueda/filtros/orden/paginación; realtime y RBAC. Verificar build de producción cuando exista script apropiado.

Commit y push pertenecen a una autorización posterior. El mensaje sugerido del requerimiento inicial es `feat: crea arquitectura base del frontend` para código de fundación; no corresponde usarlo para este único documento. Solo tras publicación autorizada verificar sincronización remota y working tree limpio. En esta entrega se espera un archivo documental sin commit, por lo que working tree limpio no es criterio aplicable.

## 13. Organización documental futura

Este archivo concentra los entregables para revisión. No se afirma que existan los siguientes archivos por separado. Cuando se decida dividirlo, mantener enlaces y una sola fuente de verdad por tema.

| Documento previsto | Contenido de esta especificación |
| --- | --- |
| `docs/frontend/UI_BLUEPRINT.md` | Arquitectura visual, shells, canales, wireframes y mapeo a componentes (§4, §6, §10). |
| `docs/frontend/UX_GUIDELINES.md` | Personalidad, accesibilidad, entrada, responsive y rendimiento (§4, §7). |
| `docs/frontend/DESIGN_SYSTEM.md` | Identidad, tokens, densidad, componentes y estados (§5–6). |
| `docs/frontend/VIEW_CATALOG.md` | Fichas, rutas, dependencias, permisos y patrones (§10). |
| `docs/frontend/INTERACTION_PATTERNS.md` | Formularios, overlays, confirmaciones, listados y realtime (§6–9). |
| `docs/architecture/frontend/layers.md` | Responsabilidades y límites (§3). |
| `docs/architecture/frontend/modules.md` | Catálogo y plantilla (§3). |
| `docs/architecture/frontend/data-flow.md` | DTO, adapters, servicios, mock/HTTP y cliente API (§8). |
| `docs/architecture/frontend/routes.md` | Rutas iniciales y propuestas (§4, §10). |
| `docs/architecture/frontend/responsive.md` | Transformaciones y validación (§4–7, §10, §12). |
| `docs/architecture/frontend/realtime.md` | Contrato, consistencia y pruebas (§9, §12). |
| `docs/architecture/frontend/state-management.md` | Server state, UI state y estados UX (§7–9). |
| `docs/architecture/frontend/module-boundaries.md` | APIs públicas y dependencias (§3, §8). |
| `docs/architecture/frontend/accessibility.md` | Semántica, foco, entrada y validación (§6–7, §12). |

La documentación frontend consolidada será lectura previa a implementar. Código y nombres de identificadores en inglés; comentarios explicativos en español, sin comentar lo obvio. No modificar ahora README/AGENTS para añadir obligatoriedad ni crear documentos vacíos.

## 14. Decisiones pendientes y límites verificables

| ID | Falta / decisión | Impacto |
| --- | --- | --- |
| P01 | Contexto, alcance, arquitectura y catálogo oficiales | No validar cobertura funcional definitiva ni contradicciones con decisiones previas. |
| P02 | `TECH_DECISIONS.md` y estados `CONFIRMED_CLASS` | Bloquea selección/instalación del stack, testing, Query y shells mobile/desktop. |
| P03 | Logos oficiales, tipografía, fotos y prototipos | Bloquea fidelidad visual; paleta procede del requerimiento, escalas son propuestas. |
| P04 | Aprobar rutas ampliadas, home público y compra invitada | Define navegación pública/privada, carrito y checkout. |
| P05 | Catálogo RBAC, alcance de datos y acceso multicanal | Los permisos de fichas son conceptos, no autorización backend. |
| P06 | Políticas auth, sesión y recuperación | Define PIN, bloqueo, contraseña, reenvío y reautenticación; mocks no las deciden. |
| P07 | Contratos API, errores, paginación y eventos | Define transporte, orden, IDs, versiones, conteos y reconciliación reales. |
| P08 | Reglas comerciales y transiciones operativas | No fijar horarios, tolerancias, propinas, pagos, cancelaciones, cierre ni ajustes. |
| P09 | Alcance AI y Vision | Sus fichas son reservas explícitas; no hay evidencia para inventar flujos ni acciones. |
| P10 | Pares de contraste, iconos y variantes visuales | Requiere validar tokens derivados antes de dar por accesible la UI. |
| P11 | Próxima ejecución y publicación | Esta entrega solo autoriza documento local; no autoriza implementar ni publicar. |

La especificación permite identificar vista, ubicación propuesta, canal, módulos, patrón desktop/mobile, entrada, realtime y herramientas de listado. No permite afirmar fidelidad a prototipos ausentes ni contratos de negocio/seguridad aprobados. Esos límites quedan localizados arriba para revisión, sin impedir la entrega documental actual.
