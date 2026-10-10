# Barrera — propuesta de conexión de cuentas y pedidos

Fecha: 8 de octubre de 2026. Estado: propuesta no autorizada por el usuario el 8 de octubre de 2026; rutas nuevas NO implementadas. Se conserva únicamente como referencia, no como instrucción de ejecución.

## Evidencia actual

- OperationalAccountController expone GET /api/v1/operational/accounts/{accountId}, autorizado por accounts:manage.
- OperationalOrderController expone consulta, creación, detalle, adición de productos y cambio de estado; requiere orders:manage.
- No existen rutas BFF de cuentas/pedidos en el árbol actual.
- NewOrderView usa orderProducts y operationalTables de fixtures y useOrderSession. OrderSessionProvider mantiene pedidos en memoria. No basta habilitar su enlace para obtener pedidos reales.
- El detalle de mesa ya recibe accountId desde las rutas existentes de mesas.
- El transporte común admite GET/POST/PUT/DELETE y reenvía Idempotency-Key y X-Request-Id cuando se configuran. No requiere modificación para las primeras consultas o creación; PATCH corresponde a una sección posterior y a Fernando.

## Entrega 1 propuesta: cuenta operativa dentro del detalle de mesa

Única ruta BFF nueva:

GET /bff/operational/accounts/{accountId}
→ GET /api/v1/operational/accounts/{accountId}

Reutiliza endpoint(), cookies de sesión del servidor y no-store. Valida UUID, respuesta y pertenencia de la cuenta a la mesa consultada antes de presentarla. La autorización efectiva continúa en backend.

Mostrar nombre/estado de cuenta y lista de pedidos reales (código, estado, fecha y cantidad de líneas). Contemplar cuenta vacía, carga, error, sesión vencida, permisos insuficientes y cuenta inexistente. Al cerrar/cambiar la cuenta de la mesa, desmontar la consulta anterior para evitar mostrar otra cuenta.

La respuesta backend contiene total, paid, balance, tips y payments; esta entrega NO calcula ni implementa pagos, caja o saldo financiero, propiedad de Beto. Tampoco inventa moneda: AccountDetails no incluye código de moneda.

Archivos propuestos:

- Crear apps/web/src/app/bff/operational/accounts/[accountId]/route.ts: adaptación limitada a GET del backend existente.
- Crear apps/web/src/modules/tables/account-contract.ts: tipos y validación del contrato consumido por la vista operativa.
- Crear apps/web/src/modules/tables/components/operational-table-account.tsx: consulta y visualización operativa de la cuenta.
- Modificar apps/web/src/modules/tables/components/operational-table-detail-view.tsx: componer el panel con el accountId real.
- Añadir pruebas junto al contrato/componente y bajo el BFF de cuentas; actualizar docs/progress/OPERATIONAL.md.

Aceptación: abrir una mesa de prueba, ver cuenta real vacía, recargar y conservarla; al cerrar desaparece el panel activo. Si hay pedidos de prueba previamente creados mediante API, listar sus datos reales. UUID inválido no llama al backend; sesión ausente devuelve 401; backend 403/404 conserva códigos; respuesta inválida se trata como error sin mostrar fixtures.

No se crea página nueva, endpoint backend, migración ni transporte alternativo. No se modifica navegación común, BFF de otros dominios ni módulos financieros.

## Entrega 2 posterior: creación de pedido de salón

Requiere aprobación/aceptación separada después de la entrega 1:

- POST /bff/operational/orders → POST /api/v1/operational/orders.
- GET /bff/operational/orders/{orderId} → GET /api/v1/operational/orders/{orderId}.
- Reutilizar /bff/menu para catálogo público existente; comprobar si cubre el menú operativo requerido antes de prometer cobertura completa.
- Adaptar NewOrderView conservando diseño para cuenta UUID real, guestCount e items con menuItemId, quantity, fulfillment y notes, y channel DINE_IN.
- Precios y totales finales provienen del backend; no enviar importes calculados como autoridad.
- No traducir modificadores simulados a notas/recargos arbitrariamente: habilitar solo opciones representables en el contrato comprobado.
- Mantener Idempotency-Key del intento ante respuesta perdida; X-Request-Id no sustituye idempotencia.
- Mostrar comprobante real usando orderId recibido, nunca IDs simulados como A-104.
- No modificar globalmente OrderSessionProvider porque también lo consumen módulos aún simulados/financieros; limitar la conexión al recorrido entregado y revisar consumidores antes de editar.

GET /bff/operational/orders para listado, POST /{orderId}/items para ampliación y PATCH /{orderId}/status se evalúan en entregas posteriores; no son requisitos para la primera consulta de cuenta.

## Dependencias y alternativas

No se puede reutilizar /bff/order-requests como si fuera /operational/orders: gestiona solicitudes del cliente, con otro contrato y permisos. Tampoco se deben reutilizar rutas de mesas para devolver cuentas completas sin cambiar su contrato.

Llamar directamente desde el navegador requeriría cambiar el manejo de tokens/cookies; no es una alternativa dentro del alcance actual. Crear un proxy genérico o Server Action solo para eludir la restricción de rutas introduciría otra interfaz de servidor en vez de reutilizar la arquitectura.

La entrega 1 requiere solamente autorizar la ruta BFF de consulta de cuenta y sus archivos de dominio/pruebas. No requiere esperar cambios de Chan o Fernando ni autorización para PATCH. Toda necesidad nueva descubierta se informa antes de ampliar este alcance.

## Validación planificada

- Pruebas de contrato, ruta BFF y componente con respuestas válidas e inválidas y errores 401/403/404/503.
- Regresión de mesas, lint web, TypeScript y compilación.
- Prueba visual con cuenta de prueba local y persistencia al recargar; cierre sin pedidos para finalizar.
- Documentar por separado lo comprobado en pruebas aisladas y contra el sistema real.

No se ejecutan nuevas pruebas ni se crean registros con esta propuesta documental.
