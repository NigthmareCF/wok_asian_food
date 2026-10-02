# Análisis de brechas del sistema WOK

Fecha de corte: 2026-09-25. Rama observada: `feature/frontend-admin`. Esta matriz compara el producto requerido con evidencia ejecutable; una ruta, fixture, tabla candidata o documento no acredita un caso de uso. El árbol rastreado estaba limpio al inicio, pero `database/`, `docs/database/`, `docs/backend/`, `docs/mobile/` y `docs/project/SYSTEM_MASTER.md` ya existían como archivos locales sin seguimiento. No se sustituyeron ni se publicaron.

## Evidencia de auditoría

- Web: Next.js 16.3.4, React 19.2.8 y TypeScript 6.0.3 en `apps/web`; rutas Cliente, Operativo y Administrativo, componentes con estado en memoria y pruebas Vitest. `src/data/fixtures/` contiene datos de demostración. `src/shared/lib/api-client.ts` ofrece un transporte genérico, pero no se observó integración de los recorridos con una API de negocio real. Los permisos del shell son visuales.
- App: no existía `apps/mobile` al corte. `docs/mobile/CLIENT_APP_PLAN.md` describía un recorte de pedidos para recoger, no el Cliente completo.
- Backend: no existía `apps/api`, `pom.xml`, migraciones Flyway ni proceso Spring ejecutable al corte.
- DB: `database/design/generate.py` genera `model.json`, SQL, diccionario y ERD candidato de 109 tablas. El DDL no es una migración aplicada ni una DB funcionando. PostgreSQL local y Maven no estaban instalados; Docker CLI sí existe, pero el acceso al daemon debe verificarse.
- Infraestructura: no había Compose, Nginx, DNS ni prueba LAN/WAN en el repositorio al corte.
- Requisitos: 21 épicas, 308 historias, RN-001–145 y RT-001–076 en los archivos originales. `SYSTEM_MASTER.md` es una consolidación de fuentes, no una prueba de implementación. El prompt vigente del propietario prevalece sobre el recorte de los planes del 15 de septiembre.

## Matriz de trazabilidad

Las columnas **Web**, **App**, **Backend**, **DB**, **Diagrama** y **Tests** indican evidencia al inicio de esta intervención. `vista` significa UI con datos simulados; `candidato` significa diseño declarativo sin migración aplicada; `—` significa ausencia. El estado se actualizará sólo con verificaciones observables.

