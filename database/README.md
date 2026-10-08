# Database migrations and development seed

This directory contains the Flyway SQL sequence used by the WOK API, standalone SQL checks for important database constraints, and an opt-in development catalog seed. The migration files are the schema actually applied by the backend; the separate ERD/model candidate still needs reconciliation and is not proof of the deployed schema.

## Apply schema

The API applies `migrations/V*.sql` through Flyway in version order. Never edit an already released migration to change an installed schema; add a new versioned migration instead. The current sequence is V1–V50. V50 stores immutable per-line inventory resource snapshots and audited pre-kitchen line cancellation, and permits `WASTE` inventory movements to reference the cancelled order while retaining the production-batch/order exclusivity rule.

Run the disposable PostgreSQL verification with:

```bash
./database/validate.sh
```

It starts an unexposed PostgreSQL 18 container, applies every migration to an empty database, runs the available SQL checks except `candidate_constraints.sql`, applies the development catalog seed twice, verifies the 31 seeded menu products, and removes the container on exit. Docker is required.

`candidate_constraints.sql` exercises the unreconciled candidate model, so it is intentionally not included in checks against the runtime migration schema.

## Development menu seed

`seeds/menu_real_dev.sql` is idempotent development data, not a Flyway migration. It adds the current 31 menu products, their published options, and measured preliminary beverage components, including 2 fl oz of prepared simple syrup for each matcha drink and carbonatada. It creates no opening stock and leaves incomplete product recipes inactive. Run it only after migrations and only in a development database. It does not contain demo-user credentials.

## Scope limits

Flyway describes the executable runtime schema. The candidate model, generated DDL, data dictionary, ERD, and complete requirements still require reconciliation; do not call them final based only on this migration chain. SQL constraint checks do not replace the backend's PostgreSQL integration and concurrency tests.
