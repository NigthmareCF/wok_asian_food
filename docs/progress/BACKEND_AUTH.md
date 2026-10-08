# Progreso de identidad backend

## 2026-10-08 — A3.1: resolución de IP con proxies explícitos

- `ClientIpResolver` integra en `AuthController` la lista CSV `wok.http.trusted-proxies`/`WOK_HTTP_TRUSTED_PROXIES`, vacía por defecto. Solo acepta XFF cuando el peer inmediato pertenece a una IP/CIDR configurada; ninguna red privada, loopback ni `app_net` recibe confianza implícita.
- Valida literales IPv4/IPv6 sin DNS, rechaza configuración malformada y compara prefijos por bits con familias separadas. Valida toda la cadena XFF, combina cabeceras repetidas y recorre desde la derecha hasta el primer salto no confiable. XFF inválido o peer no confiable conserva `remoteAddr`; peer inválido mantiene `UNKNOWN`/SQL `NULL` de A2.
- `server.forward-headers-strategy=none` conserva el peer TCP. El limitador revalida únicamente la IP ya resuelta y deja de interpretar cadenas XFF por su cuenta.
- Nuevas pruebas unitarias de spoof directo, redes privadas sin confianza, IP/CIDR IPv4/IPv6, límites de subred, proxy permitido/no permitido, cadenas con prefijo falsificado, cabeceras repetidas, entradas inválidas y configuración inválida. Integración HTTP/PostgreSQL nueva confirma lista vacía y spoof ignorado con configuración real de Spring. Las integraciones A2/A4 que requieren XFF declaran confianza en loopback solo en su contexto de prueba.
- Validación: `./mvnw.cmd -Dtest=ClientIpAddressTest,ClientIpResolverTest,ClientIpResolverIntegrationTest,AuthRateLimitHttpTest,AuthRateLimitPostgresIntegrationTest,AuthHardeningTest,AuthRequestHttpTest,VerificationResendTest,VerificationChallengeIntegrationTest,PasswordResetIntegrationTest test`: 175 ejecutadas y aprobadas, 0 fallos, 0 errores y 0 omitidas; 17 casos usan HTTP/PostgreSQL 18.6. `git diff --check` sin errores.
- Configuración y contrato documentados en `docs/security/AUTH_ARCHITECTURE.md`. Compose/BFF y la lista real de peers quedan pendientes de configuración y revisión de Fernando. Sin cambios en Nginx, Compose, BFF, migraciones o dependencias; sin operaciones de escritura de Git. Cambios previos preservados.

## 2026-10-08 — A4.6: reset vencido, reutilizado y agotado

- `PasswordResetIntegrationTest` agrega tres escenarios HTTP/PostgreSQL: código correcto vencido, reutilización después de un reset HTTP exitoso y cinco códigos incorrectos seguidos de un código correcto. Todos los rechazos exigen 400 con el JSON neutral `{"message":"Código inválido o vencido."}`.
- Vencimiento conserva contador cero y challenge sin consumir. Reutilización conserva exactamente el challenge consumido y las credenciales posteriores al primer reset; dos sesiones nuevas permanecen activas.
- Cada intento incorrecto verifica mediante lectura independiente el incremento persistido de 1 a 5, máximo 5 y ausencia de consumo/revocación. El código correcto posterior mantiene intacto el challenge agotado y responde 400.
- Para que el sexto pedido alcance el challenge, el fixture desplaza fuera de la ventana los cinco registros `RESET_COMPLETE`/`IDENTIFIER` del correo bajo prueba. No cambia intentos ni vencimiento del challenge. Sin ese aislamiento, el limitador HTTP respondería 429 antes de evaluar el código; no se modificó esa política productiva.
- Cada rechazo compara filas completas de usuarios, credenciales, sesiones y refresh de ambas cuentas; el challenge del segundo usuario también permanece intacto. Los access de las sesiones activas siguen permitiendo `/me` 200. Cada escenario utiliza una IP de reset independiente.
- Validación exclusiva: `./mvnw.cmd -Dtest=PasswordResetIntegrationTest test`: 4 ejecutadas y aprobadas (incluye A4.5), 0 fallos, 0 errores y 0 omitidas; `BUILD SUCCESS`. `git diff --check` sin errores.
- Sin cambios productivos, migraciones, dependencias ni operaciones de escritura de Git. Cambios previos preservados.

