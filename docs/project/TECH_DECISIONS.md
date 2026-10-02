# Decisiones técnicas vigentes

Actualizado el 2026-09-28 a partir de la instrucción maestra del propietario. Una decisión de arquitectura no demuestra implementación. Ver [GAP_ANALYSIS.md](GAP_ANALYSIS.md) y [INTEGRAL_DELIVERY_PLAN.md](INTEGRAL_DELIVERY_PLAN.md) para estado y trabajo necesario.

| ID | Decisión | Estado | Consecuencia / evidencia |
|---|---|---|---|
| TD-01 | Core en monolito modular Java/Spring y PostgreSQL | CONFIRMED | No dividir en microservicios por defecto. Backend actual se encuentra en ramas especializadas, usa JDBC; definir JDBC/JPA antes de extenderlo. |
| TD-02 | Servidor principal on-premise; la operación interna sigue con WAN caída | CONFIRMED | Nginx, app, DB y storage local; el ensayo físico LAN/WAN todavía no se ha demostrado desde este checkout. |
| TD-03 | Web y app consumen una API común `/api/v1`; Nginx como ingreso | CONFIRMED | Spring y PostgreSQL sin exposición pública directa. DNS split-horizon propuesto para mismo host LAN/WAN. |
| TD-04 | WOK es la autoridad de usuarios, sesiones, roles y permisos | CONFIRMED | Google OIDC es proveedor de identidad solamente; no concede roles WOK ni fusiona cuentas por coincidencia de correo. |
| TD-05 | Expo/React Native, TypeScript, aplicación móvil exclusiva de Cliente | CONFIRMED | `feature/mobile-shell` contiene base parcial; app no está integrada en `feature/frontend-admin`. |
| TD-06 | Reservación formal y solicitud digital de mesa requieren mínimo 3 h; 20 min tolerancia normal | CONFIRMED | Cumplir 3 h no supone aceptación; evaluar capacidad y reservar sólo al confirmar conforme al flujo aprobado. |
| TD-07 | Las capacidades de servicio son independientes y admiten overrides auditados | CONFIRMED | No sustituir por un booleano global. Vistas de Admin/Cliente conectadas sólo en ramas distintas. |
| TD-08 | Spring/Postgres son la autoridad de importes, disponibilidad, ETA, permisos y transacciones | CONFIRMED | Web/app nunca son fuente de precio, descuento, stock, totales, impuestos o cobro. |
| TD-09 | Adaptadores para email, pago, FEL, Meta, voz, storage y proveedores IA | CONFIRMED | Mock identificado hasta integrar/validar proveedor; ningún mock equivale a producción. |
| TD-10 | Runtime IA aislado; sin conexión ni credenciales directas PostgreSQL | CONFIRMED | Backend valida tools/ownership y acciones. Gateway/broker mock está en branch, runtime GPU no. |
| TD-11 | Outbox PostgreSQL para efectos externos iniciales | CONFIRMED | Persistir y confirmar dentro de transacción; workers reintentan fuera y concilian resultados inciertos. |
| TD-12 | `database/design/model.json` y generador son fuente candidata del ERD/SQL; Flyway es esquema instalado | CONFIRMED | No editar artefactos generados como fuente ni reescribir migraciones aplicadas; reconciliar objetivo 128 tablas vs V1–V6. |
| TD-13 | Estados WAN: core local continúa; externo puede quedar degradado | CONFIRMED | Solicitudes no recibidas no se convierten en pedidos; al reconectar revalidar antes de aceptar. |
| TD-14 | Permanencia mesa modelada por `OccupancyEstimator` configurable y observaciones real/estimada | CONFIRMED | Rangos iniciales del prompt son hipótesis de configuración/calibración; no multiplicar linealmente por comensales. |
| TD-15 | Horizonte de producto es el alcance funcional completo y meta de planeación ≥90 % | CONFIRMED | El 90 % requiere matriz por HU y evidencia end-to-end; los cortes MVP anteriores están SUPERSEDED como definición total. No hay fecha/capacidad nueva aprobada. |
| TD-16 | Facturación incluye dominio FEL propio, drafts/pool, certificación independiente y reconciliación | CONFIRMED | Proveedor, reglas fiscales y modalidad productiva permanecen decisiones externas. Refund ≠ nota de crédito. |
| TD-17 | Realtime puede elegirse entre SSE/WebSocket/polling según requisitos y ensayo | OPEN | Definir snapshot/reconexión/latencia de LAN y pruebas antes de fijar tecnología. |
| TD-18 | Proveedor/direct ingress o tunnel, dominio, correo, pasarela, certificador, modelo/GPU, cámaras | OPEN | Implementar contratos/adapters/mocks mientras se acuerdan insumos reales. |
| TD-19 | JDBC frente a Spring Data JPA para módulos nuevos | OPEN | Los controllers/services observados usan JDBC; el mega prompt lista JPA candidato. Comparar coste de integración, locking y `row_version` antes de adoptar. |
| TD-20 | Apple Login | LATER / DECISION_REQUIRED | Mantener identidad multi-provider; no implementar como requisito de este corte. |

## Decisiones anteriores sustituidas

| Decisión anterior | Estado | Reemplazo |
|---|---|---|
| Plan de pickup de cinco/seis semanas como alcance completo | SUPERSEDED | Producto integral por etapas y meta verificable ≥90 %; la ventana/calendario requiere confirmación del equipo. |
| App Cliente limitada a pickup/seguimiento | SUPERSEDED | App Cliente completa alineada con todos sus casos de uso. |
| Expo sin decidir | SUPERSEDED | Expo/React Native/TypeScript confirmado; implementación observada aún parcial y aislada en otra rama. |
| Nube como única fuente del core | SUPERSEDED | Servidor local del restaurante y degradación WAN externa. |
| ERD/DDL candidato como esquema aprobado | SUPERSEDED | Modelo objetivo revisable; migraciones Flyway son la secuencia ejecutable, con cobertura inicial parcial. |
| Estado operativo global único | SUPERSEDED | Capacidad y override independiente por servicio/canal. |
| Cumplir horario basta para aceptar reserva | SUPERSEDED | Mínimo 3 horas más evaluación de capacidad y decisión aplicable. |
| Google identidad = permisos internos | SUPERSEDED | Google verifica proveedor; WOK asigna identidad/roles/permisos internos tras linking validado. |

No se documenta el prompt completo aquí; se registra cada decisión necesaria en forma resumida para conservar trazabilidad sin guardar conversaciones completas.
