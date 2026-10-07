# WOK ASIAN FOOD

Sistema de gestion para WOK Asian Food. El repositorio integra el frontend web,
una API Spring Boot con PostgreSQL y Flyway, y una aplicacion Cliente construida
con React Native y Expo.

## Aplicaciones

- `apps/web`: aplicacion Next.js para los contextos Cliente, Operativo y Administrativo.
- `apps/api`: API Spring Boot compartida por web y movil.
- `apps/mobile`: aplicacion Cliente con React Native y Expo.
- `database/migrations`: migraciones Flyway V1-V48, aplicadas por la API al arrancar.
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

La API aplica Flyway V1–V48 al iniciar. En desarrollo, `.env.example` habilita el seed repetible `database/seeds/menu_real_dev.sql`: publica los 31 productos y sus opciones, sin crear recetas ni stock. Se desactiva con `WOK_CATALOG_SEED_ENABLED=false` antes de cualquier despliegue productivo. `db` sólo está en la red Docker privada; la entrada de clientes es Nginx. La integración de cobros, FEL, email productivo y Meta usa adapters/mocks hasta configurar proveedores reales. Los valores de `.env` son locales y no deben agregarse a Git.

## Aplicación móvil Cliente

```bash
npm ci
npm run start --workspace mobile
```

Configurar `EXPO_PUBLIC_API_BASE_URL` según `apps/mobile/.env.example`. Expo Go sirve para desarrollo; el export de bundle no es un APK instalable.

## Verificacion

```bash
npm run lint
npm run typecheck
npm run test
npm run build:web
npm run lint --workspace mobile
npm run typecheck --workspace mobile
cd apps/api && ./mvnw test
npm run test --workspace mobile
cd apps/mobile && npx expo export --platform android
npx expo export --platform web
```

Las pruebas de integración del backend usan PostgreSQL/Testcontainers y aplican las 48 migraciones desde una base vacía; Docker debe estar disponible. Los nombres de ramas y el historial remoto indican trabajo por validar mediante PR, no que esos cambios ya se hayan integrado a `development`.

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