## 2026-10-08 — A4.5: reset exitoso y aislamiento entre usuarios

- `PasswordResetIntegrationTest` agrega un escenario HTTP real con PostgreSQL 18.6/Testcontainers: dos sesiones del usuario (WEB/MOBILE) y una sesión de otro usuario obtenidas mediante login. Un challenge HMAC controlado aísla la finalización del reset del envío de correo.
- Reset devuelve 200, consume el challenge sin intentos fallidos, cambia el hash de contraseña y adelanta `sessions_valid_after`. La contraseña anterior devuelve 401; la nueva permite login y `/me` 200 con una sesión nueva.
- Ambas sesiones anteriores quedan revocadas con motivo `PASSWORD_RESET`; sus refresh tienen `revoked_at` persistido. El esquema almacena el motivo en la sesión, no en el refresh. Los dos access y los dos refresh anteriores devuelven 401; probarlos no altera el estado revocado ni crea hijos.
- El segundo usuario conserva exactamente su fila, credenciales, sesiones y refresh tras el reset. Su access sigue permitiendo `/me`, su refresh rota con 200 y su contraseña original permite un nuevo login.
- Validación exclusiva: `./mvnw.cmd -Dtest=PasswordResetIntegrationTest test`: 1 ejecutada y aprobada, 0 fallos, 0 errores y 0 omitidas; `BUILD SUCCESS`. `git diff --check` sin errores.
- Sin cambios productivos, migraciones, dependencias ni operaciones de escritura de Git. Cambios previos preservados.

## 2026-10-08 — A4.4-V: validación con PostgreSQL operativo

- Se ejecutó únicamente `RejectedRefreshIntegrationTest` con HTTP real y PostgreSQL 18.6 mediante Testcontainers.
- La primera ejecución tuvo 3 aprobadas y 1 error de fixture: el refresh expirado violaba `ck_refresh_tokens_1` (`expires_at > created_at`). Se corrigió exclusivamente ese fixture colocando la creación dos minutos atrás y el vencimiento un minuto atrás, sin modificar código productivo.
- Reejecución con `./mvnw.cmd -Dtest=RejectedRefreshIntegrationTest test`: **4 ejecutadas, 4 aprobadas, 0 fallidas, 0 errores y 0 omitidas; BUILD SUCCESS**. Los cuatro rechazos cumplen 401 sin hijo, extensión de sesión ni falsa reutilización.
- Sin operaciones de escritura de Git.

## 2026-10-08 — A4.4: rechazos de refresh sin efectos secundarios

- `RejectedRefreshIntegrationTest` agrega cuatro casos HTTP/PostgreSQL: refresh expirado, token revocado, sesión revocada y usuario suspendido. Cada caso obtiene un refresh sin usar mediante login HTTP y altera una sola condición con un fixture SQL.
- Los cuatro exigen 401 y el cuerpo exacto `{"message":"Sesión inválida."}`. Lecturas independientes posteriores comparan todos los campos de la sesión y sus refresh contra el estado previo: sin token hijo, consumo, extensión del vencimiento, actualización de actividad ni cambios de revocación.
- Se comprueba ausencia de motivo `REFRESH_REUSE` y de eventos `REFRESH_TOKEN_REUSE`/`REFRESH_REUSE` asociados al usuario o sesión antes y después del rechazo. La sesión revocada conserva su motivo `LOGOUT`; su token permanece sin revocar para aislar esa condición.
- Validación intentada: `./mvnw.cmd -Dtest=RejectedRefreshIntegrationTest test`. La compilación de pruebas pasó; la ejecución quedó bloqueada al conectar Testcontainers con Docker. `docker version` tampoco respondió, aunque Docker Desktop estaba abierto. Se interrumpieron ambos comandos tras varios minutos; los cuatro casos no tienen resultado de ejecución y requieren repetirse con el daemon operativo. `git diff --check` sin errores.
- Sin cambios productivos, migraciones, dependencias, commits, push ni merge. Se preservaron los cambios previos del árbol de trabajo.

## 2026-10-07 — A4.3: vencimiento, reutilización y agotamiento de verificación

