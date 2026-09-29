-- Keep enough of each client request to show an owned history even when no reservation was created.
SET search_path = wok, public;

ALTER TABLE reservation_evaluations
    ADD COLUMN requested_for_at TIMESTAMPTZ,
    ADD COLUMN party_size INTEGER;

UPDATE reservation_evaluations evaluation
SET requested_for_at = reservation.reservation_at,
    party_size = reservation.party_size
FROM reservations reservation
WHERE evaluation.reservation_id = reservation.id;

ALTER TABLE reservation_evaluations
    ADD CONSTRAINT ck_reservation_evaluations_party_size
        CHECK (party_size IS NULL OR party_size BETWEEN 1 AND 50),
    ADD CONSTRAINT ck_reservation_evaluations_history_snapshot
        CHECK (request_payload_hash IS NULL OR
               (requested_for_at IS NOT NULL AND party_size BETWEEN 1 AND 50));

CREATE INDEX ix_reservation_evaluations_request_history
    ON reservation_evaluations (requester_user_id, evaluated_at DESC, request_id DESC);