| Requirement                                                     | Web                         | App | Backend | DB                  | Diagram             | Tests       | Status           | Required Change                                                                            |
| --------------------------------------------------------------- | --------------------------- | --- | ------- | ------------------- | ------------------- | ----------- | ---------------- | ------------------------------------------------------------------------------------------ |
| Identidad, registro, verificación, reset, JWT, refresh y Google | auth visual                 | registro/verificación/login/refresh parcial | IAM y sesión parcial | IAM V1 | ERD candidato | API smoke + lint/typecheck | IMPLEMENTED_PARTIAL | Integrar reset/Google, renovación robusta, linking y pruebas de seguridad                  |
| Roles, permisos, ownership y sesiones                           | BFF Admin con cookies HttpOnly; lista y grant/revoke de roles | — | roles Admin list/grant/revoke auditados; demás permisos y ownership parciales | IAM V1 | ERD candidato | smoke HTTP RBAC + tests BFF; falta E2E conectado | IMPLEMENTED_PARTIAL | Probar UI contra API+Postgres; completar ownership por recurso, permisos granulares y automatizar A/B |
| Menú real y disponibilidad                                      | catálogo fixture            | —   | —       | catálogo candidato  | ERD candidato       | UI          | BLOCKED_EXTERNAL | Recibir menú real; después seed y cálculo backend sin inventar recetas                     |
| Carrito, pickup, delivery y pedidos                             | rutas y estado local        | —   | —       | pedidos candidato   | ERD candidato       | UI parcial  | MOCK_ONLY        | Contratos, revalidación, idempotencia, ownership y flujo operativo persistente             |
| Reservas y mesa web/app con 3 h mínimas                         | formulario Cliente con 3 h; UI no conectada | solicitud conectada; 3 h UX | creación API autenticada, idempotencia y decisión humana | V1–V5 | ERD candidato | smoke HTTP/DB + exports bundle | IMPLEMENTED_PARTIAL | Completar alternativas/capacidad viva/asignación sin solape y recorrido E2E App             |
| Capacidad, ETA y ocupación                                      | indicaciones demo           | —   | evaluación preliminar + solicitud/revisión | reserva candidata | ERD candidato | unit + smoke HTTP | IMPLEMENTED_PARTIAL | Conectar inventario/carga/mesas y asignación transaccional; calibrar tiempos reales          |
| Estados independientes de servicio                              | Admin A-13: lectura/cambio BFF; Cliente C-02: lectura pública BFF | — | lectura pública + cambio Admin versionado/auditado en rama `feature/availability` | V1/V2: tabla y seeds en `feature/database-migrations` | ERD candidato | 12 pruebas UI/BFF focalizadas + smoke HTTP/DB manual | IMPLEMENTED_PARTIAL | Integrar primero DB/API; probar ambos portales contra API+Postgres; añadir overrides programados, UI Operativa y health externo |
| Mesas, cocina, KDS y producción                                 | rutas interactivas demo     | —   | —       | candidato           | ERD candidato       | UI parcial  | MOCK_ONLY        | Persistencia, transacciones, revisión de comanda y sincronización                          |
| Inventario, compras y recetas                                   | rutas demo                  | —   | —       | candidato           | ERD candidato       | UI parcial  | MOCK_ONLY        | Movimientos, bloqueo de recursos, BOM versionado y pruebas de concurrencia                 |
| Cuentas, pagos mixtos, propinas y caja                          | rutas demo                  | —   | caja: apertura/ledger de efectivo/arqueo/cierre; ventas y propinas aún no conectadas | V6 caja; resto candidato | ERD candidato | test SQL V6 + smoke HTTP | IMPLEMENTED_PARTIAL | Conectar UI; originar ventas desde pedido/pago, pagos mixtos, propinas y conciliación completa |
| FEL y división del pool facturable                              | precuenta demo              | —   | —       | factura candidata   | foco de facturación | —           | MOCK_ONLY        | Workspace de drafts, `FelGateway`, outbox, artifacts y reconciliación                      |
| Email de verificación, reset y avisos                           | formularios demo            | —   | —       | parcial candidato   | —                   | —           | DOCUMENTED_ONLY  | `EmailProvider`, outbox, adapter mock y transporte productivo por decidir                  |
| WhatsApp/Instagram/Messenger/chat/voz                           | bandejas demo               | —   | —       | messaging candidato | ERD candidato       | UI parcial  | MOCK_ONLY        | Webhooks oficiales, identidad externa, dedup, STT y handoff                                |
| IA aislada, tools, scope guard, vision                          | admin y visión demo         | —   | —       | IA candidata        | ERD candidato       | UI parcial  | MOCK_ONLY        | Gateway aislado, mock, autorización de tools, fallback y benchmark                         |
| App Cliente completa                                            | —                           | App Expo; auth y reserva parciales; menú sin catálogo | auth/reservas parciales | candidato | navegación | lint/typecheck/export Android+web | IMPLEMENTED_PARTIAL | Implementar menú real, pedidos, checkout, pagos, FEL, mensajes, perfil y pruebas móviles    |
| API OpenAPI `/api/v1`                                           | transporte genérico sin flujos conectados | — | auth, roles Admin, reservas, capacidades de servicio y caja parciales | V1–V6 | OpenAPI runtime | mvn verify + smoke HTTP/DB | IMPLEMENTED_PARTIAL | Completar casos de uso, autorización/ownership, contrato publicado y pruebas de compatibilidad |
| LAN first, Nginx, Docker y health externo                       | Dockerfile web y ejecución LAN verificados | App Expo configurada para API por IP LAN | Compose Nginx→Web/API; Spring Actuator core health | PostgreSQL interno sin puerto host en Compose; Flyway V1–V6 | Nginx/Compose documentados; topología física pendiente | API+Postgres arrancaron, Flyway V1–V6 y health 200; Home/Metro/API responden desde IP LAN local; falta validar desde otro dispositivo y cortar WAN | IMPLEMENTED_PARTIAL | Resolver exposición WAN y DNS split-horizon, topología/VLAN/UPS, health por integración y ensayos físicos de pérdida/recuperación sin duplicados |
| Auditoría, reportes y trazabilidad                              | vistas demo                 | —   | —       | candidato           | ERD candidato       | UI parcial  | MOCK_ONLY        | Eventos persistidos y consultas autorizadas con origen verificable                         |

