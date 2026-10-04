-- Login is also governed by the unauthenticated auth rate limiter.
-- Keep the historical migration immutable and extend its allowed action list here.
SET search_path = wok, public;

ALTER TABLE auth_rate_limit_events
    DROP CONSTRAINT ck_auth_rate_limit_events_2;

ALTER TABLE auth_rate_limit_events
    ADD CONSTRAINT ck_auth_rate_limit_events_2
    CHECK (action IN ('REGISTER', 'LOGIN', 'VERIFY', 'RESEND', 'RESET_REQUEST', 'RESET_COMPLETE'));
