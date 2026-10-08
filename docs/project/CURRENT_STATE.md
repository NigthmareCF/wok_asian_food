# Estado actual del proyecto

## Avance backend/app — 2026-10-07

- En `feature/backend-capacity-order-lifecycle` se agregó el slice de evidencia para pickup con V51: upload privado, ownership, validación JPEG/PNG real y tamaño, deduplicación, revisión Operativa y captura sólo después de verificación humana. Suite completa ejecutada con Docker/PostgreSQL 18: 67 suites, 282 pruebas, 0 fallos/errores/omitidas; V1–V51 aplicadas desde cero.
- En `feature/mobile-shell` se agregó ImagePicker SDK 57 al historial de pedidos. Lint, typecheck y 98 tests pasaron; Expo exportó Web (17 rutas) y bundle Android. No equivale a APK ni prueba física.
- V51 también está en `feature/database-migrations`; `bash database/validate.sh` pasó las 51 migraciones, 15 checks SQL y seed idempotente en PostgreSQL 18.
- Los pagos externos siguen sin gateway real. Este flujo es evidencia de transferencia y revisión autorizada; no existe OCR ni acreditación automática.

Fecha de revisión: 2026-09-28. Rama local observada: `feature/frontend-admin`, commit `1b6f146`. El árbol rastreado estaba limpio al comenzar. El plan actualizado está en [INTEGRAL_DELIVERY_PLAN.md](INTEGRAL_DELIVERY_PLAN.md); la matriz base de auditoría en [GAP_ANALYSIS.md](GAP_ANALYSIS.md).

## Aclaración Web Cliente — 2026-10-07

- Se añadió [CLIENT_SCOPE_DECISIONS.md](CLIENT_SCOPE_DECISIONS.md) para consolidar alcance, comportamiento backend observado, recorrido de demo y pendientes.
- Pickup y delivery forman parte del producto integral. Las 3 h mínimas corresponden a reservas y solicitudes digitales de mesa, no pickup. Delivery tiene 21:00 como referencia, pero cobertura, tarifa, mínimo, courier y pagos siguen sin definirse.
- Las vistas Cliente/Operativo que el equipo revisó pueden mostrarse como UI; declarar si usan fixtures/local state o API persistida. Verificar SHA y build antes de llamarlas E2E.
- `DECISIONS_REQUIRED.md`, `TECH_DECISIONS.md`, `DEVELOPMENT_PLAN.md` y `BACKLOG.md` se alinearon: el menú ya fue entregado, cámaras están diferidas y los cortes antiguos pickup-only/delivery-posterior son históricos/superseded.

## Publicaciones especializadas posteriores — 2026-10-02

- `feature/backend-api` `4b5a82a` devuelve el motivo de rechazo en historial/detalle pickup y delivery, sólo para `REJECTED`; suite temporal API+auth: 48/48.
- `feature/mobile-shell` `0d645fa` conserva solicitudes inciertas de reserva en SecureStore aisladas por cuenta, y genera UUID criptográficos de idempotencia para pickup/reserva; Vitest 5/5, ESLint, TypeScript y exports Expo Android/Web pasan. Los exports no son APK/IPA ni E2E físico.
- `feature/reservations` `f840254` amplía pruebas de reglas de capacidad y decisión Operativa; 10/10 pruebas focales en composición Maven. Ninguna confirma capacidad en vivo; capacidad real sigue desconectada.
- `feature/backend-auth` `7df1b5e` agrega validación Google OIDC, deshabilitada hasta configurar client ID. `feature/payments` `1c8ecd6` conserva adapters mock idempotentes; sus JUnit ya pasan en composición temporal. Sin proveedores productivos.
- Los cambios se publicaron en branches especializadas, sin merge. Para verificar el sistema integrado hay que ensamblar migrations/backend/auth/API/mobile en entorno limpio; la rama `integration/backend-bootstrap` anterior no incluye estas últimas publicaciones.

## Evidencia actual del checkout

