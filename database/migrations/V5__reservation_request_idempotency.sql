-- Client reservation submissions are evaluations/requests, never automatic confirmations.
SET search_path = wok, public;

ALTER TABLE reservation_evaluations
    ADD COLUMN requester_user_id UUID,
    ADD COLUMN minimum_occupancy_minutes INTEGER,
    ADD COLUMN request_payload_hash TEXT;

UPDATE reservation_evaluations evaluation
SET requester_user_id = profile.user_id,
    minimum_occupancy_minutes = evaluation.estimated_occupancy_minutes
FROM reservations reservation
JOIN customer_profiles profile ON profile.id = reservation.customer_id
WHERE evaluation.reservation_id = reservation.id;

ALTER TABLE reservation_evaluations
    ADD CONSTRAINT fk_reservation_evaluations_requester_user_id
        FOREIGN KEY (requester_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT ck_reservation_evaluations_minimum_occupancy
        CHECK (minimum_occupancy_minutes IS NULL OR
               (minimum_occupancy_minutes > 0 AND minimum_occupancy_minutes <= estimated_occupancy_minutes)),
    ADD CONSTRAINT ck_reservation_evaluations_payload_hash
        CHECK (request_payload_hash IS NULL OR request_payload_hash ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX uq_reservation_evaluations_request_id
    ON reservation_evaluations (request_id);

CREATE INDEX ix_reservation_evaluations_requester_user_id
    ON reservation_evaluations (requester_user_id, evaluated_at DESC);
