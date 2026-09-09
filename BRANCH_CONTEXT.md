# Contexto de branch

```yaml
context_version: 1
branch: feature/frontend-foundation
base_branch: development
collaborator: pending
agent: Codex
last_updated_at: 2026-09-09
status: IN_PROGRESS
```

## Proposito

Crear una base reproducible para el frontend web que permita trabajo paralelo de Cliente, Operativo y Administrativo.

## Alcance permitido

Workspace, aplicacion Web, rutas iniciales, sistema visual, componentes compartidos, mocks, permisos visuales, contratos de transporte/realtime y pruebas de fundacion.

## Fuera de alcance

Backend, base de datos, autenticacion real, pagos reales, integraciones externas, Mobile y Desktop.

## Riesgos y decisiones pendientes

- Monorepo frente a repositorios separados sigue pendiente de consulta con el ingeniero.
- Logo, fotografias y tipografia oficial estan pendientes.
- Los permisos y contratos backend son conceptos de frontend, no autorizacion real.

## Tests necesarios

Lint, TypeScript, pruebas unitarias y build de produccion de Web.
