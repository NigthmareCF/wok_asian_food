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
import org.junit.jupiter.api.Test;

class ConfiguredReservationHoursIntegrationTest extends PostgresIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private final ObjectMapper json = new ObjectMapper();

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
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", hoursId);
        }
    }
}
