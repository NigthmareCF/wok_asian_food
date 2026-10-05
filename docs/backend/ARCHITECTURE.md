# Arquitectura del core WOK

Estado: arquitectura objetivo, 2026-09-25. Véase [GAP_ANALYSIS.md](../project/GAP_ANALYSIS.md) para distinguir implementación de diseño.

## Límite y módulos

Un monolito modular Spring Boot es el único escritor transaccional de PostgreSQL. Web Cliente, Operativo, Administrativo y app Cliente consumen `/api/v1`; ningún frontend calcula el total definitivo, disponibilidad, permiso, impuesto o estado financiero. Los paquetes de dominio son `identity`, `customers`, `staff`, `tables`, `reservations`, `catalog`, `recipes`, `inventory`, `purchasing`, `production`, `availability`, `service`, `orders`, `kitchen`, `delivery`, `messaging`, `billing`, `payments`, `cash`, `invoicing`, `notifications`, `email`, `reports`, `settings`, `audit`, `integration`, `ai` y `vision`. Crear código en cada paquete sólo al implementar un caso de uso, sin clases vacías.

Los casos de uso coordinan transacciones cortas, repositorios y puertos. Los adapters externos (Meta, correo, banco, FEL, STT, runtime IA) no participan en la transacción SQL: se guarda estado local y outbox, se confirma y después trabaja un worker idempotente. `UUID`, `BigDecimal`, `Instant`, versionado, constraints e idempotencia son convenciones de dominio. Logs y DTO nunca contienen secretos, PAN/CVV, refresh ni datos de otro cliente.

## Capacidad y reservaciones

`OperationalCapacityService` recibe modalidad, instante, comensales, preorden, productos/complejidad, personal, mesas, carga, producción, reservas, pedidos, estados de servicio y overrides. Devuelve `ACCEPT`, `ACCEPT_WITH_CONDITIONS`, `SUGGEST_OTHER_TIME`, `REQUIRES_HUMAN_APPROVAL` o `REJECT`, con `reasonCodes`, ETA, alternativas, condiciones y mensaje público. La evaluación no reemplaza la transacción de confirmación: ésta revalida bajo bloqueo/versionado antes de reservar recursos.

Reserva formal y solicitud digital de mesa exigen 3 h de anticipación. El umbral es condición necesaria, no aceptación automática. La tolerancia normal es 20 min. El horario base es 14:00–22:00, cocina ~21:30, último ingreso normal ~21:15 y delivery externo ~21:00, todos configurables. Grupos grandes cerca del cierre requieren evaluación humana. El cierre se usa internamente, sin mensajes de expulsión al cliente.

`OccupancyEstimator` usa rangos iniciales configurables: 1 persona 75–105 min; 2, 90–120; 3–4, 105–150; 5–8, 120–180; 9–12, 150–210; 13+, cálculo especial. No multiplica el baseline por persona. Guarda estimado y duración real para calibración.

## Flujos y invariantes

- **Pedido:** borrador/carrito no reserva inventario. La aceptación revalida precio, opciones, stock, horario, capacidad y ETA en backend. Pedido aceptado/comandado no lo modifica directamente el cliente. Cambios conservan original, actor, motivo, revisión de comanda, recursos, ETA e impacto financiero; material consumido no retorna a stock por anulación económica.
- **Servicio:** `local`, `reservations`, `dine-in-online`, `pickup`, `delivery`, `online-orders`, `messaging`, `online-payments`, `production` tienen `ENABLED`, `MANUAL_APPROVAL`, `PAUSED` o `DISABLED` independientes. Override registra actor, motivo y vencimiento. En carga alta, mesas/presencial tienen prioridad sobre remotos.
- **Pago y caja:** una cuenta puede recibir pagos mixtos. Propina es separada de venta; comisión 3% y sugerencia 7% son configurables, no políticas hardcodeadas. `opening float` no es venta. `PaymentGateway` mantiene el puerto externo separado del cobro operativo; el mock idempotente se conecta al intento de pago delivery y Cliente puede recuperar el estado más reciente con ownership validado, sin crear otro intento. Sólo devuelve `PENDING` y no confirma captura. Aún no hay checkout ni proveedor productivo. Pasarela online sólo recibe token/intent; WOK no recibe PAN/CVV. El futuro adapter debe salir por outbox, con webhook firmado, idempotencia y conciliación para estados `UNKNOWN`.
- **FEL:** el pool facturable de una atención limita la suma de drafts; propina fuera del pool sujeto a validación fiscal. Cada DTE se certifica independientemente mediante el puerto fiscal `FiscalProvider` y un worker/outbox; el mock no representa certificación SAT. XML original/certificado, PDF, acuse y hashes requieren completar almacenamiento de artefactos. `UNKNOWN` exige consulta/conciliación.
- **Mensajería:** webhook firmado, raw event, dedup, normalización, identidad externa verificada, conversación y mensaje. Canales separados; `SpeechToTextProvider` procesa audio validado. Enlaces externos usan token opaco `/go/{token}`.
- **IA:** `AiGateway` aplica una guarda inicial de alcance, resuelve horarios/estado de servicios con reglas y deja inference detrás de `AiProvider`. `AiToolBroker` expone sólo DTO públicos permitidos, sin SQL del modelo, y audita cada uso. `/internal/ai/**` requiere token de servicio, no se enruta por Nginx y queda apagado por defecto. Falla de IA produce template/handoff, no caída del core. OCR de comprobante nunca confirma pago. Estado y pendientes: [arquitectura de IA](../ai/ARCHITECTURE.md).

## API y seguridad

Separar rutas públicas, guest, client, operational y admin. Errores estables con `requestId`, validación de DTO, 401/403/409/422/503 diferenciados. OpenAPI documenta operación y permiso, no expone entidades JPA. Los endpoints internos de IA no pasan por el ingress público. Ownership se comprueba en servidor incluso si el shell oculta la acción.

Los teléfonos Cliente/delivery de Guatemala se validan en los DTO de perfil, direcciones guardadas y solicitudes delivery: ocho dígitos agrupados como `0000 0000`, con prefijo `+502` opcional para compatibilidad. La app formatea antes de enviar y el servidor repite la validación; las constraints SQL históricas siguen permitiendo valores anteriores, así que no se debe tratar esa validación del API como limpieza automática de datos ya almacenados.

WOK es emisor de sesión: access JWT firmado de 10–15 min configurable; refresh opaco aleatorio y hash persistido por familia/sesión, rotado en cada uso con detección de reuse. `iss` debe ser una URI válida; `WOK_AUTH_ISSUER` configura el URL canónico por ambiente y el valor `.invalid` sólo permite desarrollo local. Registro público sólo CLIENT y `PENDING_VERIFICATION` hasta challenge de un uso. Google OIDC usa `sub`, requiere nonce server-issued de un solo uso y nunca asigna roles WOK; correos existentes no se vinculan automáticamente. Staff crítico puede acceder con método local durante corte WAN.

## Operación local y salud

Nginx recibe 80/443, Spring y PostgreSQL quedan privados. Un único hostname API se resuelve a IP privada en LAN y a ingreso público fuera. Sin WAN, core local sigue con mesas, pedidos, KDS, caja, inventario y administración. Solicitudes que no llegaron no se transforman en pedidos; al reconectar se revalidan. `CORE READY` y salud de Meta/FEL/pagos/email/IA se reportan por separado. Servidor, router, switch y AP principal necesitan UPS y backup probado.
