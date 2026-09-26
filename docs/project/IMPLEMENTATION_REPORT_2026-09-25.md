# Reporte de integración — 2026-09-25

Este reporte distingue base ejecutable, mocks, diseño candidato y producto completo. El 2026-09-26 las ramas especializadas se actualizaron mediante fast-forward a `origin/development` `3bbd0ed`; el primer reparto quedó committed/pushed. Los slices posteriores detallados al final permanecen locales hasta concluir su revisión. La web de desarrollo responde en `0.0.0.0:3000`. La matriz de evidencia y el reparto están en [GAP_ANALYSIS.md](GAP_ANALYSIS.md) y [BRANCH_HANDOFF.md](BRANCH_HANDOFF.md).

## A — Auditoría

Se encontró web Next.js con tres canales y fixtures, 35 archivos de pruebas iniciales, sin app móvil, API Spring, Compose ni Nginx al inicio. El generador DB/ERD de 109 tablas y planes backend/móvil eran material local sin seguimiento en Git. Rama: `feature/frontend-admin`; árbol rastreado limpio antes de editar. La presencia de ruta, mock o SQL declarativo no se contó como función real.

## B — Cambios de requisitos

El alcance pickup de los planes antiguos, la app reducida, la decisión abierta de monorepo y el ERD tratado como definitivo quedaron `SUPERSEDED` por la instrucción vigente. Reservas y mesa digital exigen 3 h y evaluación posterior; las capacidades de servicio son independientes. Ver [decisiones](TECH_DECISIONS.md).

## C — Frontend

Se actualizó la guía y [brechas de cada canal](../frontend/CHANNEL_GAPS.md). En reservas web se retiró la fecha demo vencida, se añadió validación provisional de 3 h, se impidió presentar llegada posterior a 21:15 como solicitud válida y se aclaró que la confirmación es simulada. El resto de flujos continúa con fixtures hasta conectar API y permisos reales.

## D — Mobile

El [plan Cliente](../mobile/CLIENT_APP_PLAN.md) cubre anonymous/guest/auth/Google, menú, carrito, reservas, pickup, delivery, checkout, pagos/FEL, seguimiento, mensajes y perfil. No se creó app ejecutable; el móvil no contendrá backend ni modelo IA.

## E — Backend

`apps/api` introduce Spring Boot modular con auth base, health, OpenAPI runtime, motor de capacidad conservador, estimador de ocupación y puertos/mocks de integraciones. El servicio de capacidad aún no dispone de carga real de cocina, personal/inventario ni confirma reservas; no representa el motor completo. Ver [arquitectura](../backend/ARCHITECTURE.md) y [backlog](../backend/BACKLOG.md).

## F — Database

El generador declarativo pasó de 109 a 128 tablas candidatas y regeneró JSON/SQL/diccionario/ERD. V1 migra 23 tablas de identidad/core, V2 siembra referencias; V3 incorpora mesas/reservas. Sólo el subconjunto migrado es Flyway ejecutable. El resto del ERD sigue candidato. Ver [validación DB](../database/VALIDATION.md).

## G — Network

Compose y Nginx separan ingress, app, DB y red privada futura de IA. Hay configuración HTTP para LAN de desarrollo, override TLS y Mailpit dev; Docker no publica PostgreSQL ni Spring al host. [Infraestructura](../../infra/README.md) documenta split-horizon DNS, directa/túnel, VLANs, UPS, backup y ensayo WAN. La prueba física LAN sin WAN sigue pendiente.

## H — Security/Auth

La base registra CLIENT pendiente de verificación, códigos HMAC, password adaptativo, JWT corto y refresh opaco rotativo/revocable. Google OIDC real y cookie web segura/CSRF requieren implementación y pruebas adicionales. La referencia de diseño está en [auth](../security/AUTH_ARCHITECTURE.md); shell web sigue siendo permiso visual.

## I — Email/Domain

Outbox y worker evitan esperar SMTP en la transacción. Mailpit es sólo desarrollo. [Alternativas](../email/DELIVERY_OPTIONS.md) compara Stalwart, mailcow, Postal, relay y modelo híbrido con TCO cualitativo. Dominio, DNS/MX/SPF/DKIM/DMARC y proveedor productivo pendientes.

## J — Payments

Existe puerto/mock de pasarela y diseño de intents, 3DS, webhooks y conciliación; no existe cobro bancario productivo ni se almacena PAN/CVV. Pago mixto, propina y caja persisten como trabajo de slices financieros, no como función backend completa.

## K — FEL

Existe puerto/mock y modelo candidato para drafts, pool por atención, estados, artifacts y outbox. No hay certificador ni DTE real; `UNKNOWN` exige reconciliación. La validación fiscal de propina/pool sigue externa.

## L — Messaging/Meta

El ERD candidato y arquitectura contemplan canales separados, webhooks firmados, dedup, identidad externa, voz/STT y enlace opaco. No hay conexión productiva Meta ni STT real; las bandejas web siguen simuladas.

