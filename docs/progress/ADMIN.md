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

## 2026-09-12 — A-01 y A-02 implementados

- Rama: `feature/frontend-admin`
- Vistas: A-01 Dashboard administrativo y A-02 Gestión de usuarios
- Funcionalidad: dashboard con selector de período, métricas, alertas, productos críticos, compras sugeridas y producciones sugeridas; gestión local de usuarios con búsqueda, filtros por estado, creación, edición, consulta de roles múltiples, capacidades efectivas deduplicadas, activación, suspensión y bitácora simulada
- Archivos principales: `apps/web/src/app/(private)/(admin)/admin`, `apps/web/src/modules/admin`, `apps/web/src/modules/users`, `apps/web/src/data/fixtures/admin.ts`, `apps/web/src/data/fixtures/users.ts` y `apps/web/src/config/navigation.ts`
- Datos y permisos: datos, roles, capacidades y permisos simulados; permisos visuales sin autorización real de backend
- Pruebas: 12 archivos y 54 pruebas aprobadas
- Verificaciones: `npm run format:check`, `npm run lint` y `npm run typecheck` aprobados
- Build: `build:web` bloqueado por el problema de Next.js 16.3.4 con la salida de TypeScript `--showConfig` bajo npm 12.0.2
- Validación responsive: realizada en 390, 768, 1280 y 1440 px
- Pendientes de A-02: gestión inicial del foco en diálogos, cierre con Escape, restauración del foco, trampa de foco/inert y mensajes perceptibles de validación
- Figma: diseño específico de A-02 no identificado
- A-03: no iniciado
