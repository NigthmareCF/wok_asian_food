-- Reviewed reservations/tables cut from database/design/generate.py.
-- The 3-hour advance rule belongs to the application service: current time is not immutable.
SET search_path = wok, public;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

CREATE TABLE dining_tables (
    id UUID CONSTRAINT nn_dining_tables_id NOT NULL DEFAULT gen_random_uuid(),
    name TEXT CONSTRAINT nn_dining_tables_name NOT NULL,
    capacity INTEGER CONSTRAINT nn_dining_tables_capacity NOT NULL,
    zone TEXT CONSTRAINT nn_dining_tables_zone NOT NULL,
    active BOOLEAN CONSTRAINT nn_dining_tables_active NOT NULL DEFAULT true,
    current_status TEXT CONSTRAINT nn_dining_tables_current_status NOT NULL DEFAULT 'FREE',
    created_at TIMESTAMPTZ CONSTRAINT nn_dining_tables_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_dining_tables_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_dining_tables_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_dining_tables PRIMARY KEY (id),
    CONSTRAINT uq_dining_tables_1 UNIQUE (name),
    CONSTRAINT ck_dining_tables_1 CHECK (capacity > 0),
    CONSTRAINT ck_dining_tables_2 CHECK (current_status IN ('FREE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'UNAVAILABLE')),
    CONSTRAINT ck_dining_tables_3 CHECK (row_version > 0)
);

CREATE TABLE dining_table_status_history (
    id UUID CONSTRAINT nn_dining_table_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    dining_table_id UUID CONSTRAINT nn_dining_table_status_history_dining_table_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_dining_table_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_dining_table_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_dining_table_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_dining_table_status_history PRIMARY KEY (id),
    CONSTRAINT ck_dining_table_status_history_1 CHECK (to_status IN ('FREE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'UNAVAILABLE'))
);

CREATE TABLE reservations (
    id UUID CONSTRAINT nn_reservations_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID CONSTRAINT nn_reservations_customer_id NOT NULL,
    party_size INTEGER CONSTRAINT nn_reservations_party_size NOT NULL,
    reservation_at TIMESTAMPTZ CONSTRAINT nn_reservations_reservation_at NOT NULL,
    ends_at TIMESTAMPTZ CONSTRAINT nn_reservations_ends_at NOT NULL,
    requested_at TIMESTAMPTZ CONSTRAINT nn_reservations_requested_at NOT NULL DEFAULT now(),
    status TEXT CONSTRAINT nn_reservations_status NOT NULL DEFAULT 'REQUESTED',
    notes TEXT,
    arrival_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_reservations_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_reservations_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_reservations_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_reservations PRIMARY KEY (id),
    CONSTRAINT ck_reservations_1 CHECK (party_size > 0),
    CONSTRAINT ck_reservations_2 CHECK (ends_at > reservation_at),
    CONSTRAINT ck_reservations_3 CHECK (status IN ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    CONSTRAINT ck_reservations_4 CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)),
    CONSTRAINT ck_reservations_5 CHECK (row_version > 0)
);

CREATE TABLE reservation_status_history (
    id UUID CONSTRAINT nn_reservation_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    reservation_id UUID CONSTRAINT nn_reservation_status_history_reservation_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_reservation_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_reservation_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_reservation_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_reservation_status_history PRIMARY KEY (id),
    CONSTRAINT ck_reservation_status_history_1 CHECK (to_status IN ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'))
);

CREATE TABLE reservation_table_assignments (
    id UUID CONSTRAINT nn_reservation_table_assignments_id NOT NULL DEFAULT gen_random_uuid(),
    reservation_id UUID CONSTRAINT nn_reservation_table_assignments_reservation_id NOT NULL,
    table_id UUID CONSTRAINT nn_reservation_table_assignments_table_id NOT NULL,
    occupied_period TSTZRANGE CONSTRAINT nn_reservation_table_assignments_occupied_period NOT NULL,
    released_at TIMESTAMPTZ,
    assigned_by UUID CONSTRAINT nn_reservation_table_assignments_assigned_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_reservation_table_assignments_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_reservation_table_assignments PRIMARY KEY (id),
    CONSTRAINT ck_reservation_table_assignments_1 CHECK (NOT isempty(occupied_period) AND NOT lower_inf(occupied_period) AND NOT upper_inf(occupied_period) AND lower_inc(occupied_period) AND NOT upper_inc(occupied_period))
);

CREATE TABLE reservation_evaluations (
    id UUID CONSTRAINT nn_reservation_evaluations_id NOT NULL DEFAULT gen_random_uuid(),
    reservation_id UUID,
    request_id UUID CONSTRAINT nn_reservation_evaluations_request_id NOT NULL,
    decision TEXT CONSTRAINT nn_reservation_evaluations_decision NOT NULL,
    reason_codes JSONB CONSTRAINT nn_reservation_evaluations_reason_codes NOT NULL,
    alternatives JSONB CONSTRAINT nn_reservation_evaluations_alternatives NOT NULL DEFAULT '[]'::jsonb,
    conditions JSONB CONSTRAINT nn_reservation_evaluations_conditions NOT NULL DEFAULT '[]'::jsonb,
    estimated_occupancy_minutes INTEGER CONSTRAINT nn_reservation_evaluations_estimated_occupancy_minutes NOT NULL,
    estimated_ready_at TIMESTAMPTZ,
    public_message TEXT CONSTRAINT nn_reservation_evaluations_public_message NOT NULL,
    policy_version TEXT CONSTRAINT nn_reservation_evaluations_policy_version NOT NULL,
    evaluated_at TIMESTAMPTZ CONSTRAINT nn_reservation_evaluations_evaluated_at NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ CONSTRAINT nn_reservation_evaluations_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_reservation_evaluations PRIMARY KEY (id),
    CONSTRAINT ck_reservation_evaluations_1 CHECK (decision IN ('ACCEPT', 'ACCEPT_WITH_CONDITIONS', 'SUGGEST_OTHER_TIME', 'REQUIRES_HUMAN_APPROVAL', 'REJECT')),
    CONSTRAINT ck_reservation_evaluations_2 CHECK (estimated_occupancy_minutes > 0)
);

CREATE TABLE dining_sessions (
    id UUID CONSTRAINT nn_dining_sessions_id NOT NULL DEFAULT gen_random_uuid(),
    reservation_id UUID,
    customer_id UUID,
    status TEXT CONSTRAINT nn_dining_sessions_status NOT NULL DEFAULT 'OPEN',
    party_size INTEGER CONSTRAINT nn_dining_sessions_party_size NOT NULL,
    opened_at TIMESTAMPTZ CONSTRAINT nn_dining_sessions_opened_at NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    estimated_end_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_dining_sessions_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_dining_sessions_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_dining_sessions_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_dining_sessions PRIMARY KEY (id),
    CONSTRAINT ck_dining_sessions_1 CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED')),
    CONSTRAINT ck_dining_sessions_2 CHECK (party_size > 0),
    CONSTRAINT ck_dining_sessions_3 CHECK (closed_at IS NULL OR closed_at >= opened_at),
    CONSTRAINT ck_dining_sessions_4 CHECK (row_version > 0)
);

CREATE TABLE dining_session_tables (
    id UUID CONSTRAINT nn_dining_session_tables_id NOT NULL DEFAULT gen_random_uuid(),
    dining_session_id UUID CONSTRAINT nn_dining_session_tables_dining_session_id NOT NULL,
    table_id UUID CONSTRAINT nn_dining_session_tables_table_id NOT NULL,
    assigned_at TIMESTAMPTZ CONSTRAINT nn_dining_session_tables_assigned_at NOT NULL DEFAULT now(),
    released_at TIMESTAMPTZ,
    assigned_by UUID CONSTRAINT nn_dining_session_tables_assigned_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_dining_session_tables_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_dining_session_tables PRIMARY KEY (id),
    CONSTRAINT ck_dining_session_tables_1 CHECK (released_at IS NULL OR released_at > assigned_at)
);
ALTER TABLE dining_tables ADD CONSTRAINT fk_dining_tables_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_tables ADD CONSTRAINT fk_dining_tables_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_table_status_history ADD CONSTRAINT fk_dining_table_status_history_dining_table_id FOREIGN KEY (dining_table_id) REFERENCES dining_tables (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_table_status_history ADD CONSTRAINT fk_dining_table_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_status_history ADD CONSTRAINT fk_reservation_status_history_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_status_history ADD CONSTRAINT fk_reservation_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_table_assignments ADD CONSTRAINT fk_reservation_table_assignments_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_table_assignments ADD CONSTRAINT fk_reservation_table_assignments_table_id FOREIGN KEY (table_id) REFERENCES dining_tables (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_table_assignments ADD CONSTRAINT fk_reservation_table_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_evaluations ADD CONSTRAINT fk_reservation_evaluations_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_sessions ADD CONSTRAINT fk_dining_sessions_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_sessions ADD CONSTRAINT fk_dining_sessions_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_sessions ADD CONSTRAINT fk_dining_sessions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_sessions ADD CONSTRAINT fk_dining_sessions_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_session_tables ADD CONSTRAINT fk_dining_session_tables_dining_session_id FOREIGN KEY (dining_session_id) REFERENCES dining_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_session_tables ADD CONSTRAINT fk_dining_session_tables_table_id FOREIGN KEY (table_id) REFERENCES dining_tables (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_session_tables ADD CONSTRAINT fk_dining_session_tables_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_table_assignments ADD CONSTRAINT ex_reservation_tables_period EXCLUDE USING gist (table_id WITH =, occupied_period WITH &&) WHERE (released_at IS NULL);
CREATE INDEX ix_dining_table_status_history_1 ON dining_table_status_history (dining_table_id);
CREATE INDEX ix_reservations_1 ON reservations (status, reservation_at, id);
CREATE INDEX ix_reservations_2 ON reservations (customer_id);
CREATE INDEX ix_reservation_status_history_1 ON reservation_status_history (reservation_id);
CREATE INDEX ix_reservation_table_assignments_1 ON reservation_table_assignments (reservation_id);
CREATE INDEX ix_reservation_table_assignments_2 ON reservation_table_assignments (table_id);
CREATE INDEX ix_reservation_evaluations_1 ON reservation_evaluations (reservation_id);
CREATE INDEX ix_dining_sessions_1 ON dining_sessions (reservation_id);
CREATE INDEX ix_dining_sessions_2 ON dining_sessions (customer_id);
CREATE INDEX ix_dining_session_tables_1 ON dining_session_tables (dining_session_id);
CREATE INDEX ix_dining_session_tables_2 ON dining_session_tables (table_id);
