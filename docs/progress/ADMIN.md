# Progreso del canal Administrativo

Responsables: Edgar y Beto.

Agregar aquí los avances más recientes siguiendo la plantilla de [README.md](README.md).

## 2026-09-26 — Capacidad de servicio con cambio auditado

- Rama backend: `feature/availability`. `GET /api/v1/public/service-capabilities` expone estados activos persistidos.
- Admin autenticado puede listar servicios y cambiar estado con motivo obligatorio y `expectedVersion`; cada cambio incrementa versión/policy, genera evento y audit log en una transacción.
- Una versión obsoleta responde 409. Cambio, actor y auditoría se comprobaron contra PostgreSQL temporal con HTTP.
- La UI administrativa conserva fixtures y permisos visuales. La API es un slice, no implica una integración productiva ya conectada al portal.

## 2026-09-15 — Auditoría de integración de rutas

- Las 16 vistas administrativas tienen rutas y accesos en la sidebar: usuarios, roles, personal, menú, ajustes, recetas, proveedores, compras, producción, reportes, caja, clientes, IA, cámaras y auditoría.
- Los formularios administrativos se conservan como pendientes de ampliación.

## 2026-09-12 — A-05 a A-16: flujos administrativos simulados

- Rama: `feature/frontend-admin`, sobre `51964d2`; incluye `development` verificado en `95f678a` y los avances A-01/A-02 de Roberto.
- Responsables: Edgar; A-01 a A-04 permanecen asignados a Roberto.
- Asistencia: Codex.
- Vistas: A-05 Menú, A-06 Recetas, A-07 Proveedores, A-08 Compras, A-09 Producción, A-10 Reportes, A-11 Cierres, A-12 Clientes, A-13 Configuración, A-14 IA/Mensajería, A-15 Visión y A-16 Auditoría.
- Completado: CRUD de catálogo y categorías con fotos/opciones/visibilidad; recetas versionadas con historial y validación de componentes; proveedores y compras relacionadas; solicitudes, compra registrada y recepción parcial/completa separadas; plan de producción con decisiones humanas; filtros de reportes y exportación CSV; consulta de cierres; incidencias/restricciones específicas con motivos; configuración validada con confirmación y recuperación de error; plantillas locales; revisión humana de señales sintéticas; auditoría con antes/después y filtros.
- Estado: cambios conservados en memoria durante la navegación administrativa; reinicio al recargar. Datos y permisos explícitamente simulados. Las existencias de compras son locales a esta demostración y no actualizan el canal Operativo.
- Archivos principales: las doce rutas nuevas bajo `apps/web/src/app/(private)/(admin)/admin`, módulos por dominio, `modules/admin-workspace`, `data/fixtures/admin-workspace.ts` y fotografías locales en `public/images/admin`.
- Cambios compartidos: solo ampliación de navegación y permisos administrativos en `navigation.ts`/`app-shell.tsx`, exportación pública del módulo Menú y provider en layout administrativo. Estilos nuevos encapsulados en CSS Modules; sin edición de `globals.css`, A-01/A-02 ni vistas Cliente/Operativo.
- Pruebas: 14 archivos y 91 pruebas aprobadas (54 previas + 37 nuevas); lint, typecheck, formato de `apps/web` y build de producción aprobados. El build requiere ejecución fuera del sandbox de esta sesión: dentro, el subproceso TypeScript devuelve salida vacía. No se deshabilitó la comprobación de tipos ni se cambiaron dependencias.
- Validación de navegador: 12 rutas en 390, 768, 1280 y 1440 px; sin desbordamiento de página ni imágenes rotas. Verificados ciclo de foco de diálogos, Escape, restauración de foco, navegación touch y conservación de catálogo/auditoría al cambiar de ruta. Tablas adaptadas mediante container queries para evitar recortes con sidebar en tablet.
- Formato global: `npm run format:check` señala únicamente `docs/frontend/FRONTEND_FOUNDATION_BLUEPRINT.md`, documento local preexistente sin seguimiento; se conservó intacto.
- Figma: contexto consultado para `16:551` (Menú) y `16:1419` (Producción), archivo `KrN3PSudQXxQsbtc4coyOg`. El conector alcanzó su cuota; las otras vistas siguen la guía y tokens existentes y requieren contraste visual posterior. No se afirma fidelidad completa a los mockups.
- Límites: IA sin modelo ni envío; visión sin cámaras reales ni acciones automáticas. Configuración diaria de ejemplo, sin turnos nocturnos ni agenda por día. Contratos backend, catálogo definitivo de permisos y políticas comerciales siguen pendientes.
- Handoff: [detalle de rutas y revisión](../frontend/ADMIN_HANDOFF.md).
- PR: pendiente de revisión/publicación por Edgar y SM; no se hizo commit, push ni merge.