## Conflictos y decisiones sustituidas

| Decisión anterior                                                        | Estado     | Razón y cambio exigido                                                                                                                                    |
| ------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend limitado a un corte pickup de 5–6 semanas en los planes antiguos | SUPERSEDED | El propietario exige plan y arquitectura para el alcance completo; cada entrega incremental debe distinguirse del producto total.                         |
| App Cliente limitada a pickup y seguimiento                              | SUPERSEDED | La app debe cubrir todo el canal Cliente, aunque se implemente en slices.                                                                                 |
| Monorepo/repo separado como decisión abierta                             | SUPERSEDED | El repositorio actual se usa como workspace integrado con `apps/web`, `apps/api` y futuro `apps/mobile`; una separación futura requeriría decisión nueva. |
| PostgreSQL/ERD de 109 tablas como esquema final                          | SUPERSEDED | Es diseño candidato; cambios nuevos deben partir del generador y validarse en migraciones y DB real.                                                      |
| Estado único del restaurante suficiente para todos los servicios         | SUPERSEDED | Se requieren capacidades independientes por modalidad con override auditado.                                                                              |
| Cumplir horario basta para aceptar reserva                               | SUPERSEDED | 3 h mínimas y evaluación de capacidad son condiciones separadas.                                                                                          |

## Regla de avance

Una fila pasa a `IMPLEMENTED_VERIFIED` sólo al demostrar el caso de uso sobre API + PostgreSQL real, con autorización, pruebas y, cuando aplica, UI conectada. `MOCK_ONLY` seguirá visible hasta entonces. El desarrollo no espera al menú, recetario, dominio, pasarela, certificador, email productivo, GPU o cámaras: se construyen puertos, mocks y contratos sin afirmar integración productiva.

## Evidencia posterior a la auditoría — 2026-09-25

La matriz conserva el corte inicial para canales aún simulados; reservas, capacidad y servicios reflejan además los slices API/DB del 2026-09-26. Estado actual contrastado: web `IMPLEMENTED_PARTIAL` (BFF de roles Admin, capacidades Admin/Cliente conectadas por contrato pero aún no desplegadas juntas; pedidos, reservas web, catálogo y resto de los canales siguen mayormente en fixtures); autenticación `IMPLEMENTED_PARTIAL` (registro/verificación/login/refresh y cookie BFF Admin; faltan reset/Google/linking, suite HTTP/DB y refresh reuse); Google OIDC `BLOCKED_EXTERNAL`; DB `IMPLEMENTED_PARTIAL` (V1–V6 probadas en Postgres efímero; el modelo amplio sigue candidato); reservas `IMPLEMENTED_PARTIAL` (API idempotente, reglas mínimas y decisión humana; web Cliente y alternativas/capacidad viva pendientes); service capability `IMPLEMENTED_PARTIAL` (API pública y cambios Admin versionados/auditados; UIs Cliente/Admin en ramas separadas, sin prueba E2E conectada); payment/FEL/Meta `MOCK_ONLY`; email `IMPLEMENTED_PARTIAL` sin ciclo real de entrega/retry verificado; AI `IMPLEMENTED_PARTIAL` con gateway/mock, sin runtime ni autorización completa de herramientas; mobile `IMPLEMENTED_PARTIAL` sin pedidos ni prueba física; LAN/WAN `IMPLEMENTED_PARTIAL` sin ensayo físico de corte WAN.

Verificación reproducible del corte integral: web 223/223 Vitest, lint, typecheck y build de producción; backend 12/12 JUnit; API compilada en imagen Java 21; Flyway V1–V4 y constraints V1/V3/V4 ejecutadas en Postgres 16 efímero; puerto frontend 3000 devuelve HTTP 200. El BFF Admin tiene pruebas de rutas, pero su instancia local responde 503 sin `WOK_API_BASE_URL`; falta E2E conectado contra API+Postgres. Estas pruebas no cubren retries externos ni dispositivos reales. El primer smoke Flyway se ejecutó por error en la misma base donde ya se habían aplicado scripts SQL directamente y falló al recrear `wok`; se aisló una DB vacía para el smoke correcto. No se modificó ni borró la DB preexistente.

