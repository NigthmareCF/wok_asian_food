package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReservationDecisionIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void expiredConfirmationReturnsConflictWithoutChangingReservationHistoryOrAudit() {
        UUID reservationId = createReservation(Instant.now().minusSeconds(60));
        String operator = tokenForRole("OPERATIONAL");
        var before = jdbc.queryForMap("SELECT status, row_version FROM wok.reservations WHERE id = ?", reservationId);

        var response = decide(reservationId, operator, "CONFIRM", 1, "confirmación vencida");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
        assertThat(jdbc.queryForMap("SELECT status, row_version FROM wok.reservations WHERE id = ?", reservationId))
                .isEqualTo(before);
        assertThat(count("SELECT count(*) FROM wok.reservation_status_history WHERE reservation_id = ?", reservationId))
                .isZero();
        assertThat(count("""
                SELECT count(*) FROM wok.audit_logs
                WHERE entity_type = 'RESERVATION' AND entity_id = ?
                """, reservationId)).isZero();
    }

    @Test
    void expiredRejectionRemainsAllowedAndRecordsTheDecision() {
        UUID reservationId = createReservation(Instant.now().minusSeconds(60));
        UUID operatorId = createUserWithRole("reservation-reject-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");

        var response = decide(reservationId, tokenFor(operatorId), "REJECT", 1, "Ya pasó la hora");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        JsonNode result = body(response);
        assertThat(result.path("decision").asText()).isEqualTo("REJECT");
        assertThat(result.path("status").asText()).isEqualTo("CANCELLED");
        assertThat(result.path("rowVersion").asInt()).isEqualTo(2);
        var reservation = jdbc.queryForMap("""
                SELECT status, row_version, cancellation_reason, cancelled_at, updated_by
                FROM wok.reservations WHERE id = ?
                """, reservationId);
        assertThat(reservation.get("status")).isEqualTo("CANCELLED");
        assertThat(reservation.get("row_version")).isEqualTo(2);
        assertThat(reservation.get("cancellation_reason")).isEqualTo("STAFF_REJECTED: Ya pasó la hora");
        assertThat(reservation.get("cancelled_at")).isNotNull();
        assertThat(reservation.get("updated_by")).isEqualTo(operatorId);
        assertThat(count("SELECT count(*) FROM wok.reservation_status_history WHERE reservation_id = ?", reservationId))
                .isEqualTo(1);
        assertThat(count("""
                SELECT count(*) FROM wok.audit_logs
                WHERE entity_type = 'RESERVATION' AND entity_id = ? AND action = 'RESERVATION_REVIEWED'
                """, reservationId)).isEqualTo(1);
    }

    @Test
    void futureConfirmationRemainsAllowed() {
        UUID reservationId = createReservation(Instant.now().plusSeconds(3600));
        UUID operatorId = createUserWithRole("reservation-confirm-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");

        var response = decide(reservationId, tokenFor(operatorId), "CONFIRM", 1, "Capacidad confirmada");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        JsonNode result = body(response);
        assertThat(result.path("decision").asText()).isEqualTo("CONFIRM");
        assertThat(result.path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(result.path("rowVersion").asInt()).isEqualTo(2);
        assertThat(jdbc.queryForMap("SELECT status, row_version FROM wok.reservations WHERE id = ?", reservationId))
                .containsEntry("status", "CONFIRMED").containsEntry("row_version", 2);
        assertThat(count("SELECT count(*) FROM wok.reservation_status_history WHERE reservation_id = ?", reservationId))
                .isEqualTo(1);
        assertThat(count("""
                SELECT count(*) FROM wok.audit_logs
                WHERE entity_type = 'RESERVATION' AND entity_id = ? AND action = 'RESERVATION_REVIEWED'
                """, reservationId)).isEqualTo(1);
    }

    private UUID createReservation(Instant reservationAt) {
        UUID customerUserId = createUserWithRole("reservation-customer-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID customerId = jdbc.queryForObject("""
                INSERT INTO wok.customer_profiles (user_id, full_name)
                VALUES (?, 'Reserva de prueba') RETURNING id
                """, UUID.class, customerUserId);
        return jdbc.queryForObject("""
                INSERT INTO wok.reservations
                    (customer_id, party_size, reservation_at, ends_at, status, notes, created_by)
                VALUES (?, 2, ?, ?, 'REQUESTED', 'Prueba de decisión', ?)
                RETURNING id
                """, UUID.class, customerId, Timestamp.from(reservationAt),
                Timestamp.from(reservationAt.plusSeconds(7200)), customerUserId);
    }

    private java.net.http.HttpResponse<String> decide(UUID reservationId, String token, String decision,
                                                       int expectedVersion, String reason) {
        return send("PUT", "/api/v1/operational/reservations/" + reservationId + "/decision", token,
                """
                {"decision":"%s","reason":"%s","expectedVersion":%d}
                """.formatted(decision, reason, expectedVersion),
                Map.of("X-Request-Id", UUID.randomUUID().toString()));
    }

    private JsonNode body(java.net.http.HttpResponse<String> response) {
        try {
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private int count(String sql, Object... arguments) {
        return jdbc.queryForObject(sql, Integer.class, arguments);
    }
}