- Web: Next.js 16.3.4, React 19.2.8, TypeScript 6.0.3. Hay 266 archivos TS/TSX bajo `apps/web/src`, 23 archivos de fixtures y seis routes API/BFF. UI Client/Operational/Admin extensa. La mayoría de áreas de negocio usa fixtures/proveedores en memoria.
- Contraste de ramas web: `origin/feature/frontend-client` (`2f7ee1a`) añade una consulta BFF del estado público de servicios y guía visual de anticipación de 3 horas; reserva sigue siendo simulada y usa fixtures. `origin/feature/frontend-operational` (`248df38`) sólo cambia documentación. El status público requiere su endpoint backend y configuración para operar.
- Integración efectiva vista en esta rama: BFF web de login/sesión con cookies HttpOnly/SameSite y refresh delegado a API; BFF para búsqueda/cambio de roles y capabilities. La URL `WOK_API_BASE_URL` debe apuntar a backend. No se demostró conexión E2E en este checkout.
- Aplicación: no está `apps/mobile` en esta rama local. `origin/feature/mobile-shell` (`bda29e1`) tiene Expo SDK 57 parcial con auth y solicitud de reserva, menú placeholder; no incluye pedidos/checkout/pagos/mensajes completos ni prueba en dispositivo según sus fuentes.
- Backend/DB: `apps/api` no está en esta rama. Viven en ramas: `feature/backend-foundation`, `feature/backend-auth`, `feature/backend-api`, `feature/reservations`, `feature/availability`, `feature/payments`. DB/DDL/migraciones viven en `feature/database-schema`, `feature/database-migrations`; el diseño objetivo es 128 tablas, seis migraciones iniciales cubren 35 tablas según auditoría documentada. No hay una revisión remota que reúna todo integrado.
- Infra: Compose/Nginx en `feature/backend-foundation`; no forma parte del checkout. Topología Draw.io existe en `infra/diagrams/network.drawio` de esa rama. Corte WAN físico no demostrado.
- IA: gateway/broker/mock en `feature/ai`; sin runtime/GPU productivo. Pagos, FEL, Meta y voz tienen interfaces/mocks o diseños; no afirmar proveedores conectados.
- Requisitos funcionales locales recuperados: 21 épicas, 308 HU, 145 RN y 76 RT; desglose/matriz completa en `docs/database/`.

## Verificaciones ejecutadas en este checkout

| Comando | Resultado 2026-09-28 | Alcance |
|---|---|---|
| `npm run test` | 39 archivos / 228 pruebas aprobadas | Vitest Web en checkout actual. |
| `npm run typecheck` | Aprobado | TypeScript Web. |
| `npm run lint` | Aprobado | ESLint Web. |
| `npm run build:web` | Build producción aprobado; Next generó tipo de ruta | El cambio autogenerado a `apps/web/next-env.d.ts` fue restaurado a HEAD. |
| Java/Maven/PostgreSQL | No reejecutado | Java 21 disponible; Maven/psql no están instalados. Docker CLI presente, acceso al daemon restringido. |
| `python3 database/design/validate.py` | `FAIL` | Validador estático: divergencias de manifiesto en modelo/DDL/diccionario/ERD/generador y V3 difiere del corte declarativo; SQL no ejecutado y PostgreSQL no conectado. |
| Mobile/Expo | No reejecutado | App no está en esta rama; reportes de otra rama son históricos. |

Las notas `local-context-vault/` informan pruebas anteriores de Java/Flyway/HTTP/Expo, pero son resúmenes locales; deben reejecutarse contra una integración limpia. No copiar contraseñas ni los valores de runtime efímero que pudieran permanecer fuera del repo.

## Pendiente prioritario

1. Resolver el entorno Docker/PostgreSQL y establecer qué branches/commits se integran primero.
2. Ejecutar smoke limpio (Nginx → Web/API → PostgreSQL/Flyway) y E2E de identidad/roles, reservas/capacidad y caja.
3. Decidir JDBC/JPA antes de crecer el backend; reconciliar modelo 128 tablas con corte V1–V6; establecer matriz de requisitos por plataforma.
4. Llevar flujo completo Cliente Web/app, Operativo y Administrativo; implementar pedidos/KDS/inventario/pagos/FEL/mensajería por dependencias.
5. Demostrar local-first y WAN recovery en dispositivo/impresora reales, luego avance de cobertura al umbral 90 % sin ocultar bloqueos.

## Fuentes que tomar como entrada

- [Fuentes originales y master](SYSTEM_SOURCE_PATHS.md), [documento maestro](SYSTEM_MASTER.md).
- [Plan integral para la próxima sesión](INTEGRAL_DELIVERY_PLAN.md).
- [Informe de auditoría A–Q del 2026-09-28](IMPLEMENTATION_REPORT_2026-09-28.md).
- [Brechas por requisito](GAP_ANALYSIS.md), [decisiones](TECH_DECISIONS.md) y [decisiones externas](DECISIONS_REQUIRED.md).
- [Handoff por ramas](BRANCH_HANDOFF.md) y [reporte histórico de implementación](IMPLEMENTATION_REPORT_2026-09-25.md).
