-- Rate limiting counters for the unauthenticated auth endpoints (register, verify, reset).
-- One row per observed attempt, counted in a sliding window per action and subject.
SET search_path = wok, public;

CREATE TABLE auth_rate_limit_events (
    id UUID CONSTRAINT nn_auth_rate_limit_events_id NOT NULL DEFAULT gen_random_uuid(),
    action TEXT CONSTRAINT nn_auth_rate_limit_events_action NOT NULL,
    scope TEXT CONSTRAINT nn_auth_rate_limit_events_scope NOT NULL,
    subject TEXT CONSTRAINT nn_auth_rate_limit_events_subject NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_auth_rate_limit_events_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_auth_rate_limit_events PRIMARY KEY (id),
    CONSTRAINT ck_auth_rate_limit_events_1 CHECK (scope IN ('IP', 'IDENTIFIER')),
    CONSTRAINT ck_auth_rate_limit_events_2 CHECK (action IN ('REGISTER', 'VERIFY', 'RESEND', 'RESET_REQUEST', 'RESET_COMPLETE'))
);

CREATE INDEX ix_auth_rate_limit_events_window
    ON auth_rate_limit_events(action, scope, subject, created_at DESC);
