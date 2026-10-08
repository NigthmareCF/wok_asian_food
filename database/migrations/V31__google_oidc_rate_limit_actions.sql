ALTER TABLE wok.auth_rate_limit_events
    DROP CONSTRAINT ck_auth_rate_limit_events_2;

ALTER TABLE wok.auth_rate_limit_events
    ADD CONSTRAINT ck_auth_rate_limit_events_2
    CHECK (action IN (
        'REGISTER', 'VERIFY', 'RESEND', 'RESET_REQUEST', 'RESET_COMPLETE',
        'GOOGLE_NONCE', 'GOOGLE_LOGIN'
    ));
