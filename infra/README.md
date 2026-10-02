# WOK local-first deployment

This is the initial single-server deployment contract, not evidence that WAN-failure operation has been tested. The restaurant server hosts Nginx, the web frontend, Spring Boot, PostgreSQL and local storage. Staff devices reach Nginx over the LAN; external clients reach the same API through an approved public path when WAN is available. Spring and PostgreSQL have no host-published ports in `docker-compose.yml`.

## Start on a trusted LAN

1. Copy `infra/.env.example` to the repository root as `.env`. The latter is Git-ignored. Generate distinct high-entropy values for `WOK_DB_PASSWORD`, `WOK_AUTH_JWT_SECRET_BASE64` and `WOK_AUTH_CHALLENGE_PEPPER_BASE64`; for the base64 values, `openssl rand -base64 48` produces suitable input. Do not put these values in shell history, source files or logs.
2. Run `docker compose config --quiet`, then `docker compose up --build -d` from the repository root. The API image builds from `apps/api/Dockerfile`, and its Flyway migration directory is mounted read-only from `database/migrations`.
3. Open the server's LAN IP on port 80 for a development smoke test. Nginx routes `/api/` to Spring and all other paths to Next.js. Use `docker compose ps` and `docker compose logs --tail=100 api nginx` for diagnostics. Spring Actuator remains internal at `http://api:8080/actuator/health` on `app_net`.
4. For development email capture and verification messages, run `docker compose -f docker-compose.yml -f infra/compose.dev.yml --profile dev up --build -d`. The override explicitly enables SMTP mode and points Spring's queued email worker at Mailpit on port 1025. Mailpit's UI binds only to `127.0.0.1:8025` on the server. The default `WOK_EMAIL_MODE=mock` stores mail only in process memory and does not deliver codes; without this override or a real SMTP provider, queued email remains pending and account verification is unavailable; report EMAIL as DEGRADED. For production, set `WOK_EMAIL_MODE=smtp` and configure `WOK_SMTP_HOST/PORT/USERNAME/PASSWORD` in ignored secrets; verify TLS/auth policy with the selected relay before use.

The plain HTTP configuration is for a trusted development LAN only. For authenticated pilot or production traffic, obtain a domain and certificate outside the repository, set `WOK_TLS_CERT_PATH` and `WOK_TLS_KEY_PATH` to host file paths, and run `docker compose -f docker-compose.yml -f infra/compose.tls.yml up --build -d`. The TLS override redirects port 80 to 443. Configure a firewall to allow only the intended LAN clients and public 443 ingress. Do not forward 5432 or 8080. Review HSTS duration after the hostname and certificate are operational.

## Optional local demo data

`database/seeds/dev_demo.sql` contains fixed demonstration accounts and sample tables/menu data. It is not part of Flyway and is never loaded by normal startup. Apply it only to a disposable local database after migrations complete, from the repository root:

```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/seeds/dev_demo.sql
```

The demo accounts use known passwords. Do not apply this seed to production or a database with real users. Existing local databases that already applied the old `V13__dev_seed_demo.sql` need a fresh development volume before using the renumbered migrations; never reset a database containing data you need to keep.

## Network and DNS

The preferred API URL is one hostname, for example `https://api.example.com/api/v1`. Internal DNS resolves it to the server's private address. Public DNS resolves it to the selected direct ingress or tunnel. The mobile app and web clients do not detect Wi-Fi or switch API hosts themselves. A public hostname and exposure method remain coordination decisions. If the ISP uses CGNAT, direct inbound NAT is unlikely to work; compare tunnel cost, security and independence before choosing. A tunnel must not be on the critical path for staff LAN access.

Physical layout: ISP/ONT → firewall/router → managed switch → server and APs. Connect POS, KDS, printers, staff tablets and laptops to trusted segments. Separate guest Wi-Fi and cameras from the private core; guests must not reach PostgreSQL or staff-only routes. An initial VLAN plan is infrastructure, staff, KDS/IoT, cameras and guest, subject to the actual switch/router capabilities. Put server, router, switch and primary AP on a UPS; monitor runtime and test orderly shutdown.

Compose networks express container isolation: `app_net` connects Nginx, web and API; `data_net` is internal and connects only API and PostgreSQL; `ai_net` is reserved as an internal network for a future AI runtime and currently connects only API. No AI runtime image or GPU requirement is present in the base deployment. Backend `WOK_AI_MODE=disabled` is the default; `mock` is for development. `local` requires a separately reviewed runtime service, authenticated internal protocol and GPU benchmark. An AI outage must degrade chat assistance, not orders, cash or kitchen operations.

## WAN failure and recovery

With server, power and LAN healthy, staff should continue to use local Nginx/API/PostgreSQL for tables, in-person orders, kitchen, cash, stock, production and admin. Google login for a new session, online card payment, Meta, FEL certification and real email may degrade. Critical staff need local credentials or a still-valid WOK session. A customer's request that never reached the server is not an order. The client retains its cart or draft and retries; the API revalidates price, stock, hours, capacity and ETA on receipt. On WAN recovery, outbox workers retry with provider idempotency and reconcile unknown outcomes before marking success.

This behavior needs an integration drill with the actual devices: disconnect WAN while preserving LAN, place and complete an in-person order, use KDS and cash, print, inspect stock, then reconnect and verify external retries without duplicates. A running Compose stack or this document alone does not pass that drill. The server, router, switch and AP remain single points of failure until redundancy and UPS are installed.

## Operational safeguards

- Keep database credentials in an ignored `.env` for development. Production should use separate migration-owner and least-privilege application users, Docker secrets or an equivalent secret source, and rotate credentials. The initial Compose uses one bootstrap DB user and is not the final least-privilege setup.
- Back up the PostgreSQL volume and attachment storage to encrypted off-server media. Test restoration before a pilot. The named Docker volume is persistence, not a backup.
- Separate core readiness from external integration health: CORE may be READY while META, FEL, PAYMENTS, EMAIL or AI are DEGRADED. Do not make external provider checks gate core startup.
- Pin image digests after the deployment is verified. `postgres:18-alpine` uses the PostgreSQL 18 volume path `/var/lib/postgresql`; older major releases use a different data-volume convention. See the [official Postgres image](https://hub.docker.com/_/postgres) and [Compose network isolation](https://docs.docker.com/reference/compose-file/networks/).
- Nginx supplies proxy headers, basic IP rate limiting, request size limit, compression, timeouts and WebSocket/SSE-compatible forwarding. Authorization, per-account limits, CSRF and ownership still belong in Spring. Proxy buffering is disabled for `/api/` to permit SSE; revisit when endpoint-specific routes are stable.

See `infra/diagrams/network.drawio` for physical and logical paths. The diagram is a design, not proof of a live deployment.
