# WOK Cliente móvil

Aplicación React Native con Expo SDK 57 y Expo Router. Las rutas viven en `app/`; lógica y componentes compartidos, en `src/`. La app consume la API WOK existente; no contiene autoridad de precios, disponibilidad, pagos ni aceptación de pedidos.

## Inicio

1. Desde la raíz del repositorio, instala con `npm ci`.
2. Copia `apps/mobile/.env.example` como `apps/mobile/.env` y configura `EXPO_PUBLIC_API_BASE_URL` con una dirección alcanzable desde el teléfono. No uses `localhost` en un dispositivo físico.
3. Ejecuta `npm run start --workspace mobile` y escanea el QR con Expo Go.

Las variables `EXPO_PUBLIC_*` se empaquetan en la aplicación: nunca coloques secretos allí. Fuera de una LAN de desarrollo, la API debe exponerse mediante HTTPS.

## Funciones implementadas

- Navegación Cliente para inicio, menú, detalle de producto, carrito, reservas, solicitudes, mensajes, direcciones y cuenta.
- Registro, verificación, login, logout, recuperación de contraseña y refresh rotativo. El access token permanece en memoria y el refresh se guarda con Expo SecureStore.
- Perfil autenticado, sesiones activas, historial/cancelación de solicitudes pendientes y borradores locales de reserva.
- Catálogo desde `GET /api/v1/public/menu`; carrito local y envío de solicitudes pickup, delivery y reservas/preórdenes a la API.
- Libreta de direcciones y mensajes según los endpoints disponibles en backend.
- Teléfonos de Guatemala aceptan ocho dígitos y se presentan agrupados como `1234 5678`; al pegar un número con prefijo `+502` se conserva sólo el número local.

La app presenta precios del catálogo como información y puede mostrar un subtotal estimado. El carrito local no reserva inventario. El backend vuelve a validar precio, stock, capacidad y ETA; las solicitudes que requieren revisión se muestran como pendientes, nunca como pedidos aceptados ni pagos confirmados. El estado de pago por transferencia necesita comprobante y validación autorizada. Google OIDC, un gateway bancario y la verificación legal de edad no se declaran operativos; la marca `+18` del catálogo es sólo informativa.

## Comprobaciones

```bash
npm run test --workspace=mobile
npm run test:styles --workspace=mobile
npm run lint --workspace=mobile
npm run typecheck --workspace=mobile
npx expo export --platform android --output-dir /tmp/wok-mobile-android-export
npx expo export --platform web --output-dir /tmp/wok-mobile-web-export
```

Los exports generan bundles de revisión, no un APK/IPA instalable. Para distribuir un APK Android hace falta completar una compilación EAS/local y firmar el artefacto; después hay que probarlo en un dispositivo físico. La vista web sirve para revisar rutas visuales, no sustituye las pruebas nativas.
