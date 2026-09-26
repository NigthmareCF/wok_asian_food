# Contrato API WOK

Base: `/api/v1`. Springdoc publica el contrato actual en `/api/v1/openapi`. La lista de esta página distingue operaciones ya implementadas de áreas objetivo; fixtures y puertos mock no cuentan como proveedor real.

| Grupo       | Identidad            | Ejemplos de casos de uso                          | Regla                                     |
| ----------- | -------------------- | ------------------------------------------------- | ----------------------------------------- |
| public      | anonymous            | menú, horarios y estado de servicio               | sin datos privados                        |
| guest       | token opaco acotado  | una reserva/pedido/seguimiento                    | scope, recurso y vencimiento              |
| client      | sesión WOK           | mis reservas, pedidos, facturas y mensajes        | ownership en backend                      |
| operational | staff + permiso      | mesas, KDS, caja, delivery y handoff              | permiso granular, motivo y audit          |
| admin       | staff privilegiado   | usuarios, roles, reglas, integraciones y reportes | permiso específico y MFA cuando se adopte |
| internal    | servicio autenticado | AI Gateway, workers y webhooks normalizados       | nunca expuesto como API pública           |

Convenciones: UUID como string, tiempo ISO con zona, dinero decimal string + moneda, `Idempotency-Key` para mutaciones repetibles, `requestId` en error. 401 significa sesión inválida, 403 permiso, 409 conflicto/versionado, 422 regla de negocio y 503 integración o servicio temporalmente indisponible. El cliente no envía importe confiable: el servidor revalida precios, descuentos, stock, capacidad, ETA, impuestos y total. No devolver entidades JPA ni secretos.

La web y app usan la misma API a través de Nginx. Desconexión no confirma operaciones; reintentos con la misma clave resuelven timeout tras commit. Los endpoints de IA internos requieren autenticación de servicio y Tool Broker, sin acceso directo del runtime a DB.

## Endpoints implementados

| Método | Ruta | Acceso | Comportamiento |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/register` | público | Registro neutral; crea usuario `PENDING_VERIFICATION`, rol `CLIENT`, perfil Cliente y challenge/outbox. Devuelve 202. |
| `POST` | `/api/v1/auth/verify` | público | Consume challenge y activa cuenta. |
| `POST` | `/api/v1/auth/login` | público | Abre sesión WOK; entrega access JWT y refresh opaco. |
| `POST` | `/api/v1/auth/refresh` | público | Rota refresh; reuse revoca sesión/familia. |
| `POST` | `/api/v1/auth/reset/request` | público | Solicitud neutral de recuperación. |
| `POST` | `/api/v1/auth/reset/complete` | público | Consume challenge, actualiza contraseña y revoca sesiones. |
| `POST` | `/api/v1/auth/logout` | autenticado | Revoca la sesión actual. |
| `GET` | `/api/v1/public/service-capabilities` | público | Estado de capacidades vigentes. |
| `PUT` | `/api/v1/admin/service-capabilities/{code}` | ADMIN | Requiere motivo y `expectedVersion`; guarda evento y auditoría. |
| `POST` | `/api/v1/public/reservations/evaluate` | público | Evaluación sin crear ni confirmar solicitud. |
| `POST` | `/api/v1/client/reservations` | CLIENT | Requiere `Idempotency-Key`; crea solicitud pendiente o persiste evaluación sin reserva si la regla rechaza. Siempre distingue solicitud de confirmación. |
| `GET` | `/api/v1/operational/reservations/pending` | OPERACIONAL o ADMIN | Lista solicitudes aún no revisadas. |
| `PUT` | `/api/v1/operational/reservations/{id}/decision` | OPERACIONAL o ADMIN | Confirma/rechaza con motivo, versión esperada, historial y auditoría. |
| `GET` | `/actuator/health` | público | Health mínimo de la API. |

Las solicitudes de reserva aplican tres horas mínimas. Una evaluación válida aún puede requerir aprobación humana; no se asigna mesa ni se declara disponibilidad real. El cambio de servicio y la decisión de reserva tienen control de versión para evitar actualizaciones obsoletas.

## Pendiente de implementación

Catálogo/pedidos/KDS/caja/inventario/producción, flujos completos de roles/usuarios, ownership por cada recurso, provider Google OIDC real, payment/FEL real, webhooks Meta, app móvil y operación WAN siguen en slices posteriores. Revisar `docs/project/GAP_ANALYSIS.md` y `docs/backend/BACKLOG.md` para estados y dependencias.
