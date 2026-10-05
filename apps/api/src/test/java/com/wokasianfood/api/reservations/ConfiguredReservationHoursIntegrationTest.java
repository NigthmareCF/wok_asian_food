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

    @Test
    void clientReservationStoresPreorderSnapshotsWithoutCreatingAnOrderOrStockReservation() throws Exception {
        UUID userId = createUserWithRole("reservation-preorder-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        jdbc.update("INSERT INTO wok.customer_profiles (user_id, full_name) VALUES (?, 'Cliente preorden')", userId);
        UUID menuItemId = createMenuItem();
        UUID groupId = jdbc.queryForObject("""
            INSERT INTO wok.modifier_groups (name, min_selection, max_selection, required)
            VALUES ('Tamaño preorden', 1, 1, true) RETURNING id
            """, UUID.class);
        UUID modifierId = jdbc.queryForObject("INSERT INTO wok.modifiers (group_id, name, price_delta) VALUES (?, 'Grande', 3.00) RETURNING id",
                UUID.class, groupId);
        jdbc.update("INSERT INTO wok.menu_item_modifier_groups (menu_item_id, group_id) VALUES (?, ?)", menuItemId, groupId);
        UUID requestId = UUID.randomUUID();
        LocalDate targetDate = LocalDate.now(ZONE).plusDays(7);
        if (targetDate.getDayOfWeek() == java.time.DayOfWeek.MONDAY) targetDate = targetDate.plusDays(1);
        Instant requestedAt = LocalDateTime.of(targetDate, LocalTime.of(18, 0)).atZone(ZONE).toInstant();
        String body = """
            {"guests":2,"requestedAt":"%s","preorder":true,"notes":"Sin picante",
             "items":[{"menuItemId":"%s","quantity":2,"modifierIds":["%s"]}]}
            """.formatted(requestedAt, menuItemId, modifierId);
        String path = "/api/v1/client/reservations";
        String token = tokenFor(userId);

        var first = post(path, token, body, Map.of("Idempotency-Key", requestId.toString()));
        assertThat(first.statusCode()).as(first.body()).isBetween(200, 299);
        JsonNode result = json.readTree(first.body());
        assertThat(result.path("submitted").asBoolean()).isTrue();
        UUID reservationId = UUID.fromString(result.path("reservationId").asText());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.reservation_request_items WHERE request_id = ?", Integer.class, requestId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT unit_price FROM wok.reservation_request_items WHERE request_id = ?", java.math.BigDecimal.class, requestId))
                .isEqualByComparingTo("23.00");
        assertThat(jdbc.queryForObject("SELECT line_total FROM wok.reservation_request_items WHERE request_id = ?", java.math.BigDecimal.class, requestId))
                .isEqualByComparingTo("46.00");
        assertThat(jdbc.queryForObject("""
            SELECT count(*) FROM wok.reservation_request_item_modifiers m
            JOIN wok.reservation_request_items i ON i.id = m.reservation_request_item_id WHERE i.request_id = ?
            """, Integer.class, requestId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.orders WHERE opened_by = ?", Integer.class, userId)).isZero();

        String operatorToken = tokenForRole("OPERATIONAL");
        Instant from = requestedAt.minusSeconds(60);
        Instant to = requestedAt.plusSeconds(60);
        var schedule = get("/api/v1/operational/reservations/schedule?from=" + from + "&to=" + to, operatorToken);
        assertThat(schedule.statusCode()).as(schedule.body()).isEqualTo(200);
        JsonNode scheduleRows = json.readTree(schedule.body());
        JsonNode scheduleRow = null;
        for (JsonNode row : scheduleRows) if (reservationId.toString().equals(row.path("reservationId").asText())) scheduleRow = row;
        assertThat(scheduleRow).isNotNull();
        assertThat(scheduleRow.path("preorderItems").size()).isEqualTo(1);
        assertThat(scheduleRow.path("preorderItems").get(0).path("unitPrice").decimalValue()).isEqualByComparingTo("23.00");
        assertThat(scheduleRow.path("preorderItems").get(0).path("modifiers").get(0).path("name").asText()).isEqualTo("Grande");
        JsonNode pendingRows = json.readTree(get("/api/v1/operational/reservations/pending", operatorToken).body());
        JsonNode pendingRow = null;
        for (JsonNode row : pendingRows) if (reservationId.toString().equals(row.path("id").asText())) pendingRow = row;
        assertThat(pendingRow).isNotNull();
        assertThat(pendingRow.path("preorderItems").size()).isEqualTo(1);
        assertThat(pendingRow.path("preorderItems").get(0).path("name").asText()).isEqualTo("Platillo preorden");
        assertThat(pendingRow.path("preorderItems").get(0).path("modifiers").get(0).path("name").asText()).isEqualTo("Grande");
        JsonNode clientHistory = json.readTree(get("/api/v1/client/reservations", token).body());
        assertThat(clientHistory).hasSize(1);
        assertThat(clientHistory.get(0).path("preorderItems").size()).isEqualTo(1);
        assertThat(clientHistory.get(0).path("preorderItems").get(0).path("name").asText()).isEqualTo("Platillo preorden");

        UUID invalidRequestId = UUID.randomUUID();
        String invalidBody = body.replace(modifierId.toString(), UUID.randomUUID().toString());
        var invalid = post(path, token, invalidBody, Map.of("Idempotency-Key", invalidRequestId.toString()));
        assertThat(invalid.statusCode()).as(invalid.body()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.reservation_evaluations WHERE request_id = ?", Integer.class, invalidRequestId)).isZero();

        jdbc.update("UPDATE wok.menu_items SET price = 99.00 WHERE id = ?", menuItemId);
        var replay = post(path, token, body, Map.of("Idempotency-Key", requestId.toString()));
        assertThat(replay.statusCode()).isEqualTo(first.statusCode());
        assertThat(jdbc.queryForObject("SELECT unit_price FROM wok.reservation_request_items WHERE request_id = ?", java.math.BigDecimal.class, requestId))
                .isEqualByComparingTo("23.00");
        String changedBody = body.replace("\"quantity\":2", "\"quantity\":3");
        var conflict = post(path, token, changedBody, Map.of("Idempotency-Key", requestId.toString()));
        assertThat(conflict.statusCode()).isEqualTo(409);
    }

    private UUID createMenuItem() {
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('PREORDER_DISH', 'Platillo preorden') ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.units (code, name, dimension, factor_to_base) VALUES ('PREORDER_UNIT', 'Unidad preorden', 'COUNT', 1) ON CONFLICT (code) DO NOTHING");
        UUID type = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'PREORDER_DISH'", UUID.class);
        UUID unit = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'PREORDER_UNIT'", UUID.class);
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        UUID sellable = jdbc.queryForObject("INSERT INTO wok.items (sku, name, item_type_id, base_unit_id, track_inventory) VALUES (?, 'Platillo preorden', ?, ?, false) RETURNING id",
                UUID.class, "PREORDER_" + suffix, type, unit);
        UUID category = jdbc.queryForObject("INSERT INTO wok.menu_categories (name) VALUES (?) RETURNING id", UUID.class, "Preorden " + suffix);
        UUID area = jdbc.queryForObject("INSERT INTO wok.preparation_areas (code, name) VALUES (?, 'Área preorden') RETURNING id", UUID.class, "PREORDER_" + suffix);
        UUID currency = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        return jdbc.queryForObject("""
            INSERT INTO wok.menu_items (item_id, category_id, preparation_area_id, name, price, currency_id,
                visibility, status, estimated_preparation_seconds)
            VALUES (?, ?, ?, 'Platillo preorden', 20.00, ?, 'PUBLIC', 'ACTIVE', 600) RETURNING id
            """, UUID.class, sellable, category, area, currency);
    }
}
