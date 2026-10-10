package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReservationCapabilityIntegrationTest extends PostgresIntegrationTest {

    @org.junit.jupiter.api.AfterEach
    void restoreCapability() { setReservationsStatus("ENABLED"); }

    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void enabledReservationsCreateEvaluationReservationAndHistory() {
        UUID userId = customer("reservations-enabled");
        setReservationsStatus("ENABLED");

        HttpResponse<String> response = submit(userId);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(202);
        JsonNode result = body(response);
        assertThat(result.path("submitted").asBoolean()).isTrue();
        assertThat(result.path("reservationId").isMissingNode()).isFalse();
        UUID reservationId = UUID.fromString(result.path("reservationId").asText());
        assertThat(count("SELECT count(*) FROM wok.reservation_evaluations WHERE requester_user_id = ?", userId))
                .isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.reservations WHERE id = ? AND status = 'REQUESTED'", reservationId))
                .isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.reservation_status_history WHERE reservation_id = ?", reservationId))
                .isEqualTo(1);
    }

    @Test
    void policyPublishesConfiguredMinutesOnlyToClients() {
        var guest = get("/api/v1/client/reservations/policy", null);
        assertThat(guest.statusCode()).isEqualTo(401);
        assertThat(get("/api/v1/client/reservations/policy", tokenForRole("OPERATIONAL")).statusCode()).isEqualTo(403);
        var response = get("/api/v1/client/reservations/policy", tokenFor(customer("policy")));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        var policy = body(response);
        assertThat(policy.path("minimumNoticeMinutes").asInt()).isEqualTo(120);
        assertThat(policy.path("minimumNoticeHours").asInt()).isEqualTo(2);
        assertThat(policy.path("additionalPairMinutes").asInt()).isEqualTo(15);
        assertThat(policy.path("timeZone").asText()).isEqualTo("America/Guatemala");
        assertThat(policy.path("firstRequestTime").asText()).startsWith("14:00");
        assertThat(policy.path("lastRequestTime").asText()).startsWith("21:15");
    }

    @Test
    void pausedReservationsRejectBeforeAnyPersistence() {
        assertUnavailableWithoutWrites("PAUSED");
    }

    @Test
    void disabledReservationsRejectBeforeAnyPersistence() {
        assertUnavailableWithoutWrites("DISABLED");
    }

    private void assertUnavailableWithoutWrites(String status) {
        UUID userId = customer("reservations-" + status.toLowerCase());
        setReservationsStatus(status);
        int evaluationsBefore = count("SELECT count(*) FROM wok.reservation_evaluations WHERE requester_user_id = ?", userId);
        int reservationsBefore = count("""
                SELECT count(*) FROM wok.reservations r
                JOIN wok.customer_profiles cp ON cp.id = r.customer_id
                WHERE cp.user_id = ?
                """, userId);
        int historyBefore = count("""
                SELECT count(*) FROM wok.reservation_status_history h
                JOIN wok.reservations r ON r.id = h.reservation_id
                JOIN wok.customer_profiles cp ON cp.id = r.customer_id
                WHERE cp.user_id = ?
                """, userId);

        HttpResponse<String> response = submit(userId);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(503);
        assertThat(count("SELECT count(*) FROM wok.reservation_evaluations WHERE requester_user_id = ?", userId))
                .isEqualTo(evaluationsBefore);
        assertThat(count("""
                SELECT count(*) FROM wok.reservations r
                JOIN wok.customer_profiles cp ON cp.id = r.customer_id
                WHERE cp.user_id = ?
                """, userId)).isEqualTo(reservationsBefore);
        assertThat(count("""
                SELECT count(*) FROM wok.reservation_status_history h
                JOIN wok.reservations r ON r.id = h.reservation_id
                JOIN wok.customer_profiles cp ON cp.id = r.customer_id
                WHERE cp.user_id = ?
                """, userId)).isEqualTo(historyBefore);
    }

    private HttpResponse<String> submit(UUID userId) {
        return post("/api/v1/client/reservations", tokenFor(userId), """
                {"guests":2,"requestedAt":"%s","preorder":true,"notes":"prueba de capacidad"}
                """.formatted(requestedAt()), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
    }

    private UUID customer(String prefix) {
        UUID userId = createUserWithRole(prefix + "-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        jdbc.update("""
                INSERT INTO wok.customer_profiles (user_id, full_name)
                VALUES (?, ?)
                """, userId, prefix);
        return userId;
    }

    private void setReservationsStatus(String status) {
        assertThat(jdbc.update("""
                UPDATE wok.service_capabilities
                SET status = ?, effective_from = now(), effective_until = NULL
                WHERE code = 'RESERVATIONS'
                """, status)).isEqualTo(1);
    }

    private String requestedAt() {
        ZonedDateTime tomorrow = ZonedDateTime.now(RESTAURANT_ZONE).plusDays(1)
                .with(LocalTime.of(18, 0));
        return tomorrow.toInstant().toString();
    }

    private int count(String sql, Object... arguments) {
        return jdbc.queryForObject(sql, Integer.class, arguments);
    }

    private JsonNode body(HttpResponse<String> response) {
        try {
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }
}
