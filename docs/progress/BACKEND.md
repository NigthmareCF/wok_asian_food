# Progreso de planificación backend

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
