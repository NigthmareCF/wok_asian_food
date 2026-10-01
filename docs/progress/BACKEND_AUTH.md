# Progreso de identidad backend

## 2026-09-29 — Pruebas de recuperación de contraseña

- Se agregaron pruebas del caso exitoso: el challenge de un solo uso se consume, cambia el hash de contraseña, invalida sesiones existentes y revoca sus refresh tokens.
- Se agregó un caso de código incorrecto: aumenta el contador de intentos y no cambia credenciales ni revoca sesiones.
- Verificación: suite compuesta con `feature/backend-foundation`, `feature/backend-auth`, `feature/availability`, `feature/reservations` y migraciones V1–V7: 21 pruebas unitarias, 0 fallos.
- La rama `feature/backend-auth` contiene el slice de identidad y se apoya en la base de compilación/arranque de `feature/backend-foundation`; integrar ambas por orden de dependencias, no como branches autónomos.
- Google OIDC productivo sigue pendiente de configuración y verificación de credenciales del cliente. La recuperación entrega correo por outbox; SMTP también requiere configuración externa.
