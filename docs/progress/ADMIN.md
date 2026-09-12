# Progreso del canal Administrativo

Responsables: Edgar y Beto.

Agregar aquí los avances más recientes siguiendo la plantilla de [README.md](README.md).

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
