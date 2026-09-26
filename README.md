# WOK ASIAN FOOD

Sistema integral en desarrollo para WOK Asian Food. La web tiene flujos con datos simulados; la base Java/PostgreSQL y la infraestructura local se construyen por casos de uso verificables. Una vista, tabla o mock no equivale a una operación productiva.

## Aplicaciones

- `apps/web`: aplicación Next.js para Cliente, Operativo y Administrativo; mayormente fixtures.
- `apps/api`: core Spring Boot modular en construcción; consultar [arquitectura](docs/backend/ARCHITECTURE.md) y [brechas](docs/project/GAP_ANALYSIS.md).
- App móvil Cliente: React Native/Expo planificada en [plan móvil](docs/mobile/CLIENT_APP_PLAN.md); aún no existe aplicación ejecutable.

El modelo de datos candidato vive en `database/design/generate.py`; las migraciones ejecutables están en `database/migrations/`. La instalación LAN/WAN se documenta en [infraestructura](infra/README.md).

## Inicio rapido

```bash
npm install
npm run dev:web
```

Abrir `http://localhost:3000`. Para que otro dispositivo en la LAN acceda a la web de desarrollo, ejecutar `npm run dev --workspace @wok/web -- --hostname 0.0.0.0 --port 3000` y usar la IP local del servidor.

## Verificacion

```bash
npm run lint
npm run typecheck
npm run test
npm run build:web
```

- [Arquitectura frontend](docs/frontend/ARCHITECTURE.md)
- [Brechas del sistema](docs/project/GAP_ANALYSIS.md)
- [Decisiones técnicas](docs/project/TECH_DECISIONS.md)
- [Diagramas editables](docs/architecture/README.md)
- [Guia del equipo frontend](docs/frontend/TEAM_GUIDE.md)
- [Reparto frontend](docs/frontend/WORKSTREAMS.md)
- [Registro de avances](docs/progress/README.md)
- [Flujo Git](docs/git/BRANCHING.md)
- [Catalogo de ramas](docs/git/BRANCH_CATALOG.md)
- [Contribuciones](CONTRIBUTING.md)
