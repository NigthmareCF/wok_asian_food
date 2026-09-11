# Progreso del canal Cliente

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
