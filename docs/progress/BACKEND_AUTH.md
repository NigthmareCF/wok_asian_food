# Progreso de identidad backend

## 2026-09-29 — Pruebas de recuperación de contraseña

- Se agregaron pruebas del caso exitoso: el challenge de un solo uso se consume, cambia el hash de contraseña, invalida sesiones existentes y revoca sus refresh tokens.
- Se agregó un caso de código incorrecto: aumenta el contador de intentos y no cambia credenciales ni revoca sesiones.
- Verificación: suite compuesta con `feature/backend-foundation`, `feature/backend-auth`, `feature/availability`, `feature/reservations` y migraciones V1–V7: 21 pruebas unitarias, 0 fallos.
- La rama `feature/backend-auth` contiene el slice de identidad y se apoya en la base de compilación/arranque de `feature/backend-foundation`; integrar ambas por orden de dependencias, no como branches autónomos.
- Google OIDC productivo sigue pendiente de configuración y verificación de credenciales del cliente. La recuperación entrega correo por outbox; SMTP también requiere configuración externa.
# Progreso de identidad y autenticación

## 2026-10-01 — Verificación real de Google OIDC con adapter deshabilitado por defecto

- `POST /api/v1/auth/google` ahora requiere `idToken` y `nonce`. Cuando se configura `WOK_AUTH_GOOGLE_CLIENT_ID`, el adapter verifica firma con las claves JWK de Google, issuer permitido, audience, expiración, `iat` no futuro, `sub` no vacío y nonce de la solicitud.
- Sin client ID configurado conserva `503` explícito; errores al consultar JWK también devuelven servicio no disponible. Tokens con claims inválidos reciben `401`. Nunca se crea o vincula una cuenta por coincidencia de email: login exige una fila `AUTH_IDENTITY` existente y busca por `provider_subject`.
- Se añadieron pruebas del verificador para issuer actual/legacy, audience, nonce, email no verificado, configuración ausente y caída del JWKS; pruebas de servicio para impedir auto-link por email.
- Requiere configurar el OAuth Client ID público y completar linking autenticado antes de que un cliente real pueda usar Google. No se almacenó client secret ni se incorporó credencial al repo; la app móvil aún no presenta el botón/flujo OAuth.
- Referencia de claims/verificación: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect). Verificación JWK/JWT: [Spring Security Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html).
