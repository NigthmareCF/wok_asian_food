# Progreso de la aplicación Cliente

## 2026-10-07 — Comprobante de transferencia de pickup

- Rama: `feature/mobile-shell`
- Vistas: Pedidos / historial Cliente.
- Completado: para una solicitud pickup con transferencia permite elegir JPG/PNG, subirlo al backend y consultar `NEEDS_REVIEW`, `VERIFIED` o `REJECTED`. Reintentar conserva la clave idempotente mientras la imagen continúa seleccionada. El texto aclara que adjuntar una imagen no confirma el pago.
- Implementación: Expo ImagePicker SDK 57 `~57.0.20`; permisos de cámara y micrófono deshabilitados. Multipart reutiliza el request autenticado y la rotación normal de sesión; no fija `Content-Type` para conservar el boundary automático.
- Pruebas: `npm run lint`, `npm run typecheck`, `npm test` (24 archivos, 98 tests) aprobados; `npx expo export --platform web` generó 17 rutas; `npx expo export --platform android` generó bundle Android.
- Límites: requiere API V51 desplegada; la revisión y confirmación del pago son manuales. La galería no se ha verificado aún en dispositivo físico; el export no es APK instalable.
- PR: pendiente.