## Evidencia posterior — 2026-09-26

Las ramas especializadas recibieron commits/push del handoff. Después se amplió localmente `feature/reservations`, `feature/availability`, `feature/backend-auth` y `feature/database-migrations`: endpoint autenticado para crear reservas con clave idempotente y hash de payload; lista/decisión operativa con control de versión e historial; cambios auditados de capacidades Admin; perfil Cliente durante registro; JWT valida sesión con parámetro JDBC compatible; Flyway V5 agrega requester, hash y ocupación mínima.

Validación combinada en Docker Java 21/Maven: `mvn verify`, 12/12 tests. PostgreSQL 18 vacío ejecutó V1–V5; prueba SQL V5 pasó. Smoke HTTP con datos sintéticos: register 202, verify 200, login 200, reserva 202, replay idéntico 202 con mismo ID, mismo key/datos distintos 409, petición bajo 3 h `REJECT`, pending operativo 200, confirmación 200 con row_version 2, decisión obsoleta 409; evento e historial/audit verificados por SQL. Capacidad de servicio: lectura Admin 200, cambio auditado 200, versión obsoleta 409.

Límites al corte de implementación de API: estos slices aún requieren integración frontend, suite automatizada HTTP/DB, motor de capacidad completo, pagos y pruebas físicas. En el primer intento de Vitest de `feature/frontend-client` no resolvió `@vitejs/plugin-react`; se reutilizaron los paquetes ya existentes del workspace sin instalar dependencias y los tests posteriores pasaron.


Slice caja — 2026-09-26: V6 instala `cash_registers`, `cash_sessions`, movimientos firmados y conciliación final; test SQL en PostgreSQL 18 valida saldo, unicidad de turno y diferencia. API compilada con `mvn verify` (12/12); smoke HTTP probado con usuario Operativo sintético: apertura, ledger Q100 + Q20 − Q12 = Q108, replay idempotente, alteración de misma clave 409, cierre Q105 y diferencia −Q3, cierre obsoleto/movimiento post-cierre 409. La venta y propina aún no se integran a este libro.

RBAC Admin — 2026-09-26: API de búsqueda paginada y grant/revoke OPERATIONAL/ADMIN con motivo, expectedVersion, auditoría y protección del último ADMIN activo. HTTP efímero verificó anonimato 401, grant/revoke, stale 409, last-admin 409 y CLIENT reservado al registro 400. Posteriormente, `feature/frontend-admin` conectó lista y cambios de rol mediante BFF con 228 pruebas Vitest, typecheck y lint aprobados; sigue faltando la prueba E2E conectada y automatización HTTP/DB de seguridad.

App Cliente — 2026-09-26: commit `bda29e1` publicado en `feature/mobile-shell`. Expo SDK 57/React Native incluye navegación Inicio/Menú/Reservas/Mi cuenta; conecta registro, verificación, login, refresh rotativo almacenado con SecureStore, logout y `POST /api/v1/client/reservations` con idempotencia. El cliente valida tres horas como ayuda UX; backend vuelve a evaluar capacidad y toda solicitud sigue pendiente de decisión humana. `npm run lint --workspace mobile`, `npm run typecheck --workspace mobile`, `npx expo export --platform android` y `npx expo export --platform web` pasaron. Los exports son bundles, no APK ni validación física. Catálogo real, pedidos, pagos, mensajería, historial y pruebas en dispositivos siguen pendientes. Esta entrega no aproxima por sí sola el sistema al 90%.

## Interfaces de capacidades — 2026-09-26

- `feature/frontend-admin` (`f729d83`) añade a A-13 el panel Admin para leer las capacidades del backend y cambiar estado con motivo, `expectedVersion` y request ID. El API conserva `ADMIN`, control de versión y auditoría.
- `feature/frontend-client` (`2f7ee1a`) conecta el resumen C-02 con `GET /api/v1/public/service-capabilities` mediante BFF same-origin; sanitiza a código/estado y no reutiliza un estado demo si el API falla.
- Cliente: 7 pruebas focalizadas, lint, typecheck y build Webpack aprobados. La corrida completa dio 226/227 por una aserción temporal preexistente de `staff-schedule.test.tsx`; esa suite aislada pasó 12/12. Admin: 228/228, lint, typecheck y build Webpack en worktree aislado aprobados.
- Ambos BFF requieren `WOK_API_BASE_URL`. El Admin local devolvió 503 sin esa variable; no se probó E2E contra una API/Postgres vivos. Deben integrarse/desplegarse `feature/database-migrations` antes de `feature/availability`, y después los portales. La interfaz no afirma integración productiva.

