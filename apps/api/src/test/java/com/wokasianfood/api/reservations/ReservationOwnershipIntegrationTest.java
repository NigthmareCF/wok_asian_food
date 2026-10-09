package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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

    @Test
    void concurrentClientCancellationIsIdempotentAndWritesOneHistoryEvent() throws Exception {
        UUID owner = createUserWithRole("reservation-cancel-race-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID customerProfile = jdbc.queryForObject("""
            INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, 'Reservation Race Owner') RETURNING id
            """, UUID.class, owner);
        Instant reservationAt = Instant.now().plusSeconds(86400);
        UUID reservation = jdbc.queryForObject("""
            INSERT INTO wok.reservations(customer_id, party_size, reservation_at, ends_at, status, created_by)
            VALUES (?, 2, ?, ?, 'REQUESTED', ?) RETURNING id
            """, UUID.class, customerProfile, Timestamp.from(reservationAt),
                Timestamp.from(reservationAt.plusSeconds(3600)), owner);
        String token = tokenFor(owner);
        String path = "/api/v1/client/reservations/" + reservation;
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent test start timed out");
                return send("DELETE", path, token, null, Map.of());
            });
            var second = executor.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent test start timed out");
                return send("DELETE", path, token, null, Map.of());
            });

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            var firstResponse = first.get(15, TimeUnit.SECONDS);
            var secondResponse = second.get(15, TimeUnit.SECONDS);
            assertThat(List.of(firstResponse.statusCode(), secondResponse.statusCode()))
                    .as(firstResponse.body() + " / " + secondResponse.body())
                    .containsExactly(200, 200);
            assertThat(json.readTree(firstResponse.body()).path("status").asText()).isEqualTo("CANCELLED");
            assertThat(json.readTree(secondResponse.body()).path("status").asText()).isEqualTo("CANCELLED");
        }

        assertThat(jdbc.queryForObject("SELECT status FROM wok.reservations WHERE id = ?", String.class, reservation))
                .isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("""
            SELECT count(*) FROM wok.reservation_status_history
            WHERE reservation_id = ? AND to_status = 'CANCELLED' AND reason = 'CANCELLED_BY_CLIENT'
            """, Integer.class, reservation)).isEqualTo(1);
    }
}
