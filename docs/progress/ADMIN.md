# Progreso del canal Administrativo

Responsables: Edgar y Beto.

Agregar aquí los avances más recientes siguiendo la plantilla de [README.md](README.md).

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
