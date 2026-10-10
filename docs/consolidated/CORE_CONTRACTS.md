# Core consolidado — contratos del candidato

La base es HEAD bbcb773b7f19804d54d04e69bc2d2410e46364a2 de feat/antony-client-delivery-complete más el delta local preservado por el manifiesto externo. Este documento describe el candidato aislado; no prueba el estado de un despliegue. F1–F4 y el protocolo financiero siguen vigentes.

## Reglas canónicas

- Reserva: mínimo 120 + 15 * ceil(max(comensales - 4, 0) / 2) minutos. Carga/capacidad puede exigir revisión. Llegada máxima 21:15 en America/Guatemala; en esa frontera se exige preorden completa declarada por el cliente y líneas no vacías.
- Cotizar no reserva. Al aceptar explícitamente la cotización y enviar formalmente la solicitud se toma un hold de 12 minutos, configurable en backend. Quotes y holds son recursos distintos; expiran duraderamente. Los workers recuperan recursos cada 5 segundos; las consultas de disponibilidad excluyen inmediatamente leases vencidos aunque el worker no haya corrido.
- Delivery recibido desde las 20:00 requiere revisión humana. Se usa created_at de la solicitud para no desplazar la frontera en una decisión tardía. Se exige posesión real verificada del teléfono exacto, override autorizado cuando corresponda y confirmación logística auditada antes de aceptar.
- Pickup normal hasta 21:30, nueva preparación hasta 21:20, sujeto a ETA compatible. Se elimina el máximo de tres horas. Horarios fuera de apertura y excepciones pasan a revisión; una ETA imposible o llegada después del cierre operativo no se convierte en promesa automática.
- Preorden es intención y snapshot de productos/modificadores/precios; no crea pedido ni tickets. Conversión operativa explícita con cuenta abierta de mesa asignada, versión de reserva y nueva validación de precio/stock crea el pedido. El backend rechaza convertir snapshots obsoletos; nunca cambia productos sin consentimiento.
- Cancelación pendiente de aceptación/pago: libre y libera hold. Después de aceptación: solicitud/revisión. PREPARING/READY se rechaza por defecto; override explícito de ADMIN vigente, motivo y auditoría. Pagos capturados o inciertos conservan sus guardas financieras.
- Sustitución de pedidos pickup/delivery aceptados y pedidos convertidos de preorden: propuesta de Operativo, decisión explícita del cliente y aplicación/rechazo de Operativo. PREPARING/READY requiere revisión manual y override ADMIN. La propuesta conserva el producto/precio original y alternativo. Diferencias en pedidos pagados quedan en FINANCIAL_REVIEW_REQUIRED/BLOCKED_NO_CONTRACT, sin cargo, devolución ni cambio de inventario ficticio.
- Documentos HTML escapados: comanda, precuenta y comprobante; aviso exacto: COMPROBANTE / PRECUENTA — NO ES DTE — NO FEL CERTIFICADO. Impresión por navegador; no certificación fiscal.

## Endpoints y consumidores

