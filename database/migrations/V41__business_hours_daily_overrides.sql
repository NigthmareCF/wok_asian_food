SET search_path = wok, public;

CREATE TABLE business_hours_overrides (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    service_type TEXT NOT NULL,
    service_date DATE NOT NULL,
    is_open BOOLEAN NOT NULL,
    opens_at TIME,
    closes_at TIME,
    timezone_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT pk_business_hours_overrides PRIMARY KEY (id),
    CONSTRAINT uq_business_hours_overrides_service_date UNIQUE (service_type, service_date),
    CONSTRAINT ck_business_hours_overrides_service CHECK
        (service_type IN ('RESTAURANT', 'DINE_IN', 'PICKUP', 'DELIVERY', 'ONLINE')),
    CONSTRAINT ck_business_hours_overrides_window CHECK (
        (is_open AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)
        OR (NOT is_open AND opens_at IS NULL AND closes_at IS NULL)
    ),
    CONSTRAINT ck_business_hours_overrides_reason CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
    CONSTRAINT ck_business_hours_overrides_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_business_hours_overrides_version CHECK (row_version > 0),
    CONSTRAINT fk_business_hours_overrides_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_business_hours_overrides_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE INDEX ix_business_hours_overrides_effective
    ON business_hours_overrides (service_type, service_date, expires_at);
