# Decisiones y datos pendientes

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

La evaluación de impuestos/propinas y formatos FEL requiere verificación fiscal con el certificador y asesor contable antes de afirmar cumplimiento productivo. Ninguna integración mock se etiquetará como real.