## 2026-09-09 — Estado inicial

- Rama: `development`
- Responsables: coordinación frontend
- Asistencia: Codex
- Vistas: entrada base `/admin`
- Completado: shell responsive, navegación configurable y resumen demostrativo del canal
- Archivos principales: `apps/web/src/app/(private)/(admin)` y componentes compartidos
- Pruebas: lint, typecheck, 5 pruebas unitarias y build aprobados
- Decisiones: permisos y datos administrativos son simulados; prototipo A-11 a A-16 clasificado
- Pendiente: seleccionar IDs del sprint e implementar vistas asignadas
- PR: `https://github.com/NigthmareCF/wok_asian_food/pull/2`

## 2026-09-12 — Vistas administrativas A-01 a A-04

- Rama: `feature/frontend-admin`
- A-01 Dashboard administrativo: completado
- A-02 Gestión de usuarios: completado, incluyendo accesibilidad de diálogos y validación perceptible
- A-03 Roles y permisos: completado con datos simulados
- A-04 Personal y horarios semanales: completado parcialmente dentro del alcance confirmado
- Bloqueado: `Gestionar auxiliar`, porque no existe definición funcional
- Rutas: `/admin`, `/admin/users`, `/admin/roles` y `/admin/staff`
- Navegación y permisos visuales simulados: `users.read`, `roles.read` y `staff.read`
- Alcance técnico: sin API, persistencia, autenticación ni autorización real
- Verificaciones: `npm run format:check`, `npm run lint` y `npm run typecheck` aprobados
- Pruebas: 14 archivos y 84 pruebas aprobadas
- Responsive: A-01, A-02 y A-03 validados; A-04 queda pendiente de revisión manual porque Firefox headless ignoró los viewports en la validación automatizada
- Build: `build:web` continúa bloqueado por el problema documentado de Next.js 16.3.4, npm 12.0.2 y TypeScript `--showConfig`
- Limitación: el aislamiento estricto del sidebar requeriría un modal global o portal compartido
- A-05 y vistas posteriores: no iniciadas

## 2026-09-25 — Correcciones posteriores a auditoría A-01 a A-04

- Rama: `feature/frontend-admin`
- A-02 Gestión de usuarios: validación explícita de correo vacío e inválido en creación y edición, con mensaje perceptible, atributos ARIA y foco en el campo correspondiente
- A-02 Cambios pendientes: confirmación al cerrar con X, Cancelar o Escape; conservación del borrador al cancelar; restauración de foco; trampa de foco; fondo inerte; y protección `beforeunload` únicamente mientras existen cambios
- Objetivos táctiles: campos de búsqueda de Usuarios, Roles y Personal validados con 44 px de alto
- Marca del shell: área táctil mínima de 44 px y destino contextual `/admin`, `/client` o `/operation`
- Textos: corrección de tildes visibles y accesibles en Personal, horarios y navegación; nombres demostrativos corregidos sin cambiar identificadores
- Pruebas: `git diff --check`, `format:check`, lint y typecheck aprobados; 14 archivos y 94 pruebas aprobadas
- Responsive: `/admin`, `/admin/users`, `/admin/roles` y `/admin/staff` sin desbordamiento horizontal a 390, 768, 1280 y 1440 px; marca y búsquedas miden al menos 44 px de alto
- Rutas: las cuatro rutas administrativas respondieron directamente; navegación visible limitada a Resumen, Usuarios, Roles y permisos, y Personal y horarios
- Build: la compilación optimizada terminó correctamente en 4.0 s; el comando falló después al iniciar TypeScript con `Could not parse output from TypeScript's --showConfig.`
- Hallazgos resueltos: correo inválido, pérdida silenciosa de borradores, objetivos táctiles, destino incorrecto de la marca y tildes administrativas auditadas
- Limitaciones: `docs/frontend/AI_STARTER.md` no existe y no fue creado; `Gestionar auxiliar` continúa bloqueado por falta de definición funcional
- Prueba cruzada conservada sin cambios: `/client` funciona directamente, no muestra opciones administrativas u operativas y sus métricas todavía no están identificadas como simuladas

