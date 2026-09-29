# WOK Cliente móvil

Aplicación React Native con Expo SDK 57 y Expo Router. Las rutas viven en `app/`; lógica y componentes compartidos, en `src/`.

## Inicio

1. Desde la raíz del repositorio: `npm install`.
2. Copia `.env.example` como `.env` y configura `EXPO_PUBLIC_API_BASE_URL` con una dirección alcanzable desde el teléfono. No uses `localhost` en un dispositivo físico.
3. `npm run start --workspace mobile`, luego escanea el QR con Expo Go.

La URL y los flags `EXPO_PUBLIC_*` son visibles en el paquete de la app y nunca deben contener secretos. La API debe exponer HTTPS fuera de una LAN de desarrollo controlada.

## Funcionalidad disponible

- Navegación Cliente: Inicio, Menú, Reservas y Mi cuenta.
- Registro, verificación por código, login y logout contra `/api/v1/auth/*`.
- Recuperación de contraseña con solicitud neutral de código y actualización con código de un solo uso; al completar, el backend revoca las sesiones anteriores.
- Consulta y edición del perfil propio (nombre y teléfono opcional) mediante la API autenticada; el servidor usa control de versión para evitar sobrescribir cambios recientes.
- Refresh rotativo al restaurar la app: access token en memoria y refresh token con Expo SecureStore.
- Solicitud real de reserva en `/api/v1/client/reservations`, con clave idempotente reusada tras errores de transporte, límite local de 3 horas y texto explícito de revisión humana.
- Errores de conexión no confirman ni reenvían solicitudes automáticamente.

El catálogo oficial, pedidos, pagos, mensajes, historial y Google OIDC no tienen todavía contratos backend utilizables desde esta app. Esas acciones se muestran como pendientes o no están expuestas. No se inventan precios, pedidos aceptados ni confirmaciones de reserva.

## Verificación

```bash
npm run lint --workspace mobile
npm run typecheck --workspace mobile
npm run web --workspace mobile
```

La vista web sirve para revisar el flujo visual; la instalación nativa y permisos seguros deben verificarse además en Android/iOS físicos antes de una entrega.
