# Progreso de la aplicación Cliente

## 2026-10-08 — Explicar el rechazo de comprobantes

- El estado del comprobante ahora incluye el motivo seguro enviado por el personal; Pedidos lo presenta junto al estado `REJECTED` para guiar una nueva entrega.
- Verificación: 24 archivos/98 pruebas Vitest, ESLint y TypeScript aprobados. Depende del campo `reviewReason` de la API V51.

## 2026-10-07 — Comprobante de transferencia de pickup

- Rama: `feature/mobile-shell`
- Vistas: Pedidos / historial Cliente.
- Completado: para una solicitud pickup con transferencia permite elegir JPG/PNG, subirlo al backend y consultar `NEEDS_REVIEW`, `VERIFIED` o `REJECTED`. Si el personal rechaza el comprobante, la app muestra el motivo recibido de la API. Reintentar conserva la clave idempotente mientras la imagen continúa seleccionada. El texto aclara que adjuntar una imagen no confirma el pago.
- Implementación: Expo ImagePicker SDK 57 `~57.0.20`; permisos de cámara y micrófono deshabilitados. Multipart reutiliza el request autenticado y la rotación normal de sesión; no fija `Content-Type` para conservar el boundary automático.
- Pruebas: `npm run lint`, `npm run typecheck`, `npm test` (24 archivos, 98 tests) aprobados; `npx expo export --platform web` generó 17 rutas; `npx expo export --platform android` generó bundle Android.
- Límites: requiere API V51 desplegada; la revisión y confirmación del pago son manuales. La galería no se ha verificado aún en dispositivo físico; el export no es APK instalable. El endpoint Cliente expone el motivo entregado por personal, no datos financieros internos.
- PR: pendiente.
