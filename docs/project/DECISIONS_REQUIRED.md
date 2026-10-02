# Decisiones y datos pendientes

Actualización: 2026-09-28. Fuente vigente para lo que continúa abierto; ver [decisiones confirmadas](TECH_DECISIONS.md). Las decisiones del mega prompt (core on-premise, web/app sobre API común, Expo Cliente, auth WOK, mínimo 3 h, servicio/capacidad independientes y outbox/adapters) se tratan como confirmadas, no se repiten como pregunta.

Sólo se listan entradas que no pueden inferirse ni inventarse. No bloquean la implementación de contratos, puertos, mocks y pruebas locales.

| Decisión/insumo                                    | Quién decide                | Trabajo que depende directamente                        | Trabajo que puede avanzar ahora                |
| -------------------------------------------------- | --------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Exposición pública directa o túnel, según CGNAT/IP | Infraestructura/propietario | Publicación WAN                                         | LAN, Nginx, TLS local y ensayo de corte        |
| Dominio propio y DNS                               | Propietario                 | Hostname final, certificados y correo                   | Rutas y configuración parametrizada            |
| Email productivo/relay                             | Propietario                 | Entrega real y SPF/DKIM/DMARC                           | `EmailProvider`, outbox, Mailpit/mock          |
| Proveedor de pagos online                          | Propietario/finanzas        | Cobro real, 3DS y conciliación externa                  | `PaymentGateway` y adapter mock                |
| Certificador FEL                                   | Propietario/contabilidad    | DTE real certificado                                    | `FelGateway`, drafts, outbox y mock            |
| Apple OAuth                                        | Propietario                 | Login Apple                                             | Arquitectura multi-provider                    |
| Modelo multimodal final                            | Equipo tras benchmark       | Runtime productivo IA                                   | Gateway, mock, tools y fallback                |
| GPU final                                          | Propietario tras benchmark  | Capacidad de inferencia local                           | Aislamiento y perfiles sin GPU                 |
| Cámaras y política de captación                    | Propietario                 | Visión de cámaras                                       | Flujo de voucher con datos de prueba           |
| Realtime: SSE/WebSocket/polling                    | Equipo tras medir casos     | Transporte definitivo                                   | Contrato de eventos y recuperación de snapshot |
| Menú real                                          | Coordinación                | Seeds de categorías, productos, precios y modificadores | Esquema y endpoints vacíos coherentes          |
| Recetario real                                     | Coordinación                | BOM, costos y cantidades                                | Versioning y validación sin datos inventados   |
| Políticas de penalización/cancelación              | Propietario                 | Cargos y sanciones                                      | Estados y auditoría sin cobro automático       |
| JDBC o Spring Data JPA para nuevos módulos | Equipo backend/ingeniero | Ampliar persistencia y controlar versiones/bloqueos | Seguir integrando slices JDBC existentes sin ampliar patrón |
| Alcance numérico y fecha objetivo del 90 % | PM + equipo | Estimar secuencia/calendario y medir cobertura end-to-end | Integrar y verificar branches; no declarar avance porcentual |
| Frecuencia/umbral de límites operativos (thresholds) | Propietario/operaciones | Automatizar capacidad, carga, aviso y revisión humana | Configuración por datos y decisión conservadora |
| Política de permanencia y excepciones de mesa | Propietario/operaciones | Límite por tamaño, reservas, comunicación y ajustes | `OccupancyEstimator` configurable y captura de esperado/real |
| Guest checkout, campos mínimos y seguimiento anónimo | Propietario | Pedido/reserva sin cuenta y protección de acceso | Anónimo menú/carrito; modelar token limitado sin exponer IDs |
| Separación de VLAN y equipo/red física disponible | Infra/propietario | Topología final, guest isolation y endpoints LAN | Diagramar opciones; inventariar router/switch/AP existentes |
| Regla de aceptación de voucher y revisión humana | Finanzas/operación | Monto, referencia, banco, duplicados y autoridad de verificación | OCR sólo extrae; estado `NEEDS_REVIEW` |
| Alcance de Desktop | Propietario | Framework/cliente escritorio si todavía se requiere | Priorizar Web/Cliente móvil indicados en objetivo vigente |

La evaluación de impuestos/propinas y formatos FEL requiere verificación fiscal con el certificador y asesor contable antes de afirmar cumplimiento productivo. Ninguna integración mock se etiquetará como real.
