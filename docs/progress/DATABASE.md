# Database progress

## 2026-09-28 — PostgreSQL migration smoke test

- Validated `feature/database-migrations` in a disposable PostgreSQL 18 container.
- Applied Flyway scripts V1 through V6 in order on an empty database; all completed successfully with `ON_ERROR_STOP` enabled.
- Executed `V1_constraints.sql`, `V3_reservations.sql`, `V4_hours.sql`, `V5_reservation_request_idempotency.sql`, and `V6_cash_sessions_and_movements.sql`; all completed successfully and rolled back their test data where applicable.
- Removed the temporary container after validation. No project database, credentials, or repository secrets were used.
- This verifies migration execution and the available SQL checks only. The model/SQL/dictionary/ERD reconciliation, full business-rule coverage, and migration upgrade-path testing remain open.
