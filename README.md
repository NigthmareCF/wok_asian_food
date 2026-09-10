# WOK ASIAN FOOD

Base del sistema de gestion para WOK Asian Food. La fase actual prioriza el frontend web con datos simulados; backend, persistencia y servicios externos se integraran posteriormente.

## Aplicaciones

- `apps/web`: aplicacion Next.js para los contextos Cliente, Operativo y Administrativo.
- Mobile y Desktop: pendientes de decision con el equipo y el ingeniero.

La ubicacion de Web permite trabajar como workspace y extraer `apps/web` si posteriormente se aprueban repositorios separados.

## Inicio rapido

```bash
npm install
npm run dev:web
```

Abrir `http://localhost:3000`.

## Verificacion

```bash
npm run lint
npm run typecheck
npm run test
npm run build:web
```

- [Arquitectura frontend](docs/frontend/ARCHITECTURE.md)
- [Guia del equipo frontend](docs/frontend/TEAM_GUIDE.md)
- [Reparto frontend](docs/frontend/WORKSTREAMS.md)
- [Registro de avances](docs/progress/README.md)
- [Flujo Git](docs/git/BRANCHING.md)
- [Catalogo de ramas](docs/git/BRANCH_CATALOG.md)
- [Contribuciones](CONTRIBUTING.md)
