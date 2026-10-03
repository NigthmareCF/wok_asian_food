# WOK ASIAN FOOD

Sistema de gestion para WOK Asian Food. El repositorio integra el frontend web,
una API Spring Boot con PostgreSQL y Flyway, y una aplicacion Cliente construida
con React Native y Expo.

## Aplicaciones

- `apps/web`: aplicacion Next.js para los contextos Cliente, Operativo y Administrativo.
- `apps/api`: API Spring Boot compartida por web y movil.
- `apps/mobile`: aplicacion Cliente con React Native y Expo.
- `database/migrations`: migraciones Flyway V1-V12.
- `infra`: configuracion local de Docker, Nginx y correo de desarrollo.

La ubicacion de Web permite trabajar como workspace y extraer `apps/web` si posteriormente se aprueban repositorios separados.

## Frontend web

```bash
npm install
npm run dev:web
```

Abrir `http://localhost:3000`.

## Entorno integrado

1. Copiar `infra/.env.example` como `.env` en la raiz.
2. Completar `WOK_DB_PASSWORD`, `WOK_AUTH_JWT_SECRET_BASE64` y
   `WOK_AUTH_CHALLENGE_PEPPER_BASE64` con valores locales independientes.
3. Levantar los servicios:

```bash
docker compose --profile dev up --build -d
```

- Aplicacion web y API mediante Nginx: `http://localhost`
- OpenAPI: `http://localhost/api/v1/openapi`
- Mailpit: `http://localhost:8025`

La API aplica las migraciones V1-V12 al iniciar. Los valores de `.env` son
locales y no deben agregarse a Git.

## Verificacion

```bash
npm run lint
npm run typecheck
npm run test
npm run build:web
npm run lint --workspace mobile
npm run typecheck --workspace mobile
cd apps/api && mvn verify
```

GitHub Actions ejecuta estas comprobaciones en cada pull request dirigido a
`development` o `production`. La verificacion integrada de Docker levanta una
base vacia, aplica Flyway V1-V12 y consulta la salud de la API.

- [Arquitectura frontend](docs/frontend/ARCHITECTURE.md)
- [Arquitectura backend](docs/backend/ARCHITECTURE.md)
- [Aplicacion movil](docs/mobile/README.md)
- [Auditoria de dependencias](docs/security/DEPENDENCY_AUDIT.md)
- [Guia del equipo frontend](docs/frontend/TEAM_GUIDE.md)
- [Reparto frontend](docs/frontend/WORKSTREAMS.md)
- [Registro de avances](docs/progress/README.md)
- [Flujo Git](docs/git/BRANCHING.md)
- [Catalogo de ramas](docs/git/BRANCH_CATALOG.md)
- [Contribuciones](CONTRIBUTING.md)
