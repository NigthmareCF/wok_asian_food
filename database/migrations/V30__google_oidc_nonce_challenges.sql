CREATE TABLE wok.google_oidc_nonce_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_google_oidc_nonce_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_google_oidc_nonce_consumed CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX ix_google_oidc_nonce_expiry
    ON wok.google_oidc_nonce_challenges (expires_at)
    WHERE consumed_at IS NULL;
