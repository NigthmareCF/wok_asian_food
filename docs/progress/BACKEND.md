# Progreso de planificación backend

## 2026-10-02 — Recuperación de contraseña y revocación comprobadas por HTTP

- `SecurityCompositionIntegrationTest` recorre registro/verificación y login; luego solicita recuperación, procesa el email mock por outbox, consume el código y fija contraseña nueva. Verifica que access token, refresh token y contraseña anteriores fallen, y que la nueva sesión funcione.
- Maven Java 21: 49 tests, 0 fallos, 0 errores, 0 skips; PostgreSQL 18/Testcontainers con Flyway V1–V12. No se dependió de correo externo.
- Rama especializada `fix/backend-security-composition`; test publicado en `826483c`. Sin merge ni cambios frontend.

## 2026-10-02 — Ownership de pickup y precisión temporal del JWT

- Se corrigió `SecurityConfig`: la validez de una sesión ya compara `auth_sessions.created_at >= users.sessions_valid_after`, junto con estado, revocación y expiración. Antes se comparaba el `iat` del JWT (segundos) contra un timestamp PostgreSQL con microsegundos, lo que podía invalidar una cuenta que registraba e iniciaba sesión dentro del mismo segundo. El nuevo control mantiene la revocación efectiva de sesiones creadas antes del umbral y evita el falso rechazo de sesiones nuevas.
- `SecurityCompositionIntegrationTest` prueba por HTTP y PostgreSQL limpio dos cuentas Cliente verificadas, envío pickup de una solicitud con catálogo sintético, detalle propio 200, detalle ajeno 404, historial ajeno vacío, cancelación ajena 404 y solicitud original intacta 200. No se inventa catálogo productivo.
- Maven Java 21: 48 tests, 0 fallos, 0 errores, 0 skips; Testcontainers ejecutó la integración y Flyway aplicó V1–V12. Los 11 scripts SQL ya habían pasado contra PostgreSQL 18 en la validación anterior; no hubo cambio de migraciones.
- Rama especializada `fix/backend-security-composition`; commit/push `8d1dfcd` completado. Sin merge ni cambios de frontend.

## 2026-10-02 — Flujo HTTP completo de autenticación con PostgreSQL

- La prueba `SecurityCompositionIntegrationTest` amplía el smoke de composición a un ciclo real con PostgreSQL 18/Testcontainers: registra un Cliente, procesa la verificación mediante `MockEmailProvider` y `EmailOutboxWorker`, verifica la cuenta, inicia sesión móvil, consulta sesiones, confirma `403` en una ruta Admin para token Cliente, rota el refresh y comprueba `401` al reutilizar el token anterior y revocación del access token asociado.
- Validación final de `mvn -q test`: 47 tests, 0 fallos, 0 errores, 0 skips; Testcontainers ejecutó la integración y Flyway aplicó V1–V12. Hubo un primer `401` intermitente en el acceso a sesiones; la prueba aislada y la suite completa pasaron al repetirla. Mantener observación en CI/repeticiones futuras antes de considerar la cobertura estable.
- Cambio en rama especializada `fix/backend-security-composition`; commits publicados `6a487a7` (corrección de filtros duplicados), `af0390c` (smoke automatizado) y `3978185` (ciclo HTTP de autenticación). No merge.
- Límite: es cobertura de auth sobre la API integrada, no prueba exhaustiva de ownership entre clientes ni despliegue productivo de email/OIDC. Sin merge ni cambios en frontend web.

## 2026-10-02 — Composición de seguridad Spring en integración