## Auditoría del checkout y referencias remotas — 2026-09-28

### Evidencia directa del workspace

- Rama: `feature/frontend-admin`, HEAD `1b6f146`, upstream `origin/feature/frontend-admin`. `git status` estaba limpio al comenzar. No se cambió de rama ni se editaron ramas protegidas.
- Web declara Next.js 16.3.4, React 19.2.8, TypeScript 6.0.3. Inventario medido: 266 archivos TS/TSX en `apps/web/src`, 23 fixtures y 6 handlers API/BFF. Una ruta o un componente interactivo no se marca implementado por ese conteo.
- Funciones conectadas observables: BFF same-origin de login/logout, cookies de sesión y renovación; búsqueda de usuarios/grants de roles; lectura/modificación administrativa de capacidades de servicio. La lista de usuarios es lectura y algunos canales/capacidades dependen de backend alojado en otra rama. No se ejecutó E2E Web → API → PostgreSQL en esta revisión.
- Las demás áreas Web consumen fixtures/providers de estado. Ejemplos: catálogo, checkout, órdenes, mesas, reserva, cocina, delivery, pago/caja, inventario, producción, compras, mensajería, IA/visión y reportes. Mostrar mocks de forma explícita.
- Pruebas actuales ejecutadas: `npm run test` 39 archivos/228 pruebas; `npm run typecheck`, `npm run lint` y `npm run build:web` aprobados. `next build` reescribió `apps/web/next-env.d.ts`; se restituyó a HEAD. Estas pruebas son Web aislada, no integración completa.
- No están en el árbol `apps/api`, `apps/mobile`, `database/` ni `infra/` al iniciar auditoría. `apps/web/src/shared/lib/api-client.ts` y `realtime-client.ts` son transportes/contratos; no implican que flujos de negocio estén conectados.

### Referencias especializadas revisadas sin checkout

| Ref observada | Artefactos hallados | Evidencia y límite |
|---|---|---|
| `origin/feature/backend-foundation` (`655a512`) | `apps/api` Spring Java 21, pom Docker/config; Compose, Nginx, `infra/README.md`, red | Foundation/configuración candidata; build previo citado en informe. No incluida en esta rama. |
| `origin/feature/backend-auth` (`8266abe`) | Auth JDBC, challenges, tokens, roles Admin, email outbox/adapters | Código parcial. Google verifier es unavailable; requiere migraciones integradas; tests HTTP seguridad/ownership y refresh reuse incompletos. |
| `origin/feature/backend-api` (`fb97b35`) | Formato de error y OpenAPI base | Contrato inicial; integrar con API real. |
| `origin/feature/reservations` (`e173913`) | Estimador/capacidad, reserva request idempotente/revisión manual | Slice parcial; evaluación usa supuestos estáticos, sin inventario/cocina/personal/mesas vivas. |
| `origin/feature/availability` (`19c5c98`) | Lectura pública y control Admin de capacidades con audit/version | JDBC requiere migración y tests integrados. UI Client/Admin vive en ramas distintas. |
| `origin/feature/payments` (`c7903a0`) | Sesiones/ledger/conciliación de caja, `PaymentGateway`/`FelGateway` y mocks | Caja con código parcial; venta/tips aún no conectados; los gateways no son proveedores reales. `feature/cash` es una referencia anterior. |
| `origin/feature/database-schema` (`46e61e3`) | Generador, modelo y DDL candidato de 128 tablas/17 páginas | Diseño generado; distinta cobertura a migraciones; tabla no equivale a función. |
| `origin/feature/database-migrations` (`f06673d`) | Flyway V1–V6, 35 tablas en corte inicial, tests SQL | Migraciones versionadas disponibles en ref; no se ejecutaron en esta revisión. Historial del proyecto reporta ejecuciones temporales previas. |
| `origin/docs/database` (`4675af8`) | Diccionario, ERD, reglas, matriz, hallazgos y validación | Reincorporado como documentación. `VALIDATION.json` es corte estático y puede no reflejar ejecución reportada en README/MD; revisar consistencia de evidencia. |
| `origin/feature/mobile-shell` (`bda29e1`) | Expo 57, navegación, auth/register/verify/login/refresh, reserva | Menú placeholder; no carrito, pedidos/checkout/pagos/FEL/chat/historial completos. No pruebas físicas; export bundle no es APK. No está en rama actual. |
| `origin/feature/ai` (`884c86e`) | AI Gateway/Provider/Mock/ToolBroker y unit tests | Mock únicamente. Broker inicial consulta capacidades/horarios directamente mediante JDBC; revisar frontera de use case/ownership antes de confiar tools. Sin runtime/GPU. |
| `origin/docs/architecture` (`1c680bf`) | `docs/architecture/wok-system-architecture.drawio`, generador; informe refiere 38 páginas | Diagrama editable explicativo; no prueba el sistema. Su fuente se recuperó a la carpeta docs actual. |
| `origin/feature/project-foundation` (`f5d07b4`) | GAP, plan/handoff, decisiones, reporte, SYSTEM_MASTER | Documentación histórica preservada; no se trata como código desplegado. |

