# Decisiones y datos pendientes

Actualización: 2026-10-07. Ver [decisiones confirmadas](TECH_DECISIONS.md) y [alcance Web Cliente](CLIENT_SCOPE_DECISIONS.md). Esta lista contiene únicamente decisiones todavía abiertas; los insumos ya proporcionados por coordinación no se vuelven a solicitar.

| Decisión/insumo | Quién decide | Trabajo que depende directamente | Trabajo que puede avanzar ahora |
|---|---|---|---|
| Exposición pública directa o túnel, según CGNAT/IP | Infraestructura/propietario | Publicación WAN | LAN, Nginx y configuración parametrizada |
| Dominio propio y DNS | Propietario | Hostname final, certificados y correo | Rutas y DNS parametrizados |
| Email productivo/relay | Propietario | Entrega real, SPF/DKIM/DMARC | `EmailProvider`, outbox, Mailpit/mock |
| Proveedor de pagos online | Propietario/finanzas | Cobro real, 3DS y conciliación | `PaymentGateway` y adapter mock |
| Certificador FEL | Propietario/contabilidad | DTE real certificado | `FelGateway`, drafts, outbox y mock |
| Apple OAuth | Propietario | Login Apple | Arquitectura multi-provider |
| Modelo multimodal y GPU | Equipo/propietario tras benchmark | Runtime productivo IA | Gateway, mock, tools y fallback |
| Realtime: SSE/WebSocket/polling | Equipo tras medir casos | Transporte definitivo | Contrato de eventos y snapshot de reconexión |
| Recetario real completo | Coordinación | BOM, costos, cantidades y consumo automático | Versionado y catálogo vendible con disponibilidad manual |
| Zonas/cobertura, tarifa, mínimo, courier y pagos de delivery | Propietario/operaciones | Aceptación de delivery con cobertura y total correctos | UI/solicitud pendiente y reglas configurables; ver `CLIENT-DELIVERY-01` |
| Cancelación tras confirmar reserva: plazo/cargos | Propietario/operaciones | Aplicar política al cliente | Cancelación de solicitud `REQUESTED` y revisión autorizada |
| Roles de agotado y sustitución consentida | Propietario/operaciones | Permisos y recorrido de cambio/rechazo | Revalidar disponibilidad; nunca sustituir sin consentimiento |
| Pickup para siguiente día abierto | Propietario/operaciones | Decidir affordance del formulario | Calendario y ETA deben impedir horarios inválidos |
| Ventana/cargos de cancelación de pedido aceptado | Propietario/operaciones | Política visible y cargos | Solicitud revisada por Operativo, sin cargo automático |
| Guion y build/API para demostración del viernes | PM/SM | Afirmaciones de integración por recorrido | Ensayar y etiquetar fixtures/mocks |
| JDBC o Spring Data JPA para módulos nuevos | Equipo backend/ingeniería | Convención de persistencia y bloqueo | Mantener los slices ya implementados hasta decisión técnica |
| Umbrales de carga/capacidad y excepciones de mesa | Propietario/operaciones | Automatizar aceptación/carga | Configuración y revisión humana conservadora |
| Guest checkout/campos/seguimiento anónimo | Propietario | Pedido sin cuenta y autorización por token | Menú/carrito anónimo; no exponer IDs internos |
| VLAN y equipo de red disponible | Infra/propietario | Topología final y aislamiento de invitados | Documentar opciones e inventariar equipo |
| Regla de aceptación de comprobantes | Finanzas/operación | Verificación económica | OCR sólo extrae; estado `NEEDS_REVIEW` |
| Apple distribution / publicación móvil | Propietario/equipo | Distribución iOS productiva | Android preview y web responsive |

## Fuera del alcance actual

La integración de cámaras está `FUTURE / DEFERRED_CAMERA_INTEGRATION`: no es blocker y no debe aparecer como tarea, pantalla o mock P0/P1. El menú real ya fue entregado; no volver a pedirlo. Las cantidades y BOM completas sí siguen pendientes. Ninguna integración mock se etiqueta como productiva. Los detalles fiscales requieren validar al certificador y asesor contable antes de declarar cumplimiento.