- `VerificationChallengeIntegrationTest` agrega cuatro escenarios HTTP con PostgreSQL 18.6 real. Fixtures controlados preparan cuentas pendientes y challenges HMAC para aislar la verificación del registro y del envío de correo.
- Código correcto vencido: 400 neutral, cuenta pendiente, email sin verificar, challenge sin consumir y contador en cero.
- Challenge previamente consumido para una cuenta pendiente: 400 neutral sin activación ni modificación del challenge. Se cubre también la secuencia HTTP exitosa 200 seguida de reutilización 400; en este caso la cuenta ya activa y sus timestamps permanecen intactos.
- Cinco códigos incorrectos: cada 400 persiste un incremento comprobado mediante lectura independiente de PostgreSQL. El código correcto posterior también devuelve 400, mantiene cinco intentos y no activa la cuenta ni consume el challenge.
- Todos los rechazos comparan el cuerpo exacto `{"message":"Código inválido o vencido."}`. Las solicitudes usan una IP de prueba independiente por escenario para no confundir agotamiento del challenge con rate limiting.
- Verificación exclusiva: `mvn -Dtest=VerificationChallengeIntegrationTest test`: 4 pruebas, 0 fallos, 0 errores y 0 omitidas. `git diff --check` sin errores.
- Sin cambios productivos, de migraciones ni operaciones de escritura de Git.

## 2026-10-07 — A4.2: renovaciones simultáneas del mismo refresh

- `ConcurrentRefreshIntegrationTest` usa HTTP real y PostgreSQL 18.6. Una barrera inicia dos solicitudes con el mismo refresh; un bloqueo temporal de la fila padre se libera sólo después de observar ambas transacciones esperando en `pg_stat_activity`, demostrando solapamiento real.
- Estados HTTP observados: una renovación 200 y la otra 401 con mensaje de sesión inválida. No se presupone cuál solicitud gana ni el orden de llegada de las respuestas.
- Invariantes verificadas antes y después de probar los tokens resultantes: exactamente un padre usado y un único hijo sin usar, hashes distintos, ninguna bifurcación/cadena duplicada, vencimiento igual al de la sesión y todos los refresh revocados. La sesión queda revocada con motivo `REFRESH_REUSE` y se registra un evento crítico `REFRESH_TOKEN_REUSE` por la carrera.
- Tras completar ambas renovaciones, el access original, el access emitido por la respuesta 200 y su refresh responden 401. La respuesta 200 no garantiza que sus tokens sigan vigentes una vez que la solicitud competidora detecta reutilización.
- Verificación exclusiva: `mvn -Dtest=ConcurrentRefreshIntegrationTest test`: 1 prueba, 0 fallos, 0 errores y 0 omitidas. `git diff --check` sin errores.
- Estado final coherente con la política de reutilización existente. Sin cambios productivos, de migraciones ni operaciones de escritura de Git.

## 2026-10-07 — A4.1: integración de /me y logout

- `CurrentUserLogoutIntegrationTest` agrega dos casos con HTTP real y PostgreSQL 18.6 mediante Testcontainers. Las cuentas y roles se preparan como fixtures; las sesiones se obtienen por login HTTP.
- `/me` compara el JSON completo de identidad, roles y permisos: incluye la unión sin duplicados de permisos de roles activos y excluye roles inactivos/revocados con sus permisos exclusivos.
- Logout devuelve 204 sin cuerpo, persiste la revocación con motivo `LOGOUT` y revoca los refresh de su sesión. El access y refresh de esa sesión responden 401; una segunda sesión del mismo usuario conserva /me 200, refresh 200 y acceso con el token renovado.
- Verificación exclusiva: `mvn -Dtest=CurrentUserLogoutIntegrationTest test`: 2 pruebas, 0 fallos, 0 errores y 0 omitidas. `git diff --check` sin errores.
- No fue necesario cambiar código productivo. Sin cambios de migraciones ni operaciones de escritura de Git.

## 2026-10-07 — A2-V: integración HTTP/PostgreSQL de IP y límites

