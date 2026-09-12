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
