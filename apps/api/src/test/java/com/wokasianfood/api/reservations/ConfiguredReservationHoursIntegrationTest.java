package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ConfiguredReservationHoursIntegrationTest extends PostgresIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private final ObjectMapper json = new ObjectMapper();
    @Autowired private ReservationRequestService reservationRequests;

    @Test
    void publicEvaluationUsesActiveDineInHoursFromDatabase() throws Exception {
        LocalDate target = LocalDate.now(ZONE).plusDays(7);
        UUID hoursId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.business_hours (id, service_type, weekday, opens_at, closes_at, timezone_name)
            VALUES (?, 'DINE_IN', ?, '16:00', '20:00', 'America/Guatemala')
            """, hoursId, target.getDayOfWeek().getValue());

        try {
            Instant requestedAt = LocalDateTime.of(target, LocalTime.NOON).atZone(ZONE).toInstant();
            var response = post("/api/v1/public/reservations/evaluate", null, """
                {"guests":2,"requestedAt":"%s","preorder":false}
                """.formatted(requestedAt));
            assertThat(response.statusCode()).isBetween(200, 299);
            JsonNode result = json.readTree(response.body());
            assertThat(result.path("confirmed").asBoolean()).isFalse();
            assertThat(result.path("assessment").path("decision").asText()).isEqualTo("SUGGEST_OTHER_TIME");
            assertThat(result.path("assessment").path("reasonCodes").toString()).contains("OUTSIDE_TABLE_WINDOW");
            assertThat(result.path("assessment").path("alternativeTimes").get(0).asText())
                    .isEqualTo(LocalDateTime.of(target, LocalTime.of(16, 0)).atZone(ZONE).toInstant().toString());
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", hoursId);
        }
    }

    @Test
    void submittedAlternativeSlotsArePersistedAndReturnedOnIdempotentReplay() throws Exception {
        UUID userId = createUserWithRole("reservation-alternative-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String token = tokenFor(userId);
        UUID idempotencyKey = UUID.randomUUID();
        Instant requestedAt = Instant.now().plusSeconds(2 * 60 * 60L);
        String body = """
            {"guests":2,"requestedAt":"%s","preorder":false,"notes":null}
            """.formatted(requestedAt);
        String path = "/api/v1/client/reservations";

        var first = post(path, token, body, Map.of("Idempotency-Key", idempotencyKey.toString()));
        assertThat(first.statusCode()).isEqualTo(200);
        JsonNode submitted = json.readTree(first.body());
        assertThat(submitted.path("decision").asText()).isEqualTo("REJECT");
        assertThat(submitted.path("alternativeTimes").size()).isGreaterThan(0);
        UUID requestId = UUID.fromString(submitted.path("requestId").asText());
        assertThat(reservationRequests.history(userId).getFirst().alternativeTimes()).isNotEmpty();
        var historyResponse = get("/api/v1/client/reservations", token);
        assertThat(historyResponse.statusCode()).as("history %s", historyResponse.body()).isEqualTo(200);
        JsonNode stored = json.readTree(historyResponse.body());
        assertThat(stored.size()).as("history %s", historyResponse.body()).isEqualTo(1);
        assertThat(stored.get(0).path("alternativeTimes").size()).isGreaterThan(0);

        var retry = post(path, token, body, Map.of("Idempotency-Key", idempotencyKey.toString()));
        JsonNode replay = json.readTree(retry.body());
        assertThat(retry.statusCode()).isEqualTo(200);
        assertThat(replay.path("requestId").asText()).isEqualTo(requestId.toString());
        assertThat(replay.path("alternativeTimes")).isEqualTo(submitted.path("alternativeTimes"));
    }
}
