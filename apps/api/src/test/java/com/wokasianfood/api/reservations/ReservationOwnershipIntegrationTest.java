package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReservationOwnershipIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void clientCannotReadOrCancelAnotherCustomersReservation() throws Exception {
        UUID owner = createUserWithRole("reservation-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID other = createUserWithRole("reservation-other-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID customerProfile = jdbc.queryForObject("""
            INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, 'Reservation Owner') RETURNING id
            """, UUID.class, owner);
        Instant reservationAt = Instant.now().plusSeconds(86400);
        UUID reservation = jdbc.queryForObject("""
            INSERT INTO wok.reservations(customer_id, party_size, reservation_at, ends_at, status, created_by)
            VALUES (?, 2, ?, ?, 'REQUESTED', ?) RETURNING id
            """, UUID.class, customerProfile, Timestamp.from(reservationAt),
                Timestamp.from(reservationAt.plusSeconds(3600)), owner);
        UUID requestId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.reservation_evaluations
                (reservation_id, requester_user_id, request_id, decision, reason_codes, alternatives, conditions,
                 estimated_occupancy_minutes, minimum_occupancy_minutes, request_payload_hash, public_message,
                 policy_version, requested_for_at, party_size)
            VALUES (?, ?, ?, 'ACCEPT', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 90, 75, ?, 'Solicitud recibida',
                    'ownership-test', ?, 2)
            """, reservation, owner, requestId, "a".repeat(64), Timestamp.from(reservationAt));

        var ownerHistory = get("/api/v1/client/reservations", tokenFor(owner));
        assertThat(ownerHistory.statusCode()).isEqualTo(200);
        assertThat(json.readTree(ownerHistory.body())).hasSize(1);

        var otherHistory = get("/api/v1/client/reservations", tokenFor(other));
        assertThat(otherHistory.statusCode()).isEqualTo(200);
        assertThat(json.readTree(otherHistory.body())).isEmpty();

        var foreignCancel = send("DELETE", "/api/v1/client/reservations/" + reservation,
                tokenFor(other), null, java.util.Map.of());
        assertThat(foreignCancel.statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.reservations WHERE id = ?", String.class, reservation))
                .isEqualTo("REQUESTED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.reservation_status_history WHERE reservation_id = ?",
                Integer.class, reservation)).isZero();

        var ownerCancel = send("DELETE", "/api/v1/client/reservations/" + reservation,
                tokenFor(owner), null, java.util.Map.of());
        assertThat(ownerCancel.statusCode()).isEqualTo(200);
        JsonNode result = json.readTree(ownerCancel.body());
        assertThat(result.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.reservation_status_history WHERE reservation_id = ?",
                Integer.class, reservation)).isEqualTo(1);
    }
}