## 2026-09-26 — Administración API de usuarios y roles

- Rama `feature/backend-auth`: `GET /api/v1/admin/users` paginado/buscable y `PUT /{id}/roles/{roleCode}` para conceder/revocar `OPERATIONAL` o `ADMIN`. `CLIENT` permanece reservado al registro público.
- Los cambios requieren motivo y versión esperada; se conserva historial de roles, aumenta `users.row_version` y se escribe `audit_logs`. El último administrador activo no se puede retirar.
- Validación: API combinada compiló en Docker Java 21 (`mvn verify`, 12/12); PostgreSQL 18 con V1–V6; smoke HTTP comprobó 401 anónimo, listado, grant/revoke, conflicto por versión vieja, último ADMIN 409 y rol CLIENT 400. Falta automatizar RBAC en CI y conectar la pantalla Admin.

## 2026-09-28 — Límites y pruebas de tokens de identidad

- `TokenService` ahora rechaza `refresh-days` menor a 1 al arrancar, igual que ya validaba la ventana del access token.
- Se agregaron pruebas para verificar firma/claims mínimos del JWT, issuer URI, límite de expiración, opacidad/entropía del refresh token y configuraciones inválidas.
- Validación ejecutada sobre una composición descartable de `feature/backend-foundation` + `feature/backend-auth`: Maven compiló Java 21 y pasó 5 pruebas unitarias (2 de challenges, 3 de tokens). La rama `feature/backend-auth` aún depende de que se integre primero la base Spring/Maven.

## 2026-09-28 — Perfil Cliente privado

- Se agregó `GET/PUT /api/v1/client/profile`, protegido con rol `CLIENT` y sujeto tomado del JWT. La edición actualiza `users` y `customer_profiles` en una transacción, controla `expectedVersion` y audita los campos sin guardar el teléfono en el evento.
- La prueba verifica rechazo por versión obsoleta sin escrituras y persistencia coordinada de ambas representaciones; la edición no permite cambiar correo ni acceder a otro perfil.
- Validación en composición temporal con foundation + auth: Maven pasó 7/7 pruebas unitarias. El smoke HTTP/DB también pasó en PostgreSQL 18 temporal: login CLIENT, perfil GET/PUT, conflicto de versión, validación de teléfono y 403 para ADMIN; DB confirmó sincronización/auditoría. Falta integrar las ramas oficialmente y repetirlo en CI.

## 2026-10-09 — Etapa 10: cierre de auditoría e integración posible

- Rama: `feature/chan-reports-audit-contracts`.
- Resultado: A-01, A-10, A-11, A-12, A-13, A-14, A-15 y A-16 auditadas. Las rutas activas ahora muestran bloqueo explícito y contrato ausente; no montan métricas, exportaciones o mutaciones de demostración. No existen contratos suficientes de reportes, consulta de auditoría, clientes administrativos, ubicación/horarios, IA ni cámaras. La API de usuarios y la sesión de caja por ID no sustituyen esos contratos.
- Contratos, pantallas y tabla final: [Etapa 10](../frontend/STAGE_10_AUDIT.md).
- Pruebas: BFF de dashboard y servicios públicos, UI operativa/servicios, regresión de mesas e inicio Cliente y rutas administrativas bloqueadas.
- Verificaciones: 34 pruebas enfocadas aprobadas en 6 archivos; `npm run lint`, `npm run typecheck`, `npm run build:web` y `git diff --check` aprobados. Typecheck inicial encontró referencias obsoletas en `.next`; pasó tras regenerarlas con build. La prueba adicional de rutas bloqueadas tuvo timeout al iniciar un worker durante el build y pasó al repetirse con `--maxWorkers=1`.
- Límites: sin smoke HTTP contra backend desplegado ni validación visual en navegador; respuestas controladas en pruebas. Sin APIs de negocio, migraciones, dependencias ni integraciones externas nuevas. Sin commit ni push.