- Rama de corrección backend: `fix/backend-security-composition`, basada en `integration/backend-bootstrap` para corregir únicamente el conflicto de configuración encontrado al componer las ramas.
- Se retiró `BootstrapSecurityConfig`, una cadena temporal catch-all `denyAll` que coexistía con `identity.SecurityConfig` (JWT y reglas públicas/privadas). Spring abortaba con `UnreachableFilterChainException` por dos filtros `anyRequest()`; la configuración JWT queda como única cadena general.
- Maven Java 21: 45 pruebas, 0 fallos/errores/skips. PostgreSQL 18 nuevo: Flyway aplicó V1–V12 con `success=true`. Backend levantó en puerto temporal; HTTP health 200, OpenAPI 200, menú público 200 y cola Operativa privada 401 sin token.
- Sigue pendiente revisar las divergencias del modelo candidato respecto de V1–V12 y validar roles/ownership de todos los endpoints; este cambio sólo prueba el arranque y las rutas smoke citadas. No merge.

### Regresión automatizada de seguridad y startup

- Se añadieron dependencias test-scope de Testcontainers PostgreSQL/JUnit y `SecurityCompositionIntegrationTest`. El test crea una PostgreSQL18 aislada, arranca el contexto real (incluyendo Flyway) y verifica health/OpenAPI/menú público 200 y cola Operativa 401 sin token.
- `mvn test`: 46/46 pruebas; integration test ejecutó (no skip) con Testcontainers/Docker. Esto convierte el smoke del conflicto de filtros en una regresión automatizada. No cubre todavía login/ownership A-vs-B ni todos los permisos.

## 2026-09-26 — Reparto en ramas del backend

- Los worktrees `feature/backend-foundation`, `feature/backend-auth`, `feature/backend-api`, `feature/reservations`, `feature/availability`, `feature/ai` y `feature/payments` están sobre `3bbd0ed`; los paquetes se distribuyeron sin duplicar la aplicación Maven en ramas de dominio.
- El reparto inicial se committed/pushed por rama. Foundation contiene Maven/Spring/config/Compose/Nginx; auth identity/email; reservations/availability sus slices; AI y payments/FEL tienen puertos, mocks y tests.
- Después se añadieron localmente el registro de perfil Cliente, compatibilidad JDBC para timestamp JWT, solicitud/revisión de reserva y gestión auditada de capacidades. Maven verify combinado pasó 12/12; V1–V5 se aplicaron en PostgreSQL 18 efímero y el smoke HTTP/DB pasó. Estos cambios siguen sin commit en sus ramas; dependen de foundation + migraciones para integración.
- Ver [handoff](../project/BRANCH_HANDOFF.md) desde el worktree `feature/project-foundation` para el estado branch por branch y dependencias.

## 2026-09-25 — Primer core Spring verificable

- Se incorporó `apps/api`: Java 21/Spring Boot, endpoints de auth inicial, JWT de sesión WOK, challenge HMAC, refresh rotativo, Google verifier deshabilitado, evaluation preliminar de capacidad, service capabilities, puertos mock de Payment/FEL/AI y outbox email.
- Suite Maven: 12/12 JUnit. Imagen backend compiló; Spring arrancó con DB vacía Postgres 16 y Flyway validó/aplicó V1–V4. Health, OpenAPI y capabilities respondieron HTTP 200. Smoke de register respondió 202 y persistió user `PENDING_VERIFICATION`, rol `CLIENT` y email en outbox; código/verify y login todavía no se probaron end-to-end.
- Ajuste: SMTP requiere `wok.email.mode=smtp` y host; el modo por defecto es mock. Compose mantiene secretos requeridos y el perfil dev puede apuntar a Mailpit.
- Límite: auth no tiene pruebas HTTP/DB exhaustivas; faltan rate-limit por IP, RBAC completo/ownership por caso de uso, verificación Google real, reserva transaccional, catálogo/pedido/finanzas y seguridad CSRF/cookie web.
- Siguiente: seguir [backlog](../backend/BACKLOG.md) y [handoff](../project/BRANCH_HANDOFF.md); separar tareas bajo ramas acordadas con el equipo y abrir PRs a `development` tras actualizarlo.

## 2026-09-15 — Ajuste a Spring, rotación y bloque final protegido

