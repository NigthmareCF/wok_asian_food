# Informe de auditoría e implementación — 2026-09-28

Alcance: inspección read-only de ramas, workspaces y checkout `feature/frontend-admin`; ejecución de verificaciones actuales de Web; preparación de documentos para el siguiente ciclo. No se integraron branches ni se completó el backend/producto. La auditoría sirve como baseline, no como aceptación del sistema.

## A — Auditoría

Checkout: `feature/frontend-admin`, HEAD `1b6f146`, limpio al inicio. Versiones declaradas: Node 26.8.1 / npm 12.0.2, Next 16.3.4, React 19.2.8, TypeScript 6.0.3. Web contiene los tres portales con abundantes fixtures y seis rutas API/BFF. En esta rama no están `apps/api`, `apps/mobile`, `database/` ni `infra/`; existen en referencias especializadas no integradas. El contexto local del vault resume una integración efímera anterior, sin sustituir ejecución actual.

## B — Cambios de requisitos

El producto completo y la meta ≥90 % end-to-end sustituyen como objetivo total el plan de pickup, el recorte móvil y las fases anteriores. Se fijaron en `TECH_DECISIONS.md` los requisitos del mega prompt: servidor local, continuidad LAN, 3 horas de anticipación, canales por capacidad independiente, una API y Expo Cliente. Estados anteriores incompatibles se clasifican `SUPERSEDED`. JDBC/JPA y los proveedores externos siguen abiertos.

## C — Web

Web tiene rutas Cliente/Operativo/Admin. En `feature/frontend-admin` los módulos generales usan fixtures; BFF conecta sesión, usuarios/roles y capacidades. `origin/feature/frontend-client` (`2f7ee1a`) agrega proxy BFF y UI de resumen público de capacidades; su estado se degrada a no disponible si API falta y depende del endpoint backend. La misma rama añade orientación local de 3 horas, explícitamente UX-only: el formulario de reserva sigue usando fixture y simula envío. `origin/feature/frontend-operational` (`248df38`) sólo actualiza guía, sin código funcional. Smoke conectado a API/Postgres no verificado. Reporte de pruebas de este checkout en O.

## D — Mobile

`apps/mobile` no existe en el checkout actual. `origin/feature/mobile-shell` tiene Expo 57/React Native, navegación, login/registro/verificación/refresh/logout y solicitud de reserva. Menú es placeholder; no hay carrito/pedidos/checkout/pagos/FEL/mensajes/historial integrados. Exports Android/web reportados son bundles, no APK/IPA ni prueba física. App Cliente completa sigue como trabajo principal y con branch separado.

## E — Backend

`origin/feature/backend-foundation` aporta Spring Boot Java 21/POM/Docker/health/OpenAPI base; `backend-auth`, `backend-api`, `reservations`, `availability` y `payments` añaden slices JDBC. Auth/reset/roles, reservas idempotentes, capacidades, caja y mocks de gateway muestran avance parcial. Sin branch de integración limpio actual ni E2E reejecutado. La base de código inspeccionada usa JDBC; JPA sigue candidato. Las APIs parciales requieren migraciones compatibles y pruebas automáticas de autorización, ownership, refresh reuse y concurrencia.

## F — Database

`feature/database-schema` aporta modelo/DDL/generadores de 128 tablas candidatas; `feature/database-migrations` tiene V1–V6, selección inicial de 35 tablas. Se recuperaron SQL/diseño/migraciones/tests y documentación. La validación estática actual terminó en `FAIL`: el manifiesto reporta divergencias entre modelo, SQL, diccionario, ERD y generador, además de diferencia de V3 frente a la fuente declarativa. El validador contó 1,348 columnas, 342 FK simples, una FK compuesta, 208 índices explícitos y 17 páginas; no encontró `pglast`, no ejecutó SQL ni conectó a DB. Son artefactos candidatos de cortes distintos; reconciliar su procedencia antes de regenerar o aplicar.

## G — Network

`feature/backend-foundation` contiene Compose, Nginx HTTP/TLS, redes de aplicación/datos, Mailpit dev y diagrama de red. Documento contempla DNS split-horizon, VLANs y UPS. Docker daemon denegó acceso al CLI sandbox; topología desde otro dispositivo, corte WAN, recuperación outbox, backup/restore y aislamiento físico no verificados en este turno.

## H — Security/Auth

BFF actual utiliza cookies HttpOnly/SameSite y llama una API configurada. Branch `backend-auth` contiene auth JDBC, challenge y token workflows parciales. Google verificador está inactivo; vinculación de identidad y pruebas automáticas HTTP/DB permanecen parciales. Revisar sesión/cookies contra API integrada y definir protección CSRF/rate limit/ownership por recurso.