Todos los paths siguientes son relativos a /api/v1. Los BFF Web traducen /bff/core/* por una allowlist cerrada; las operaciones autenticadas mantienen X-Wok-Expected-Principal. Móvil consume API con su sesión existente. Idempotency-Key es UUID en creación, propuestas, consentimientos, conversión, overrides/logística y PUT de política. Decisiones de solicitudes existentes mantienen X-Request-Id y su recuperación por estado.

| Contrato | Consumidores | Persistencia y validación |
|---|---|---|
| POST/GET client/order-quotes[/id] | Checkout pickup/delivery Web y móvil | order_quotes/items/modifiers; fingerprint, ownership, precio/ETA/disponibilidad, sin hold |
| POST client/order-requests y client/delivery-requests | Web y móvil | quoteId + items/modifierIds; solicitud + hold atómicos, replay antes de revalidar un intento conocido |
| POST/GET client/reservation-quotes[/id]; POST client/reservations | Reservas Web y móvil | quoteId + guests/requestedAt/preorder/items; snapshots y leases de mesas/inventario |
| POST operational/order-requests/id/override y /logistics-confirmation | Operativo/Admin Web | ADMIN real para override; orders:manage para logística; auditoría e idempotencia |
| GET operational/reservations/core; POST operational/reservations/id/preorder-conversion | Operativo Web | accountId + expectedVersion; cuenta abierta, mesa asignada, snapshot/stock y recuperación de orderId |
| GET client/substitutions; POST client/substitutions/id/decision | Web y móvil Cliente | accept + expectedVersion, ownership, consentimiento durable |
| POST operational/order-requests/id/substitutions; GET operational/substitutions; POST operational/substitutions/id/decision | Operativo/Admin Web | línea, reemplazo/modifiers, expectedOrderVersion; apply/override/expectedVersion/reason |
| GET client/order-requests/id/documents/PREBILL o RECEIPT; GET operational/orders/id/documents/COMMAND, PREBILL, RECEIPT | Cliente Web/móvil y Operativo | ownership/capacidad y totales financieros por moneda; HTML escapado |
| GET public/service-policy; PUT admin/service-policy | Todos consultan; Admin edita | expectedVersion, Idempotency-Key, motivo; receipt inmutable del PUT |
| GET/POST client/phone-verification; POST client/phone-verification/confirm | Web/móvil Cliente | teléfono E.164 exacto, challengeId/code; códigos protegidos, límites y caducidad |

## Autorización y recuperación

No se añadió OAuth, gateway, roles públicos, elevación, ni cambios en configuración de seguridad. Existen CLIENT, OPERATIONAL y ADMIN; no existe MANAGER verificado, por lo que no se simula ese rol. Los permisos ya existentes gobiernan Operativo; el backend comprueba rol ADMIN activo para overrides. El cliente no fija reviewed_by, logística ni estado de verificación.

Las claves, cuerpo e identidad/generación se conservan frente a respuestas inciertas. Cambiar datos exige nueva quote/consentimiento; cambiar sesión descarta respuestas tardías. Los flujos financieros conservan saldo por moneda, propinas, fencing, auditoría y pago → finalización explícita → liberación. No se libera mesa por la mera captura de pago.

## Teléfono y límites de integración

PhoneVerificationProvider separa transporte y acreditación real. OTP de 6 dígitos, TTL 5 minutos, máximo 5 intentos, 5 desafíos/hora por usuario y 60 segundos entre desafíos. HMAC impide guardar el código en claro; número cambiado invalida verificación/desafíos mediante trigger. El adapter de pruebas declara provesRealPossession=false. El provider normal falla cerrado al no existir transporte autorizado; delivery queda bloqueado. La integración real requiere canal/proveedor y material criptográfico estables autorizados, fuera de esta entrega. No se inspeccionaron secretos ni se inventó SMS.

El móvil exporta Android, pero no hay APK/dispositivo ni transporte de impresión nativo instalado. Permite consultar/compartir HTML y abrir la vista Web si existe un origen autorizado; no inventa host ni tokens en URL. Verificación visual de navegador y Android pendiente.

Las sustituciones de reservas se separan por fase: antes de la conversión, propuesta sobre la línea snapshot, consentimiento owned del cliente y aplicación operativa con versión de reserva, precio/moneda/stock revalidados; no genera pedido, cocina ni pagos. Después de conversión, la propuesta usa el pedido real y comparte revisión PREPARING/READY y guardas financieras. GET client/substitutions y operational/substitutions incluyen ambos orígenes. reservationId identifica la reserva; orderRequestId es null cuando no procede de solicitud pickup/delivery. preorder=true distingue la decisión sobre intención sin pedido.

POST operational/reservations/id/preorder-substitutions reutiliza la forma Proposal (orderItemId identifica la línea snapshot y expectedOrderVersion la versión de reserva); POST client/preorder-substitutions/id/decision conserva Consent; POST operational/preorder-substitutions/id/decision conserva Decision. POST operational/reservations/id/order-substitutions propone sobre el pedido convertido. Web Cliente, móvil Cliente y Operativo consumen estas variantes; un cambio posterior o conversión concurrente invalida la aplicación de la propuesta previa.
