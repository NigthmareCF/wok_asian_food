# WOK Cliente móvil

Aplicación React Native con Expo SDK 57 y Expo Router. Las rutas viven en `app/`; lógica y componentes compartidos, en `src/`.

## Inicio

1. Desde la raíz del repositorio: `npm install`.
2. Copia `.env.example` como `.env` y configura `EXPO_PUBLIC_API_BASE_URL` con una dirección alcanzable desde el teléfono. No uses `localhost` en un dispositivo físico.
3. `npm run start --workspace mobile`, luego escanea el QR con Expo Go para las funciones normales de Cliente. El comando fuerza Expo Go incluso con `expo-dev-client` instalado.

## Google Sign-In nativo

Google usa `react-native-nitro-google-signin` con Android Credential Manager e iOS Google Sign-In. Expo Go no incluye estos módulos nativos; crea un development build para probar este acceso. Configura `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (OAuth client de tipo Web, también configurado como audiencia del backend) y `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` (reversed iOS client ID) en el entorno local o EAS. Son identificadores públicos, no secretos. Para Android registra el package y SHA-1 del certificado de debug/EAS en Google Cloud. Sin esa configuración el resto de la app sigue funcionando y la acción muestra un aviso.

Después de configurar variables y credenciales, genera el proyecto nativo y ejecuta un build de desarrollo:

```bash
npx expo prebuild
npx expo run:android
npm run start:dev-client --workspace mobile
```

El backend emite un nonce criptográfico de un solo uso; la app lo pasa al SDK de Google y envía el ID token, nonce y tipo de cliente al backend WOK. La app sólo conserva el refresh token WOK en SecureStore y el access token WOK en memoria. No guarda tokens Google.

La URL y los flags `EXPO_PUBLIC_*` son visibles en el paquete de la app y nunca deben contener secretos. La API debe exponer HTTPS fuera de una LAN de desarrollo controlada.

## Funcionalidad disponible

- Navegación Cliente: Inicio, Menú, Reservas, Solicitudes y Mi cuenta; rutas adicionales para mensajes, delivery y direcciones.
- Registro, verificación por código, login y logout contra `/api/v1/auth/*`.
- Recuperación de contraseña con solicitud neutral de código y actualización con código de un solo uso; al completar, el backend revoca las sesiones anteriores.
- Consulta y edición del perfil propio (nombre y teléfono opcional) mediante la API autenticada; el servidor usa control de versión para evitar sobrescribir cambios recientes.
- Administración de sesiones activas: consulta y cierre de sesiones propias desde Mi cuenta.
- Refresh rotativo al restaurar la app: access token en memoria y refresh token con Expo SecureStore. Las rotaciones se comparten sólo para el mismo token y las escrituras/eliminaciones locales quedan serializadas para evitar restaurar una sesión antigua al cambiar de cuenta o cerrar sesión.
- Solicitud real de reserva en `/api/v1/client/reservations`, con clave idempotente reusada tras errores de transporte, límite local de 3 horas y texto explícito de revisión humana.
- Catálogo público con opciones configurables por grupos y límites; pickup y delivery conservan carrito/opciones en SecureStore, muestran un subtotal estimado y envían las elecciones dentro de solicitudes idempotentes.
- Historial/detalle de pickup y delivery muestra snapshots de opciones del servidor junto con cantidades y precios; las solicitudes pendientes pueden cancelarse y no se presentan como pedidos aceptados.
- Solicitud de delivery con dirección, teléfono GT validado, preferencia de pago, historial/detalle/cancelación y libreta de direcciones propia; mensajería autenticada de la app.
- Errores de conexión no confirman ni reenvían solicitudes automáticamente.

El catálogo muestra artículos y opciones publicados por backend. La rama backend especializada ya incorpora un seed manual idempotente con los 31 productos/precios vigentes y los marca sin receta ni stock automáticos; estará disponible al integrar esa rama y ejecutar el seed en una base de desarrollo. La app presenta los artículos marcados +18 con un aviso, pero la política de verificación de edad aún requiere definición. Las solicitudes pickup/delivery continúan pendientes de revisión y no equivalen a pedidos aceptados. Google OIDC permite iniciar sesión con una identidad vinculada o vincularla desde una sesión WOK activa; faltan configurar los clientes OAuth reales y hacer pruebas instaladas en Android/iOS. No existe cobro en línea productivo, notificaciones push ni pruebas E2E instaladas en dispositivos. Mensajes requieren red y no prometen respuesta en tiempo real. Estas limitaciones no se presentan como integraciones productivas.

## Verificación

```bash
npm run lint --workspace mobile
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run web --workspace mobile
```

La vista web sirve para revisar el flujo visual; la instalación nativa y permisos seguros deben verificarse además en Android/iOS físicos antes de una entrega.
