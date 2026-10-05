# Arquitectura de IA de WOK

Estado: base aislada con proveedor mock. No hay modelo, GPU ni integración de inferencia productiva configurados. La IA es opcional y no participa en transacciones del core.

## Límites y flujo

Los canales Cliente pasan por la API WOK. La API aplica sesión, ownership y reglas de negocio antes de devolver datos; el runtime de inferencia futuro será un adapter privado sin credenciales de PostgreSQL ni acceso al filesystem empresarial. No se permite SQL generado por el modelo. Cualquier acción de escritura seguirá siendo un caso de uso normal del backend con autorización humana cuando corresponda.

En esta primera base, `AiGateway` valida longitud y alcance temático, resuelve consultas simples con reglas deterministas y sólo después permite usar `AiProvider`. `AiToolBroker` ofrece una lista cerrada de consultas públicas: `getOpeningHours` y `getCurrentServiceStatus`. Sus salidas son DTO tipados sin PII ni datos de cuenta. Cada invocación exitosa deja un evento `AI_TOOL_EXECUTED` con el nombre de la herramienta, etiqueta `AI_SERVICE` y un identificador de entidad aleatorio.

El contrato `POST /internal/ai/chat` y `POST /internal/ai/tools` exige `X-WOK-AI-TOKEN`, configurado mediante `WOK_AI_SERVICE_TOKEN` y de al menos 32 caracteres. Rutas `/internal` no se enrutan en Nginx y el API no publica un puerto del host en Compose; sólo servicios en la red Docker interna pueden llamarlas. El secreto no debe llegar al frontend, app, logs ni al runtime como configuración de base de datos. Si el secreto falta, las rutas fallan cerradas con 503; un token incorrecto recibe 401 y una herramienta fuera de allowlist recibe 403.

## Modo y fallback

`WOK_AI_MODE` acepta `disabled` (por defecto) y `mock`. En `disabled`, la respuesta pasa a atención humana/template y no llama al proveedor. `MockAiProvider` permite simular respuesta, timeout, indisponibilidad y handoff; nunca confirma pagos, reservas ni pedidos. La guarda de alcance actual es una regla léxica inicial, no un clasificador semántico robusto. No considerar terminada la defensa ante prompt injection hasta añadir evaluación adversarial y un clasificador/guard más amplio.

## Producción pendiente

- Diseñar credencial service-to-service rotatoria o mTLS cuando el runtime privado se despliegue en otro nodo.
- Añadir límites de concurrencia, cola/prioridades, timeouts y métricas por tipo de inferencia.
- Implementar handoff persistido a conversación y políticas de retención de mensajes/adjuntos.
- Evaluar modelos multimodales contemporáneos con casos WOK de español, OCR, herramientas, latencia y VRAM; elegir runtime/hardware después de medir.
- Incorporar visión como extracción de indicios únicamente. Una imagen nunca verifica un pago; PaymentService y revisión financiera conservan esa autoridad.
- Crear dataset versionado y pipeline de entrenamiento con revisión/aprobación humana. No actualizar pesos automáticamente desde conversaciones.

Las pruebas `AiGatewayTest`, `InternalAiControllerTest` y `AiToolBrokerIntegrationTest` cubren alcance/inyección básica, fallback, token service-to-service, allowlist, consultas tipadas y auditoría sobre PostgreSQL/Flyway. Esto valida el esqueleto mock y no certifica una IA productiva.
