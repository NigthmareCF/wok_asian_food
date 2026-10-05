package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReservationReviewScheduleIntegrationTest extends PostgresIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void staffCannotConfirmWhenCurrentBusinessHoursNoLongerAllowTheRequestedTime() throws Exception {
        ReviewCase review = createReviewCase(LocalTime.of(14, 0), LocalTime.of(22, 0));
        try {
            var response = decide(review, "CONFIRM");
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(json.readTree(response.body()).path("status").asText()).isEqualTo("CONFIRMED");
        } finally {
            cleanup(review);
        }
    }

    @Test
    void staffMustRevalidateAgainstCurrentHoursBeforeConfirming() throws Exception {
        ReviewCase review = createReviewCase(LocalTime.of(14, 0), LocalTime.of(22, 0));
        try {
            jdbc.update("UPDATE wok.business_hours SET closes_at = '15:00', row_version = row_version + 1 "
                    + "WHERE id = ?", review.hoursId());
            var response = decide(review, "CONFIRM");
            assertThat(response.statusCode()).isEqualTo(409);
            assertThat(response.body()).contains("horario de servicio vigente");
            assertThat(jdbc.queryForObject("SELECT status FROM wok.reservations WHERE id = ?", String.class,
                    review.reservationId())).isEqualTo("REQUESTED");
        } finally {
            cleanup(review);
        }
    }

    private ReviewCase createReviewCase(LocalTime opensAt, LocalTime closesAt) throws Exception {
        LocalDate date = LocalDate.now(ZONE).plusDays(1);
        UUID hoursId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.business_hours (id, service_type, weekday, opens_at, closes_at, timezone_name)
            VALUES (?, 'DINE_IN', ?, ?, ?, 'America/Guatemala')
            """, hoursId, date.getDayOfWeek().getValue(), opensAt, closesAt);

        UUID customerUser = createUserWithRole("review-client-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        jdbc.update("INSERT INTO wok.customer_profiles (user_id, full_name) VALUES (?, 'Cliente de prueba')", customerUser);
        String customerToken = tokenFor(customerUser);
        Instant requestedAt = date.atTime(16, 0).atZone(ZONE).toInstant();
        var submitted = post("/api/v1/client/reservations", customerToken,
                "{\"guests\":2,\"requestedAt\":\"" + requestedAt + "\",\"preorder\":true}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(submitted.statusCode()).as(submitted.body()).isEqualTo(202);
        UUID reservationId = UUID.fromString(json.readTree(submitted.body()).path("reservationId").asText());
        return new ReviewCase(hoursId, reservationId, tokenForRole("OPERATIONAL"));
    }

    private java.net.http.HttpResponse<String> decide(ReviewCase review, String decision) {
        return send("PUT", "/api/v1/operational/reservations/" + review.reservationId() + "/decision",
                review.staffToken(), """
                    {"decision":"%s","reason":"Revisión del horario solicitado","expectedVersion":1}
                    """.formatted(decision), Map.of());
    }

    private void cleanup(ReviewCase review) {
        jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", review.hoursId());
    }

    private record ReviewCase(UUID hoursId, UUID reservationId, String staffToken) {}
}
