# Brechas de Web Cliente, Operativo y Administrativo

Auditoría de 2026-09-25. Las rutas existentes tienen datos simulados y estados locales; no deben presentarse como transacciones persistentes. Referencias de IDs: [Cliente](channels/CLIENT.md), [Operativo](channels/OPERATIONAL.md), [Administrativo](channels/ADMIN.md). La API es autoridad de precio, stock, ETA, disponibilidad, permisos, pagos e impuestos.

| Canal                  | Cobertura visible actual                                                                                                                     | Brecha funcional prioritaria                                                                                                                              | Integración esperada                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Cliente C-01–13        | auth visual; menú, carrito, checkout, reservas, mensajes, pedidos y ubicación con fixtures; perfil enlazado como demo                        | registro/Google/verificación reales, guest, reserva 3 h, pickup/delivery, pago seguro, FEL, perfil/direcciones, degradación WAN                           | sesión WOK, catálogo/servicios, capacidad, solicitudes, pagos, facturas y mensajería |
| Operativo O-01–18      | rutas de mesas, pedidos, cocina, reservas, delivery, pagos, caja, inventario, producción, mensajes y estado; mayormente providers en memoria | solicitudes pendientes revalidadas, KDS persistente, pagos mixtos/propinas, workspace FEL, handoff IA y salud de integraciones                            | comandos autorizados con audit/versionado, snapshots/eventos y outbox                |
| Administrativo A-01–16 | dashboard, usuarios, roles, personal, menú, recetas, compras, reportes, cierres, clientes, settings, IA, visión y auditoría con fixtures     | sesiones/eventos de seguridad, reglas de reserva, capacidades individuales, configuración de pasarela/FEL/Meta/email, AI feedback/datasets, salud externa | APIs admin con permiso granular, historial y cambios auditados                       |

## Orden de integración

1. Mantener las rutas existentes y sustituir fixtures mediante adapters por módulo, empezando por auth y estado de servicio. Un error API muestra error real, nunca vuelve silenciosamente a fixture.
2. Conectar menú y capacidad/reservas; carrito conserva borrador pero no inventario. Confirmación online sólo después de respuesta API; revalidar tras reconexión.
3. Conectar solicitud/aceptación de pedido, KDS y seguimiento cruzado Cliente/Operativo. Cada acción sensible exige permiso/ownership y manejo de 409/422.
4. Conectar cuenta, pagos mixtos/caja/FEL y mensajería; marcar adapter mock hasta proveedor real. El frontend nunca captura PAN/CVV ni confirma voucher por OCR.
5. Administrar integraciones y auditoría con señales separadas `CORE`/externas. Probar a 390, 768, 1280 y 1440 px, teclado/touch, estados vacío/carga/error y degradación de red.

La navegación existente conserva acceso a Reservas y Mensajes de Cliente y a los procesos Operativos. Nuevos accesos se añadirán cuando exista vista/caso de uso; una entrada de menú no prueba autorización. La guía histórica que limitaba Web a un sprint de mocks queda `SUPERSEDED` como alcance del producto, aunque sigue siendo evidencia del trabajo inicial.