## I — Email/Domain

Rama de auth documenta outbox y mock/SMTP adapters. SMTP productivo, DNS de dominio/MX/SPF/DKIM/DMARC y entregabilidad no probados. Se puede avanzar templates/outbox/Mailpit/mock.

## J — Payments

`feature/payments` tiene caja/ledger y mocks/puertos `PaymentGateway`; no acredita pasarela bancaria, 3DS, terminal ni reconciliación con ventas completas. Nunca se almacenan PAN/CVV. Decisión de proveedor externa.

## K — FEL

Modelo/docs y `FelGateway` mock contemplan separar documento fiscal, pago, nota de crédito y reembolso. No hay certificador ni DTE real. Falta automatización de emisión incierta/reconciliation y validación de política fiscal antes de producción.

## L — Messaging/Meta

Frontend contiene bandejas y fixtures; el diseño propone providers/webhooks/dedup/identidad/canales. APIs oficiales Meta, firma webhook, dedup real, voz/STT y entregabilidad no conectados.

## M — AI

`feature/ai` aporta Gateway, Broker y mock/test. El broker inicial debe refactorizarse para que tools pasen por casos de uso autorizados y ownership, evitando acceso JDBC que salte el dominio. Runtime/modelo/GPU no están activos; IA no puede aprobar voucher ni accede directamente a DB.

## N — Draw.io

La rama `docs/architecture` trae Draw.io sistema y generador; el informe remoto refiere 38 páginas. `infra/diagrams/network.drawio` en backend foundation; ERD de 128 tablas en docs database. Diagramas se recuperaron. No se renderizaron ni inspeccionaron visualmente todas las páginas en este turno; no son evidencia de código o red activa.

## O — Tests

Verificaciones actuales ejecutadas en este checkout: `npm run test` → 39 archivos/228 pruebas; `npm run typecheck`; `npm run lint`; `npm run build:web`, todos aprobados. Se restauró el cambio autogenerado de Next en `apps/web/next-env.d.ts`. `python3 database/design/validate.py` se ejecutó como análisis estático y falló por discrepancias documentales/manifiesto (detalle en F y `docs/database/VALIDATION.json`); no es prueba SQL.

No ejecutados ahora: Maven/JUnit, Flyway, scripts SQL, integración HTTP de API, Expo checks, E2E cruzado, Compose, Nginx config test, prueba de red/dispositivos. Informes históricos registran resultados efímeros anteriores (12/12 JUnit, migraciones V1–V6, varios HTTP smoke); no se presentan como revalidación actual.

## P — Blockers

Acceso del entorno al Docker daemon/Postgres; branch compuesta API+DB+UI+app; proveedor de pago y certificador; dominio/exposición pública; OAuth Google; SMTP; menú/recetario oficiales; decisión JDBC/JPA; benchmark/GPU/modelo; cámaras/dispositivo; eventos realtime; reglas faltantes del negocio. Los mocks y puertos sí pueden progresar mientras llegan estos insumos.

## Q — Siguientes pasos por dependencias

1. Leer `INTEGRAL_DELIVERY_PLAN.md`, `GAP_ANALYSIS.md`, el handoff y guías; confirmar origin/development actual y branches/commits de trabajo con equipo. Sin mezclar ramas a ciegas.
2. Obtener Docker/PostgreSQL accesible, integrar schema + V1–V6 + API foundation, ejecutar migración desde cero y pruebas existentes; resolver JDBC/JPA y discrepancias de contrato.
3. Endurecer identidad/RBAC/ownership; ejecutar registro/verificación/login/refresh/reuse y prueba A/B sobre DB.
4. Integrar capacidad/ocupación/reservas y capacidades de servicio; después catálogo/menu data y flows request→accept→KDS para web/app/operativo.
5. Conectar inventario/producción/compras; luego cuenta/caja/pagos/FEL; paralelo completar Web Cliente/Operativo/Admin y app Expo por sus owners.
6. Añadir mensajería/email/Meta, IA gateway/tools/fallback, voice/vision según adapters y bloqueos externos.
7. Probar Compose/Nginx, DNS strategy, backup/restore, corte WAN conservando LAN, printer/KDS y móvil Android/iOS; actualizar matriz y calcular cobertura verificable.

La ejecución y el objetivo 90 % se detallan en [INTEGRAL_DELIVERY_PLAN.md](INTEGRAL_DELIVERY_PLAN.md). No se publicó código, no se hizo commit/push/merge y no se alteraron referencias Git.