- Base actual: el PM informa experiencia Java/Spring e indicación del ingeniero de usarlos; plan orientado a Spring Boot, Maven, Spring Security, JPA y Flyway con PostgreSQL. Versiones pendientes de revisar contra backend ya iniciado.
- Organización: Edgar sigue PM, SM rotativo; 3 web + 2 backend + 1 app iniciales. Una persona compartida backend/app no se cuenta como dos; transición a 2/2/2 requiere liberar frontend.
- Plazo: últimas 2–3 de las 5–6 semanas reservadas para seguridad, integración y ajustes. Plan incluye congelamiento al final de semana 2 o 3 según escenario; controles básicos desde semana 1.
- Corrección: el PM confirma que no ha habido fallos de React Native; las dudas son preventivas. Esta aclaración sustituye la interpretación pendiente de la entrada anterior.
- Entregables: plan backend/backlog revisados y [plan independiente de app Cliente](../mobile/CLIENT_APP_PLAN.md), con trazabilidad de vistas y estimación separada.
- Viabilidad: la carga anterior no se declara compatible con dos personas parciales y 2–3 semanas de construcción. Horas y avance implementado pendientes; requiere recorte/reestimación verificable.
- Estado observado: no se encontraron archivos Java/Maven/Gradle en esta rama; no se infiere ausencia de backend en otras ramas o repositorios.
- Verificación: revisión documental de calendario, stack, enlaces, estimaciones y formato. Sin instalación, cambios de aplicación ni operaciones Git de publicación.

## 2026-09-15 — Plan para seis integrantes y entrega en cinco o seis semanas

- Resultado: propuesta de arquitectura modular, corte P0 académico, calendario semanal, responsabilidades, backlog estimado, criterios de aceptación y comparación React Native/Expo/Flutter.
- Archivos: [entrada](../backend/README.md), [plan](../backend/DEVELOPMENT_PLAN.md), [backlog](../backend/BACKLOG.md).
- Contexto confirmado: seis integrantes y fecha prevista dentro de cinco o seis semanas; horas semanales, rúbrica y fallos móviles concretos pendientes.
- Fuentes: requisitos e historias externos, guías/código frontend, decisiones registradas, notas pertinentes del vault y documentación de diseño PostgreSQL localizada en la carpeta académica de Desarrollo Web.
- Límite: el diseño externo documenta 109 tablas sin ejecución en servidor; posteriores errores de E/S impidieron completar inspección directa de diagramas/DDL. Revisar antes de adoptar migraciones.
- Decisiones: tecnologías, asignación nominal y recortes son propuestas. Recomendación móvil: React Native con Expo, sujeta a prueba temprana Android/iPhone y revisión de cualquier implementación Flutter existente.
- Implementación: ninguna API, DB, proveedor o app conectada; sólo documentación. No se modificaron frontend ni registros previos de otros canales.
- Git: archivos nuevos preparados con rama local `feature/frontend-admin` y cambios previos presentes. Sin cambio de rama, commit, push, merge ni PR; publicación documental pendiente mediante rama de tarea desde `development`.
- Verificación: revisión de coherencia del plazo, capacidad y prioridades; comprobación de formato/enlaces al cerrar la preparación. No se ejecutan pruebas de aplicación por esta entrega documental.
- Siguiente paso: confirmar horas y rúbrica, resolver decisiones de los primeros dos días y refinar paquetes P0. La adopción técnica no se considera aprobada por existir el plan.

## 2026-09-28 — Configuración del issuer JWT

- Se configuró `WOK_AUTH_ISSUER` por ambiente y se fijó una URI reservada `.invalid` para desarrollo local. El valor anterior `wok-asian-food` no era un URL válido para `JwtClaimAccessor` y la validación de issuer de Spring Security.
- Docker Compose reenvía el ajuste al contenedor API. Producción debe definir el URL HTTPS canónico de identidad antes de emitir tokens; el placeholder no es una identidad productiva.
- Validación con las pruebas de identidad en una composición desechable de `feature/backend-foundation` y `feature/backend-auth` (Java 21, Maven; 5/5 pruebas unitarias aprobadas).
