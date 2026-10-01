# Messaging progress

## 2026-09-30 — Authenticated Customer App conversations

- Added `POST/GET /api/v1/client/conversations`, owner-scoped message history, and idempotent message submission. The backend verifies active customer ownership and limits reads to 100 recent messages.
- Added the operational waiting queue and staff replies behind `OPERATIONAL`/`ADMIN` role checks. Conversation row locks serialize replies; a closed conversation rejects new messages. Reusing an idempotency key with the same actor/body replays the receipt; a changed payload returns `409`.
- This slice uses the V10 PostgreSQL schema from `feature/database-migrations`. The conversation channel is `APP`; no provider, webhook, email, push notification, AI reply, or realtime delivery is implemented or represented as production-ready.
- Validation: Java 21 Maven composite with foundation, auth, availability, reservations, API and migration sources passed 39/39 unit tests, including new owner-scope and closed-conversation cases. PostgreSQL V1–V10 and the V10 SQL constraint test passed on a disposable PostgreSQL 18 database in the database branch.
- Mobile screen lives in `feature/mobile-shell` and calls this API. Integrate database migrations before deploying this API slice.