## M — AI

Hay gateway/mock y fallback iniciales; [arquitectura](../ai/ARCHITECTURE.md) exige runtime privado sin DB, Tool Broker, scope guard, human handoff, visión sin verificar pagos y entrenamiento sólo aprobado. Qwen3-VL-8B-Instruct se compara como candidato con Gemma 3 12B IT; no se inventaron mediciones ni se eligió GPU/runtime final.

## N — Draw.io

El [diagrama del sistema](../architecture/wok-system-architecture.drawio) tiene 38 páginas editables: Backend, AI, Auth, contextos/casos de frontend y los 27 flujos críticos. `infra/diagrams/network.drawio` cubre topología/rutas LAN-WAN. El [ERD](../database/erd/wok-complete-erd.drawio) se regeneró desde el generador. Son diseño, no prueba de despliegue.

## O — Tests

Web: 36 archivos y 219 pruebas pasaron en el último ciclo; lint y typecheck pasaron previamente. El puerto 3000 respondió HTTP 200. Backend: imagen Java 21 compilada y 12/12 pruebas JUnit pasaron. Spring arrancó contra PostgreSQL 16 vacío; Flyway validó y aplicó V1–V4. `/actuator/health`, `/api/v1/openapi` y `/api/v1/public/service-capabilities` respondieron 200. `POST /api/v1/auth/register` respondió 202 y persistió una cuenta efímera como `PENDING_VERIFICATION`, el rol `CLIENT` y correo `PENDING` en outbox. V1/V2/V3/V4 y pruebas SQL V1/V3/V4 también se ejecutaron en PostgreSQL 16 efímero. Compose base, dev y TLS parsearon con variables de prueba; Nginx validó sintaxis y Docker construyó la web. El modo local de correo queda mock y el override dev activa SMTP para Mailpit. En el corte original quedaban sin probar verify/login/refresh/reuse, ownership A/B, retries y concurrencia.

Verificación después de distribuir a worktrees (2026-09-26): `http://127.0.0.1:3000` respondió HTTP 200. El reintento de Vitest desde `feature/frontend-client` no pudo cargar `@vitejs/plugin-react`, ausente en el `node_modules` local compartido; no se instalaron dependencias. La validación previa de 219 pruebas corresponde al ciclo de implementación combinado antes de su separación por ramas.

## Validación funcional posterior — 2026-09-26

El backend combinado se compiló y probó con `mvn verify` en Docker sobre Java 21: 12/12 tests. En PostgreSQL 18 vacía, Spring aplicó Flyway V1–V5; el test SQL V5 pasó. Smoke HTTP: register 202, verify 200, login 200, creación de reserva 202, replay idéntico devuelve el mismo ID, mismo `Idempotency-Key` con otro payload devuelve 409, reserva bajo 3 h devuelve decisión `REJECT`, solicitud pendiente visible para Operativo/Admin, confirmación manual 200 con motivo, repetición obsoleta 409, historial y audit log persistidos. Cambio de capacidad Admin persistió evento y audit log; expectedVersion viejo devolvió 409. Todo se ejecutó con usuarios sintéticos en DB temporal.

Los cambios que habilitaron este recorrido están sin commit todavía en `feature/reservations`, `feature/availability`, `feature/backend-auth`, `feature/database-migrations`, `docs/database`, `docs/api` y `feature/project-foundation`. No se probó refresh/reuse HTTP, ownership A/B, concurrencia, browser UI conectada ni infraestructura física. Los tokens/secrets usados fueron de prueba y no se guardaron en el repo.

## P — Blockers reales

Menú/recetario real; dominio y método de exposición pública; proveedor de pagos; certificador FEL; email productivo; credenciales/proceso Google; benchmark/modelo/GPU; cámaras; políticas de penalización y decisión de realtime. Ninguno bloquea puertos, mocks, contratos o pruebas locales. Tampoco está demostrado el ensayo físico de pérdida/reconexión WAN ni la separación de usuario DB de migración/aplicación.

## Q — Próximos pasos por dependencia

1. Añadir pruebas de integración HTTP/DB para auth, ownership y refresh/reuse; definir roles/permisos completos y límites/rate control.
2. Conectar estado de servicio y evaluación de reservas a UI sin fallback silencioso a fixtures; implementar confirmación con snapshot de carga y transacción.
3. Recibir menú real, crear seed de categorías/productos/modificadores y validar precios/stock en backend.
4. Entregar solicitudes pickup/delivery, KDS, inventario/producción y seguimiento entre web/app.
5. Implementar cuenta/pagos mixtos/caja, FEL, Meta/correo y AI Tool Broker por puertos con pruebas de idempotencia y seguridad.
6. Ejecutar trabajo según [BRANCH_HANDOFF.md](BRANCH_HANDOFF.md): canal por rama y slices de backend/DB/infra coordinados desde `development`; levantar stack en LAN, practicar corte WAN, restauración y reconciliación; después decidir exposición WAN/proveedores/hardware con evidencia.
