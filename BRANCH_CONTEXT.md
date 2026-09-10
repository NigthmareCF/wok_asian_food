# Contexto de trabajo

Este archivo conserva límites estables para las ramas frontend. La rama activa y su base deben comprobarse con Git antes de editar; no se mantiene aquí un nombre de rama que pueda quedar obsoleto después de un merge.

## Proposito

Permitir trabajo paralelo y revisable en el frontend web para Cliente, Operativo y Administrativo.

## Alcance permitido

Aplicación Web, rutas, sistema visual, componentes compartidos, mocks, permisos visuales, contratos de transporte/realtime y documentación por canal.

## Fuera de alcance

Backend, base de datos, autenticacion real, pagos reales, integraciones externas, Mobile y Desktop.

## Riesgos y decisiones pendientes

- Monorepo frente a repositorios separados sigue pendiente de consulta con el ingeniero.
- Logo, fotografias y tipografia oficial estan pendientes.
- Los permisos y contratos backend son conceptos de frontend, no autorizacion real.

## Lectura previa

- `AGENTS.md` y `apps/web/AGENTS.md`.
- `docs/frontend/TEAM_GUIDE.md`.
- `docs/frontend/channels/README.md`.
- Guía del canal asignado.
- Flujo de Git en `docs/git/BRANCHING.md`.

## Tests necesarios

Lint, TypeScript, pruebas unitarias y build de producción de Web. Los asistentes de IA no hacen commit, push ni merge sin autorización explícita.
