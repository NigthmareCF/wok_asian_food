# Contrato API WOK

Base propuesta: `/api/v1`. El contrato ejecutable se publica desde Springdoc en `/api/v1/openapi` cuando el API está levantado. Sólo operaciones implementadas deben aparecer como operativas; la tabla siguiente es la partición de seguridad objetivo, no una lista de endpoints ya disponibles.

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
