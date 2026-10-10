# WOK Cliente móvil

Aplicación React Native con Expo SDK 57 y Expo Router. Las rutas viven en `app/`; lógica y componentes compartidos, en `src/`.

## Inicio

1. Desde la raíz del repositorio: `npm ci`.
2. Copia `apps/mobile/.env.example` como `apps/mobile/.env` y configura `EXPO_PUBLIC_API_BASE_URL` con una dirección alcanzable desde el teléfono. No uses `localhost` en un dispositivo físico.
3. `npm run start --workspace mobile`, luego escanea el QR con Expo Go.

La URL y los flags `EXPO_PUBLIC_*` son visibles en el paquete de la app y nunca deben contener secretos. El BFF debe exponer HTTPS fuera de una LAN de desarrollo controlada.

Para revisar en el navegador local, configura `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8082`: el BFF usa 8082, Core API usa 8080 y Expo usa 8081. Un teléfono físico necesita un host LAN alcanzable; un BFF que escucha únicamente en loopback no es accesible desde el teléfono. Cambiar esa escucha requiere una tarea de infraestructura separada.

Si falta la URL, el menú presenta un error amigable con **Reintentar**; los detalles técnicos se limitan a la consola de desarrollo. Reinicia Expo después de cambiar la configuración pública.

El origen del navegador y la URL del BFF son distintos: la configuración CORS local actual del BFF permite `http://localhost:8081`, pero rechaza `http://127.0.0.1:8081`. Para probar datos reales, abre Expo desde el origen permitido. Una vista en `127.0.0.1:8081` puede mostrar correctamente la interfaz y aun así recibir un error de conexión por CORS. Si otro proceso ocupa `localhost:8081`, no lo reemplaces ni cambies CORS sin autorización; la revisión visual de errores puede continuar y los flujos con datos quedan pendientes.

## Funcionalidad disponible

- Navegación Cliente: Inicio, Menú, Reservas, Solicitudes y Mi cuenta.
- Registro, verificación por código, login y logout contra `/api/v1/auth/*`.
- Recuperación de contraseña con solicitud neutral de código y actualización con código de un solo uso; al completar, el backend revoca las sesiones anteriores.
- Consulta y edición del perfil propio (nombre y teléfono opcional) mediante la API autenticada; el servidor usa control de versión para evitar sobrescribir cambios recientes.
- Refresh rotativo al restaurar la app: access token en memoria y refresh token con Expo SecureStore.
- Solicitud real de reserva en `/api/v1/client/reservations`, con clave idempotente reusada tras errores de transporte, límite local de 3 horas y texto explícito de revisión humana.
- Errores de conexión no confirman ni reenvían solicitudes automáticamente.

El catálogo publicado, carrito y solicitudes pickup usan los contratos existentes del BFF. Los comentarios del selector de platillo se revisan como comentarios generales del pedido; no representan opciones o modificaciones de ingredientes. Las solicitudes no confirman pedidos, pagos ni reservas automáticamente. No se inventan precios, popularidad, disponibilidad ni horarios; el servidor conserva la decisión final.

La marca móvil es oscura de forma intencional, también si el sistema usa modo claro. Los colores conservan los tokens Web; las respuestas a presión son estáticas y no requieren movimiento.

Los teléfonos de Guatemala se validan como ocho dígitos agrupados `1234 5678`; el prefijo `+502` se normaliza a número local. El servidor conserva autoridad de precio, stock, capacidad, ETA y aceptación. Direcciones/delivery son pantallas históricas fuera de esta entrega; el BFF no habilita sus rutas. Google, pagos/FEL y dispositivos instalados no se declaran verificados.

## Verificación

```bash
npm run lint --workspace mobile
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run web --workspace mobile
```

La vista web sirve para revisar el flujo visual; la instalación nativa y permisos seguros deben verificarse además en Android/iOS físicos antes de una entrega.
