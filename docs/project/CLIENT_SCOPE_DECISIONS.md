# Web Cliente — alcance y decisiones operativas

Fecha de consolidación: 2026-10-07. Responde las preguntas de cierre de Web Cliente y separa decisiones de producto, comportamiento observado y pendientes. Tiene prioridad sobre planes de corte académico anteriores; no convierte un mock o una ruta de UI en integración verificada.

## Respuestas de alcance

| Tema | Decisión confirmada | Estado observado / límite | Falta acordar |
|---|---|---|---|
| Delivery | Sí pertenece al alcance integral Cliente. La solicitud incluye productos, dirección, referencia, teléfono, hora, forma de pago y datos de facturación opcionales. El horario de delivery externo tiene como referencia aproximada las 21:00 y se configura por servicio/calendario. | La API observada crea `PENDING_REVIEW`; personal debe confirmar cobertura, disponibilidad y horario. Recibir solicitud no crea pedido aceptado ni acredita pago. | Zonas/cobertura, tarifa, pedido mínimo, responsable del reparto (propio/tercero), pagos por escenario y política contra entrega. Separar consumo, tarifa de entrega y propina. |
| Pickup | Sí pertenece al alcance. La hora solicitada debe ser posterior al ETA/tiempo de preparación y caber en el horario efectivo. | No hay mínimo ni máximo comercial de horas confirmado. Las 3 h mínimas aplican a reservas y solicitudes digitales de mesa, no a pickup. | Confirmar si la UI ofrece programar para el siguiente día abierto; sólo puede ofrecerlo si calendario y ETA lo permiten. |
| Reservas | Sí pertenecen a la demostración integral. Reserva formal y solicitud digital de mesa requieren ≥3 h. La tolerancia ordinaria es 20 min. | Duración configurable/estimada: 1 persona 75–105 min; 2, 90–120; 3–4, 105–150; 5–8, 120–180; 9–12, 150–210; 13+ cálculo especial. El código observado deriva a revisión humana porque falta capacidad en vivo; la regla de negocio no exige aprobación humana permanente para todas. El cliente cancela directamente mientras `REQUESTED`. | Límite de cancelación una vez confirmada y posibles penalizaciones. Grupos grandes/horarios complejos pueden requerir aprobación humana según evaluación. |
| Platillo agotado / sustitución | Backend revalida disponibilidad al cotizar y revisar/aceptar. Mientras falten recetas/stock confiables, disponibilidad puede administrarse manualmente. No sustituir sin consentimiento del cliente. | El código observado rechaza productos que dejaron de estar publicados; no hay sustitución automática implementada. | Acordar qué rol (Operativo/Admin/ambos) marca agotado y el recorrido para ofrecer cambio consentido o rechazar/recrear solicitud. |
| Cancelación de pedidos | Directa para solicitudes pickup/delivery sólo en `PENDING_REVIEW`. Tras aceptar, cliente envía una solicitud de cancelación con motivo y Operativo la aprueba o rechaza. Cliente no cambia estados autoritativos. | El código observado modela `CANCEL_ORDER` con revisión. Si ya inició preparación, la cancelación operativa conserva auditoría/consumo/merma; no restaura inventario consumido por una reversión económica. | Plazo máximo y posibles cargos/penalizaciones. Excepciones después de aceptar las decide personal autorizado. |

## Recorridos propuestos para el viernes

Esta lista es una propuesta para acordar el guion, no una afirmación de integración end-to-end. Las vistas que el equipo ya revisó pueden mostrarse como flujo de UI; se debe decir si sus datos son fixture/locales o API persistida.

### Obligatorios

1. Consultar menú y disponibilidad.
2. Solicitar pickup con hora futura; validar calendario/ETA; dejar pendiente y aceptar/rechazar desde Operativo.
3. Solicitar delivery con dirección/referencia/teléfono; dejar pendiente para validar cobertura/horario. Si no hay zonas/tarifa configuradas, etiquetar los datos como demo y no insinuar cobertura real.
4. Solicitar reserva con ≥3 h; revisar/decidir desde Operativo; comunicar tolerancia de 20 min y duración estimada.
5. Mostrar Mensajes y Perfil Cliente, y el flujo Operativo ya revisado, aclarando si están conectados a API.
6. Mostrar cancelación de solicitud pendiente y solicitud de cancelación después de aceptación, si esos endpoints están disponibles en el build presentado.

### No declarar productivo

- Pasarela bancaria, 3DS, reembolsos o conciliación externa.
- Emisión/certificación FEL real.
- Zonas, tarifa, mínimo, courier o GPS/ETA de transporte sin configuración/proveedor.
- Sustitución automática, cobros por cancelación o penalizaciones.
- Aceptación automática de una solicitud por el solo hecho de llegar al sistema.

Etiquetar todo fixture/mock como demostrativo. Que una vista funcione no prueba persistencia, autorización server-side o integración entre canales.

## Reglas a conservar

- Horario de referencia: martes–domingo 14:00–22:00; cocina aproximadamente 21:30; último ingreso normal a mesa 21:15; delivery externo aproximadamente 21:00. Son valores configurables con excepciones auditadas.
- Plataforma 24/7 no implica aceptación 24/7 de pickup, delivery o mesa. Reservas futuras se evalúan con calendario y capacidad.
- Una solicitud no es un pedido aceptado. Al decidirla se revalidan servicio, horario, producto, capacidad, precio y ETA.
- Transferencia/comprobante es evidencia pendiente; imagen u OCR no confirma pago.

## Evidencia de implementación observada

En la rama/commit backend inspeccionado durante la revisión: pickup/delivery crean solicitudes `PENDING_REVIEW`, validan ETA y calendario, y permiten cancelación directa sólo en ese estado. Tras aceptación, cancelación se solicita con motivo y decide Operativo. Reserva valida 3 h y cancelación directa cubre sólo `REQUESTED`. La capacidad de mesa en vivo sigue desconectada, por lo que pide revisión humana. Estos datos describen el código inspeccionado, no garantizan que esté integrado/desplegado en todas las ramas: confirmar SHA al preparar la demo.

## Decisiones pendientes

- `CLIENT-DELIVERY-01`: zonas/cobertura, tarifa, mínimo, responsable de reparto, pagos y contra entrega.
- `CLIENT-PICKUP-01`: ofrecer pickup el siguiente día abierto como comportamiento de UX, siempre sujeto a calendario/ETA.
- `CLIENT-RESERVATION-01`: ventana de cancelación tras confirmación y cargos, si aplica.
- `CLIENT-AVAILABILITY-01`: roles que marcan agotado y recorrido para sustitución consentida.
- `CLIENT-CANCELLATION-01`: ventana/cargos de cancelación después de aceptación.
- `CLIENT-DEMO-01`: recorrido final del viernes y build/API realmente disponible.