- `AuthRateLimitPostgresIntegrationTest` agrega ocho casos con servidor HTTP real y PostgreSQL 18.6 efímero mediante Testcontainers, usando las migraciones V1–V25 existentes.
- Cubre XFF IPv4/IPv6 válido, XFF inválido con remoteAddr válido y ambas fuentes inválidas. Un filtro exclusivo del contexto de prueba simula remoteAddr inválido; controlador, seguridad, limiter y JDBC permanecen reales.
- Verifica en `/auth/verify/resend` diez solicitudes aceptadas por IP con correos distintos y 429 en la undécima; cinco aceptadas por correo y 429 en la sexta. Comprueba contadores persistidos, cuerpo de error, tipo PostgreSQL `inet`, dirección esperada o SQL NULL y un evento de seguridad por rechazo, sin respuestas 500.
- Ejecución exclusiva: `mvn -Dtest=AuthRateLimitPostgresIntegrationTest,ClientIpAddressTest,AuthRateLimitHttpTest,AuthHardeningTest test`: 78 pruebas, 0 fallos, 0 errores y 0 omitidas; ocho son de integración. `git diff --check` sin errores.
- No se detectó un defecto que requiriera modificar código productivo. Sin cambios de migraciones ni operaciones de escritura de Git.

## 2026-10-07 — A2: validación de IP en autenticación

- `ClientIpAddress` valida y normaliza literales IPv4/IPv6 sin DNS. Rechaza hostnames, puertos, CIDR, zonas y direcciones malformadas.
- `AuthController` conserva la prioridad del primer valor de XFF; si es inválido, usa `remoteAddr` válido. No cambia la política de proxies confiables.
- `AuthRateLimiter` revalida la dirección antes de enviarla como `inet`. Para IP desconocida mantiene un contador `UNKNOWN` y registra SQL NULL; conserva los límites por correo/IP y el error 429.
- Pruebas nuevas: 36 casos del parser y 27 casos MockMvc con controlador/limiter reales y JDBC simulado. Cubren XFF inválido, fallback IPv4/IPv6, remoteAddr inválido, IP desconocida y límites excedidos por IP o correo; verifican que el parámetro `inet` sea válido o nulo. No se ejecutó PostgreSQL real.
- Verificación: `mvn -Dtest=ClientIpAddressTest,AuthRateLimitHttpTest,AuthHardeningTest,AuthRequestHttpTest,ApiErrorHandlerTest,AuthDtosValidationTest test`: 92 pruebas, 0 fallos, 0 errores y 0 omitidas. `git diff --check` sin errores.
- Sin cambios de migraciones, dependencias, infraestructura o clientes; sin operaciones de escritura de Git.

## 2026-10-07 — A1: errores de cuerpo en autenticación

- `ApiErrorHandler` responde 400 a `HttpMessageNotReadableException` con el mensaje genérico existente, sin detalles internos. Se conservan Bean Validation y los demás manejadores.
- `AuthRequestHttpTest` agrega 17 casos HTTP con MockMvc: JSON malformado y cuerpo ausente en las ocho rutas auth que requieren cuerpo, y `clientType` inválido en login. Este campo sigue siendo `String` validado con `@Pattern`.
- Las pruebas verifican estado, cuerpo exacto, tipo de excepción y ausencia de llamadas a servicios. Alcance: controlador y advice, sin filtros de seguridad ni base de datos.
- Verificación: `mvn -Dtest=AuthRequestHttpTest,ApiErrorHandlerTest,AuthDtosValidationTest test`: 22 pruebas, 0 fallos, 0 errores y 0 omitidas. Se usó Maven 3.9.16 instalado directamente por un fallo previo al arranque del wrapper en PowerShell. `git diff --check` sin errores.
- Sin cambios en web, BFF, móvil, infraestructura o migraciones; sin operaciones de escritura de Git.

## 2026-09-29 — Pruebas de recuperación de contraseña

- Se agregaron pruebas del caso exitoso: el challenge de un solo uso se consume, cambia el hash de contraseña, invalida sesiones existentes y revoca sus refresh tokens.
- Se agregó un caso de código incorrecto: aumenta el contador de intentos y no cambia credenciales ni revoca sesiones.
- Verificación: suite compuesta con `feature/backend-foundation`, `feature/backend-auth`, `feature/availability`, `feature/reservations` y migraciones V1–V7: 21 pruebas unitarias, 0 fallos.
- La rama `feature/backend-auth` contiene el slice de identidad y se apoya en la base de compilación/arranque de `feature/backend-foundation`; integrar ambas por orden de dependencias, no como branches autónomos.
- Google OIDC productivo sigue pendiente de configuración y verificación de credenciales del cliente. La recuperación entrega correo por outbox; SMTP también requiere configuración externa.