Las pruebas remotas detalladas de Maven, JUnit, PostgreSQL/Flyway, HTTP y Expo en los reportes `2026-09-25/26` son evidencia documental de una integración efímera pasada. En esta auditoría no se reejecutaron desde una composición limpia. Java 21 está disponible; Maven y `psql` nativo no. Docker CLI falla al acceder a daemon con permiso denegado. Las migraciones/tests de PostgreSQL requieren un entorno Docker accesible.

### Ajuste de estados y del plan

1. Web se mantiene `IMPLEMENTED_PARTIAL`: 228 pruebas y build acreditan calidad de parte de la UI; BFF users/roles/capabilities son integración parcial; otros flujos mayormente `MOCK_ONLY`.
2. Móvil permanece `IMPLEMENTED_PARTIAL` únicamente en la ref Expo; dentro de `feature/frontend-admin` está ausente. Contar cada HU aplicable, no el shell.
3. Backend, migraciones, infraestructura e IA están repartidos entre refs. Estado del producto combinado: `IMPLEMENTED_PARTIAL`; archivos sólo remotos no pasan a implementados en este checkout.
4. Pagos/FEL reales, Meta, Google OAuth activo, SMTP productivo, runtime IA/GPU, cámara y proveedor real: `MOCK_ONLY`/`BLOCKED_EXTERNAL` según exista contrato/mock; nunca proveedor productivo.
5. El diseño objetivo de 128 tablas y Flyway V1–V6 (35 tablas) son distintas coberturas. SQL completo es candidato; no se aplica al servidor. La matriz no certifica reglas de negocio.
6. Los planes de pickup/app reducida quedan `SUPERSEDED` como alcance total. El [plan integral vigente](INTEGRAL_DELIVERY_PLAN.md) persigue ≥90 % de historias end-to-end y 100 % de reglas críticas; se calcula sólo tras evidencia, no ahora.

### Bloqueos de verificación presentes

- Docker daemon/PostgreSQL no accesibles desde sandbox para revalidar Flyway y suites SQL/HTTP.
- No existe una branch compuesta limpia para backend + migraciones + Web + Expo; integrar mediante PR y smoke reproducible.
- Sin proveedor/credenciales: pagos, FEL, OAuth Google, correo productivo y Meta; sin datos reales aprobados: menú/recetas; sin benchmark: runtime/GPU; sin política/dispositivo: cámaras.
- Aún sin prueba física de WAN corte manteniendo LAN, impresora/KDS real, otro dispositivo de red o instalación Android/iOS. Health multi-integración no verificado desde el entorno integrado.

Un requisito se marca `IMPLEMENTED_VERIFIED` sólo después de que el caso de uso opere sobre API y PostgreSQL integrados, se autorice correctamente, pase pruebas requeridas, conecte sus superficies aplicables y tenga evidencia en el commit/entorno indicado. Ver [estado actual](CURRENT_STATE.md), [reporte de auditoría actual](IMPLEMENTATION_REPORT_2026-09-28.md), [decisiones vigentes](TECH_DECISIONS.md), [reporte histórico](IMPLEMENTATION_REPORT_2026-09-25.md), [handoff por ramas](BRANCH_HANDOFF.md) y [decisiones pendientes](DECISIONS_REQUIRED.md).
