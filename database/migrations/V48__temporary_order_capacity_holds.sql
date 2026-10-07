SET search_path = wok, public;

CREATE TABLE order_capacity_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL UNIQUE REFERENCES order_quotes(id) ON DELETE RESTRICT,
    order_request_id UUID NOT NULL UNIQUE REFERENCES order_requests(id) ON DELETE RESTRICT,
    requested_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    CONSTRAINT ck_order_capacity_holds_status CHECK (status IN ('ACTIVE', 'RELEASED', 'CONVERTED', 'EXPIRED')),
    CONSTRAINT ck_order_capacity_holds_end CHECK (
        (status = 'ACTIVE' AND ended_at IS NULL)
        OR (status <> 'ACTIVE' AND ended_at IS NOT NULL)
    )
);
CREATE INDEX ix_order_capacity_holds_expiry ON order_capacity_holds(expires_at) WHERE status = 'ACTIVE';

CREATE TABLE order_capacity_hold_stations (
    hold_id UUID NOT NULL REFERENCES order_capacity_holds(id) ON DELETE CASCADE,
    station_id UUID NOT NULL REFERENCES preparation_areas(id) ON DELETE RESTRICT,
    preparation_seconds INTEGER NOT NULL,
    PRIMARY KEY (hold_id, station_id),
    CONSTRAINT ck_order_capacity_hold_station_seconds CHECK (preparation_seconds BETWEEN 1 AND 86400)
);
CREATE INDEX ix_order_capacity_hold_stations_station ON order_capacity_hold_stations(station_id, hold_id);
