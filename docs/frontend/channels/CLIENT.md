# Canal Cliente

Responsables: Barrera y Carlos Chan. Rama de canal disponible: `feature/frontend-client`.

El canal Cliente prioriza una experiencia simple para consultar disponibilidad, solicitar pedidos, reservar y seguir estados. La información de inventario debe ser menos detallada que la mostrada al personal.

## Ubicación técnica

- Rutas públicas: `apps/web/src/app/(public)`.
- Rutas privadas: `apps/web/src/app/(private)/(client)/client`.
- Dominios principales: `modules/auth`, `modules/menu`, `modules/orders`, `modules/reservations`, `modules/messaging` y `modules/clients`.
- Navegación del canal: `apps/web/src/config/navigation.ts`.

Las rutas indicadas como propuestas deben confirmarse en el PR antes de considerarse contrato definitivo.

## Catálogo de vistas

| ID   | Ruta inicial                                               | Controles y acciones mínimas                                                | Estados mínimos                                                    |
| ---- | ---------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| C-01 | `/login`, `/register`, `/forgot-password`, `/verify-email` | Ingresar, crear cuenta, recuperar acceso, verificar y volver                | Validación, envío, error neutral, bloqueo y verificación pendiente |
| C-02 | `/client`                                                  | Pedir, reservar, ubicación, mensajes y accesos a recomendaciones/categorías | Restaurante abierto/cerrado, ETA y disponibilidad general          |
| C-03 | `/menu`                                                    | Categorías, búsqueda, ver detalle y agregar cuando corresponda              | Cargando, vacío, error, disponible, pocas unidades y no disponible |
| C-04 | `/menu/[productId]` propuesta                              | Seleccionar opciones obligatorias, extras permitidos, observación y agregar | Opción incompleta, disponibilidad cambiada y ETA adicional         |
| C-05 | `/client/cart` propuesta                                   | Aumentar, disminuir, eliminar, elegir servicio y continuar                  | Carrito vacío, revalidando y producto no disponible                |
| C-06 | Estado dentro de carrito/pedido                            | Esperar, cancelar solicitud o pedir aviso                                   | Servicio degradado, alta demanda y reconexión                      |
| C-07 | `/client/reservations/new` propuesta                       | Fecha, hora, personas, preorden, nota y continuar                           | Disponibilidad, validación y confirmación pendiente                |
| C-08 | Estado dentro de reservación                               | Usar 21:15 o elegir otra hora                                               | Reserva tardía y preorden obligatoria                              |
| C-09 | `/client/checkout` propuesta                               | Elegir servicio, momento y método de pago; confirmar solicitud              | Método no disponible, revalidación y envío pendiente               |
| C-10 | `/client/orders/[orderId]` propuesta                       | Consultar estado, ETA, cambios y detalle de delivery                        | Pendiente, confirmado, preparación, listo, retrasado y entregado   |
| C-11 | `/location`                                                | Consultar dirección y abrir navegación externa cuando exista proveedor      | Permiso de ubicación denegado y proveedor pendiente                |
| C-12 | `/client/messages` propuesta                               | Elegir conversación, enviar texto y comprobante permitido                   | Conectando, enviado, error y atención humana requerida             |
| C-13 | `/client/profile` propuesta                                | Consultar datos, preferencias, historial y solicitar eliminación            | Activo, suspendido y eliminación pendiente                         |

## Reglas que no se pueden omitir

- Agregar al carrito no reserva existencias; se revalida antes de confirmar.
- Una solicitud online no es un pedido confirmado hasta que el restaurante la acepte.
- La disponibilidad al cliente es simplificada y puede ocultar productos no vendibles.
- Sólo se muestran modificadores y extras configurados para el producto.
- Delivery separa preparación del restaurante y traslado externo.
- El costo de delivery no se mezcla con el ingreso del restaurante cuando lo cobra un tercero.
- La última hora normal de ingreso es 21:15 y las reservas tardías pueden exigir preorden.
- No crear promociones, descuentos o recomendaciones comerciales no configuradas.
- Los flujos de autenticación son visuales hasta integrar backend.

## Navegación mínima

En móvil, el canal debe ofrecer acceso persistente a Inicio, Menú, Pedidos y Perfil. Carrito debe mostrar contador cuando existan artículos. Reservas, Mensajes y Ubicación pueden aparecer como accesos desde Inicio o Perfil sin saturar la barra principal.

En escritorio, usar la navegación del shell existente. Toda vista debe incluir un camino claro para volver al nivel anterior o al inicio del canal.

## Entrega del canal

El PR debe listar los IDs implementados, enlazar el mockup correspondiente y adjuntar capturas de móvil y escritorio. Las acciones dependientes de backend deben usar fixtures y mostrar claramente que son demostrativas; no deben afirmar que un correo, pago, pedido o reserva fue procesado realmente.
