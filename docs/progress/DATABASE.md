# Database progress

## 2026-09-29 — Client reservation history snapshot

- V7 adds `requested_for_at` and `party_size` to `reservation_evaluations`, backfills them from reservations that already exist, and adds a size constraint plus an index for recent per-user history.
- Added `database/tests/V7_reservation_request_history.sql` to verify rejected evaluations retain request data without creating a reservation and invalid party sizes are rejected.
- Dependency: `feature/reservations` will persist both fields and expose authenticated history. Apply V7 before deploying that API.
- Flyway applied V1–V7 from empty schema on PostgreSQL 18. SQL suites `V1_constraints`, `V3_reservations`, `V4_hours`, `V5_reservation_request_idempotency`, `V6_cash_sessions_and_movements` and `V7_reservation_request_history` all passed and rolled back test data.
- Updated the V5 SQL test to write the V7 request snapshot while continuing to verify its idempotency and occupancy constraints against the latest schema.
- Candidate model/DDL/dictionary/ERD reconciliation and full historical upgrade-path testing remain open; this slice does not resolve those project-wide findings.

## 2026-09-28 — PostgreSQL migration smoke test

- Validated `feature/database-migrations` in a disposable PostgreSQL 18 container.
- Applied Flyway scripts V1 through V6 in order on an empty database; all completed successfully with `ON_ERROR_STOP` enabled.
- Executed `V1_constraints.sql`, `V3_reservations.sql`, `V4_hours.sql`, `V5_reservation_request_idempotency.sql`, and `V6_cash_sessions_and_movements.sql`; all completed successfully and rolled back their test data where applicable.
- Removed the temporary container after validation. No project database, credentials, or repository secrets were used.
- This verifies migration execution and the available SQL checks only. The model/SQL/dictionary/ERD reconciliation, full business-rule coverage, and migration upgrade-path testing remain open.
