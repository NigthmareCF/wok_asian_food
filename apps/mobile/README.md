# WOK Cliente móvil

Aplicación React Native con Expo SDK 57 y Expo Router. Las rutas viven en `app/`; lógica y componentes compartidos, en `src/`.

## Inicio

1. Desde la raíz del repositorio: `npm install`.
2. Copia `.env.example` como `.env` y configura `EXPO_PUBLIC_API_BASE_URL` con una dirección alcanzable desde el teléfono. No uses `localhost` en un dispositivo físico.
3. `npm run start --workspace mobile`, luego escanea el QR con Expo Go.

La URL y los flags `EXPO_PUBLIC_*` son visibles en el paquete de la app y nunca deben contener secretos. La API debe exponer HTTPS fuera de una LAN de desarrollo controlada.

## Funcionalidad disponible

- Navegación Cliente: Inicio, Menú, Reservas, Solicitudes y Mi cuenta; rutas adicionales para mensajes, delivery y direcciones.
- Registro, verificación por código, login y logout contra `/api/v1/auth/*`.
- Recuperación de contraseña con solicitud neutral de código y actualización con código de un solo uso; al completar, el backend revoca las sesiones anteriores.
- Consulta y edición del perfil propio (nombre y teléfono opcional) mediante la API autenticada; el servidor usa control de versión para evitar sobrescribir cambios recientes.
- Administración de sesiones activas: consulta y cierre de sesiones propias desde Mi cuenta.
- Refresh rotativo al restaurar la app: access token en memoria y refresh token con Expo SecureStore. Las rotaciones se comparten sólo para el mismo token y las escrituras/eliminaciones locales quedan serializadas para evitar restaurar una sesión antigua al cambiar de cuenta o cerrar sesión.
- Solicitud real de reserva en `/api/v1/client/reservations`, con clave idempotente reusada tras errores de transporte, límite local de 3 horas y texto explícito de revisión humana.
- Catálogo público, solicitud de pickup, historial/detalle/cancelación de solicitudes pendientes, y mensajería autenticada de la app.
- Solicitud de delivery con menú, dirección, teléfono, preferencia de pago, historial/detalle/cancelación, además de libreta de direcciones propia.
- Errores de conexión no confirman ni reenvían solicitudes automáticamente.

El catálogo sólo mostrará artículos publicados por backend; falta recibir e ingresar el menú real. Las solicitudes pickup/delivery continúan pendientes de revisión y no equivalen a pedidos aceptados. No existe pago en línea, factura/FEL, Google OIDC, seguimiento de órdenes aceptadas, notificaciones push ni pruebas E2E instaladas en dispositivos. Mensajes requieren red y no prometen respuesta en tiempo real. Estas limitaciones no se presentan como integraciones productivas.

## Verificación

```bash
npm run lint --workspace mobile
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run web --workspace mobile
```

La vista web sirve para revisar el flujo visual; la instalación nativa y permisos seguros deben verificarse además en Android/iOS físicos antes de una entrega.
