# Progreso de planificación móvil

## 2026-09-26 — APP-01 y slices iniciales de identidad/reservas

- Rama `feature/mobile-shell`: se agregó app ejecutable Expo SDK 57 / React Native 0.86 / TypeScript con Expo Router y navegación Cliente Inicio, Menú, Reservas y Mi cuenta.
- La autenticación conecta registro, verificación por código, login, refresh rotativo y logout al backend WOK. El access token vive en memoria; el refresh token usa Expo SecureStore y se rota al restaurar la app o ante 401, con rotación concurrente serializada.
- La solicitud de reserva conecta `POST /api/v1/client/reservations`, pide sesión CLIENT, limita localmente a 3 horas, presenta la evaluación pública, y reutiliza `Idempotency-Key` después de errores de red para evitar doble solicitud. Ninguna respuesta se presenta como confirmación automática.
- El menú se mantiene vacío con explicación hasta recibir catálogo y endpoint. Pedidos, pagos, chat, historial, Google OIDC y reset de contraseña no se declaran implementados en móvil.
- Configuración local por `EXPO_PUBLIC_API_BASE_URL`, documentada en `apps/mobile/.env.example`; no se agregó credencial ni archivo `.env`.
- Verificación ejecutada: `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile`, `npx expo export --platform android` y `npx expo export --platform web` pasaron. Los exports verifican el bundle, no generan un APK/iOS installable. `npx expo lint` encontró un problema del comando generado al exigir el directorio `components` ausente; se cambió el script a ESLint sobre `src app` y esa validación pasó.
- Pendiente: build instalable Android/iOS, pruebas en dispositivos reales, pruebas automatizadas de flujos, recuperación de contraseña, Google, y contratos/backend de catálogo, pedidos, pagos, mensajes e historial.

## Plan original al repartir a rama móvil especializada

- El plan móvil Cliente está en `feature/mobile-shell`, worktree `/tmp/wok-worktrees/mobile`, con base `3bbd0ed` (`origin/development`).
- En ese momento el contenido era planificación; luego se implementó el slice inicial descrito arriba.
- La implementación depende del contrato API y de los slices de identidad/backend; la app no confirma reservas, pedidos ni pagos sin respuesta del servidor.
- El fast-forward fue local. No se hizo commit ni push y la rama remota no se actualizó.

## 2026-09-15 — Plan de app exclusivamente Cliente

- Resultado: [plan concreto](../mobile/CLIENT_APP_PLAN.md) con alcance por C-01 a C-13, núcleo y extensiones, arquitectura Expo/API Spring, seis paquetes estimados y criterios de prueba Android/iPhone.
- Restricciones confirmadas: 5–6 semanas totales, últimas 2–3 para seguridad/estabilización; equipo de seis con 3 web, 2 backend y 1 app iniciales, apoyo rotativo. Edgar PM y SM rotativo.
- Corrección de evidencia: no se han presentado fallos de React Native; las dudas son preventivas.
- Tecnología: recomendación React Native + Expo + TypeScript; backend Java/Spring según orientación comunicada por el PM. Versiones y distribución pendientes.
- Capacidad: construcción móvil estimada 36–52 h; revisión/entrega 14–22 h. Horas disponibles y trabajo ya existente todavía no confirmados; no es compromiso de fecha para todas las funciones Cliente.
- Verificación: revisión documental de contratos, límites de alcance, reparto sin doble conteo, formato y enlaces locales. No se instaló Expo ni se ejecutó una app.
- Pendiente: confirmar corte académico, fecha de congelamiento, dispositivos y formato de distribución; inventariar backend real y asignar personas a puestos.
- Git: documentación local; sin commit, push, cambio de rama, merge ni publicación.
