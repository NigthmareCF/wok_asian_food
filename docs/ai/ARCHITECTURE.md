# Arquitectura de IA, voz y visión

Estado: diseño de integración y criterios de aceptación, 2026-09-25. Ningún modelo/GPU productivo está declarado operativo.

## Límite de confianza

Web, app y Meta hablan con el backend WOK. `AiGateway` clasifica dominio/intención/sensibilidad y usa reglas o templates para preguntas simples. Cuando hace falta inferencia, llama a un runtime en proceso/contenedor aislado mediante API interna autenticada. El runtime no recibe conexión, credenciales ni acceso de red a PostgreSQL; no ejecuta SQL ni herramientas arbitrarias. Todo tool request vuelve a `AiToolBroker` del backend para validación de DTO, identidad/ownership, permiso, timeout, límite, auditoría y respuesta mínima.

Tools iniciales: horarios, estado de servicio, menú y disponibilidad, estimación ETA, evaluación de reserva, estado de pedido propio, drafts de pedido/reserva, solicitud de humano y factura propia autorizada. Un cliente A nunca obtiene pedido/factura B. Las acciones financieras o de seguridad requieren caso de uso y aprobación humana; IA no reembolsa, cancela DTE certificado, cambia precios/roles/stock ni verifica vouchers por sí sola.

## Alcance y fallback

El asistente responde sólo sobre WOK: menú, disponibilidad, horarios, ubicación, reservas, pedidos, pickup/delivery, pagos y facturación propia, promociones configuradas, soporte y políticas. Para programación, política, tareas escolares o temas ajenos usa respuesta breve: «Puedo ayudarte con pedidos, menú, reservas y servicios de WOK Asian Food». El texto de usuario, adjuntos y resultados externos son datos, nunca instrucciones privilegiadas. Ante baja confianza, queja, pago, petición humana o fallo repetido entrega resumen y contexto mínimo a personal; humano acepta, edita o rechaza. Sin runtime, quedan templates y atención humana; `AI DEGRADED` no afecta `CORE READY`.

Perfiles: `ai-disabled` (template/handoff), `ai-mock` (normal, timeout, unavailable, malformed, tool request y handoff) y `ai-local` (runtime privado con GPU). La cola limita concurrencia, da prioridad a chat simple, aplica timeout/backpressure y evita que OCR masivo bloquee conversación. Internet del runtime se restringe si no es necesario.

## Visión, voz y archivos

Upload valida MIME real, tamaño, extensión, checksum y política de retención; storage usa clave opaca y estado de scan. Voucher: imagen → OCR/extracción → monto/fecha/referencia/banco → comparación por PaymentService con orden, esperado, cliente y duplicados → `NEEDS_REVIEW` o decisión humana/financiera. `RECEIVED`, `EXTRACTED`, `MATCHED`, `NEEDS_REVIEW`, `VERIFIED` y `REJECTED` son estados de evidencia, no de captura bancaria. Visión nunca emite `VERIFIED` sólo por apariencia. Audio validado pasa por `SpeechToTextProvider`, transcripción y pipeline de conversación; evaluar STT local cuando sea viable.

## Evaluación de modelo y hardware

Qwen3-VL-8B-Instruct es **candidato**, no elección final. La comparación inicial se fija contra Gemma 3 12B IT, ambos con entrada de imagen y texto según sus fichas oficiales: [Qwen](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct) y [Google](https://ai.google.dev/gemma/docs/core/model_card_3). Ninguna cifra de calidad o rendimiento WOK se considera conocida antes de ejecutar el benchmark.

| Candidato            | Motivo de inclusión                                    | Hipótesis por verificar en WOK                                  | Medición pendiente                                               |
| -------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Qwen3-VL-8B-Instruct | Candidato inicial solicitado, tamaño nominal 8B        | Español, OCR y salida estructurada con GPU de rango recomendado | VRAM/RAM, p50/p95, tokens/s, imagen/OCR, tool calls, alucinación |
| Gemma 3 12B IT       | Alternativa oficial multimodal de mayor tamaño nominal | Diferencia de precisión frente a costo de memoria y latencia    | Misma batería, mismo hardware y cuantización comparable          |

Medir el mismo conjunto WOK en español: atención, OCR de vouchers/documentos, tool calling estructurado, alucinación, prompt injection, latencia p50/p95, tokens/s, latencia de imagen, VRAM/RAM pico y concurrencia (1/2/5 solicitudes). Registrar cuantización y runtime para cada medición; comparar vLLM, llama.cpp, Transformers y Ollama según soporte multimodal real, batching, memoria y operación. No publicar cifras inventadas. El runtime se elige sólo después de comprobar soporte de imagen para cada modelo/versión concreta.

Referencias de dimensionamiento previas al benchmark: mínimo práctico 12–16 GB VRAM; recomendado 16–24 GB VRAM y 64 GB RAM; entrenamiento LoRA local 24–32 GB VRAM y 64–128 GB RAM. La recomendación final de GPU/CPU/RAM depende de mediciones y costo total. No descargar modelos en teléfonos ni depender de iGPU para producción.

## Feedback y entrenamiento

Guardar feedback bajo retención y minimización: respuesta IA, respuesta humana, resultado, rating, corrección y categoría. Sólo marcar `TRAINING_CANDIDATE`. Entrenar exige dataset revisado/versionado, job autorizado, evaluación, revisión humana, aprobación, despliegue y rollback con modelo base, configuración, métricas, adapter, actor y fecha. Nunca actualizar pesos automáticamente a partir de conversaciones.

## Pruebas exigidas

Cubrir petición ajena al dominio, inyección de prompt, tool no autorizado, pedido de otro cliente, SQL arbitrario, DTO malformado, producto alucinado, adjunto malicioso, runtime caído y voucher equivocado/duplicado/editado/ilegible. La expectativa es rechazo/fallback seguro del backend, nunca obediencia a la salida del modelo.
