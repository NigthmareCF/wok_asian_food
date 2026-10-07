-- Groups above the normal party bands remain subject to mandatory human review.
SET search_path = wok, public;

ALTER TABLE reservation_evaluations
    DROP CONSTRAINT ck_reservation_evaluations_party_size,
    DROP CONSTRAINT ck_reservation_evaluations_history_snapshot,
    ADD CONSTRAINT ck_reservation_evaluations_party_size CHECK (party_size IS NULL OR party_size > 0),
    ADD CONSTRAINT ck_reservation_evaluations_history_snapshot CHECK (
        request_payload_hash IS NULL OR (requested_for_at IS NOT NULL AND party_size > 0)
    );
