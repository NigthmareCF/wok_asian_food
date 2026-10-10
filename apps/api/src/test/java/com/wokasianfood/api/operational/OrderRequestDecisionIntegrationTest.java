package com.wokasianfood.api.operational;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderRequestDecisionIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void listsRequestsWithCompatibleSummaryAndStrictCombinedFilters() {
        UUID menuItemId = seedMenuItem("Wok List", "20.00", "WOK_LIST", 60);
        String customer = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        String requestId = submit(customer, menuItemId, 1,
                Instant.now().plusSeconds(900).toString()).path("requestId").asText();

        for (String query : new String[] { "", "?type=PICKUP",
                "?status=PENDING_REVIEW&type=PICKUP" }) {
            JsonNode requests = body(get("/api/v1/operational/order-requests" + query, operator));
            assertThat(requests.isArray()).isTrue();
            assertThat(requests.valueStream()
                    .anyMatch(request -> requestId.equals(request.path("requestId").asText())))
                    .as("request listed for query %s", query).isTrue();
        }

        JsonNode rejected = body(get("/api/v1/operational/order-requests?status=REJECTED", operator));
        assertThat(rejected.valueStream()
                .noneMatch(request -> requestId.equals(request.path("requestId").asText()))).isTrue();
        assertThat(get("/api/v1/operational/order-requests?status=INVALID", operator).statusCode())
                .isEqualTo(400);
        assertThat(get("/api/v1/operational/order-requests", customer).statusCode()).isEqualTo(403);
        for (String query : new String[] { "?status=", "?status=%20pending_review%20", "?type=",
                "?type=INVALID", "?status=PENDING_REVIEW&type=INVALID" }) {
            assertThat(get("/api/v1/operational/order-requests" + query, operator).statusCode())
                    .as("invalid filter %s", query).isEqualTo(400);
        }
        JsonNode deliveries = body(get("/api/v1/operational/order-requests?type=DELIVERY", operator));
        assertThat(deliveries.valueStream()
                .noneMatch(request -> requestId.equals(request.path("requestId").asText()))).isTrue();
        String detailPath = "/api/v1/operational/order-requests/" + requestId;
        JsonNode detail = body(get(detailPath, operator));
        assertThat(detail.path("requestId").asText()).isEqualTo(requestId);
        assertThat(detail.path("customerNote").asText()).isEqualTo("prueba");
        assertThat(detail.path("lines").get(0).path("name").asText()).isEqualTo("Wok List");
        assertThat(detail.path("lines").get(0).path("currencyId").asText()).isNotBlank();
        assertThat(get(detailPath, customer).statusCode()).isEqualTo(403);
        assertThat(get("/api/v1/operational/order-requests/" + UUID.randomUUID(), operator).statusCode())
                .isEqualTo(404);
    }

    @Test
    void acceptsPickupRequestCreatingOrderAndReplaysDecision() {
        UUID menuItemId = seedMenuItem("Wok Pickup", "25.00", "WOK_DECISION", 120);
        String customer = tokenForRole("CLIENT");
        JsonNode submitted = submit(customer, menuItemId, 2, Instant.now().plusSeconds(900).toString());
        UUID requestId = UUID.fromString(submitted.path("requestId").asText());
        assertThat(submitted.path("status").asText()).isEqualTo("PENDING_REVIEW");

        String operator = tokenForRole("OPERATIONAL");
        JsonNode pending = body(get("/api/v1/operational/order-requests?status=PENDING_REVIEW", operator));
        JsonNode listedRequest = pending.valueStream()
                .filter(request -> request.path("requestId").asText().equals(requestId.toString()))
                .findFirst()
                .orElseThrow();
        assertThat(listedRequest.path("items").get(0).path("name").asText()).isEqualTo("Wok Pickup");
        assertThat(get("/api/v1/operational/order-requests", customer).statusCode()).isEqualTo(403);
        JsonNode decision = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        assertThat(decision.path("status").asText()).isEqualTo("ACCEPTED");
        assertThat(decision.path("idempotentReplay").asBoolean()).isFalse();
        UUID orderId = UUID.fromString(decision.path("orderId").asText());

        var order = jdbc.queryForMap("""
                SELECT o.channel, o.status, o.total, a.dining_table_id, a.status AS account_status,
                       (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id) AS items
                FROM wok.orders o JOIN wok.order_accounts a ON a.id = o.account_id WHERE o.id = ?
                """, orderId);
        assertThat(order.get("channel")).isEqualTo("PICKUP");
        assertThat(order.get("status")).isEqualTo("SENT");
        assertThat((BigDecimal) order.get("total")).isEqualByComparingTo("50.00");
        assertThat(order.get("dining_table_id")).isNull();
        assertThat(order.get("account_status")).isEqualTo("OPEN");
        assertThat(((Number) order.get("items")).intValue()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT fulfillment FROM wok.order_items WHERE order_id = ?", String.class,
                orderId)).isEqualTo("TAKEAWAY");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isEqualTo(orderId);
        JsonNode clientDetail = body(get("/api/v1/client/order-requests/" + requestId, customer));
        assertThat(clientDetail.path("orderId").asText()).isEqualTo(orderId.toString());
        assertThat(clientDetail.path("orderStatus").asText()).isEqualTo("SENT");
        assertThat(get("/api/v1/client/order-requests/" + requestId, tokenForRole("CLIENT")).statusCode())
                .isEqualTo(404);
        assertThat(count("""
                SELECT count(*) FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type = 'ACCEPTED'
                """, requestId)).isEqualTo(1);

        JsonNode replay = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(replay.path("orderId").asText()).isEqualTo(orderId.toString());
        assertThat(count("SELECT count(*) FROM wok.orders WHERE account_id = (SELECT account_id FROM wok.orders WHERE id = ?)",
                orderId)).isEqualTo(1);
        assertThat(count("""
                SELECT count(*) FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type = 'ACCEPTED'
                """, requestId)).isEqualTo(1);

        assertThat(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"REJECT","reason":"tarde"}
                """).statusCode()).isEqualTo(409);
        assertThat(post("/api/v1/operational/order-requests/" + requestId + "/decision", tokenForRole("CLIENT"),
                """
                {"action":"REJECT","reason":"no corresponde"}
                """).statusCode()).isEqualTo(403);
    }

    @Test
    void rejectsPickupRequestRequiringReason() {
        UUID menuItemId = seedMenuItem("Wok Reject", "30.00", "WOK_REJECT", 60);
        String client = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        UUID requestId = UUID.fromString(submit(client, menuItemId, 1, Instant.now().plusSeconds(600).toString())
                .path("requestId").asText());

        assertThat(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"REJECT"}
                """).statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");

        JsonNode decided = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"REJECT","reason":"Sin insumos"}
                """));
        assertThat(decided.path("status").asText()).isEqualTo("REJECTED");
        assertThat(decided.hasNonNull("orderId")).isFalse();
        var persisted = jdbc.queryForMap("SELECT status, decision_reason FROM wok.order_requests WHERE id = ?", requestId);
        assertThat(persisted.get("status")).isEqualTo("REJECTED");
        assertThat(persisted.get("decision_reason")).isEqualTo("Sin insumos");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();
        assertThat(count("""
                SELECT count(*) FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type = 'REJECTED'
                """, requestId)).isEqualTo(1);
    }

    @Test
    void keepsRequestPendingWhenProductBecomesUnavailable() {
        UUID menuItemId = seedMenuItem("Wok Gone", "12.00", "WOK_GONE", 60);
        UUID requestId = UUID.fromString(submit(tokenForRole("CLIENT"), menuItemId, 1,
                Instant.now().plusSeconds(600).toString()).path("requestId").asText());
        jdbc.update("UPDATE wok.menu_items SET status = 'INACTIVE' WHERE id = ?", menuItemId);

        assertThat(post("/api/v1/operational/order-requests/" + requestId + "/decision",
                tokenForRole("OPERATIONAL"), """
                {"action":"ACCEPT"}
                """).statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();
    }

    @Test
    void keepsDeliveryRequestPendingUntilItsOperationalFlowExists() {
        UUID menuItemId = seedMenuItem("Wok Delivery", "18.00", "WOK_DELIVERY_DECISION", 60);
        UUID requestId = UUID.fromString(submit(tokenForRole("CLIENT"), menuItemId, 1,
                Instant.now().plusSeconds(600).toString()).path("requestId").asText());
        jdbc.update("""
                UPDATE wok.order_requests
                SET fulfillment_type = 'DELIVERY', delivery_address = 'Zona 1, Ciudad de Guatemala',
                    contact_phone = '+502 5555-0101', payment_preference = 'CASH_ON_DELIVERY'
                WHERE id = ?
                """, requestId);

        var response = post("/api/v1/operational/order-requests/" + requestId + "/decision",
                tokenForRole("OPERATIONAL"), """
                {"action":"ACCEPT"}
                """);

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try {
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private JsonNode submit(String token, UUID menuItemId, int quantity, String requestedFor) {
        var local = Instant.parse(requestedFor).atZone(ZoneId.of("America/Guatemala"));
        LocalTime requestedTime = local.toLocalTime();
        LocalTime opensAt = requestedTime.isBefore(LocalTime.of(1, 0))
                ? LocalTime.MIDNIGHT : requestedTime.minusHours(1);
        LocalTime closesAt = requestedTime.isAfter(LocalTime.of(22, 59))
                ? LocalTime.of(23, 59, 59) : requestedTime.plusHours(1);
        jdbc.update("""
                INSERT INTO wok.business_hours
                    (service_type, weekday, opens_at, closes_at, timezone_name)
                VALUES ('RESTAURANT', ?, ?, ?, 'America/Guatemala')
                """, local.getDayOfWeek().getValue(), opensAt, closesAt);
        return body(post("/api/v1/client/order-requests", token, """
                {"requestedFor":"%s","customerNote":"prueba","items":[{"menuItemId":"%s","quantity":%d}]}
                """.formatted(requestedFor, menuItemId, quantity),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
    }

    private int count(String sql, Object... arguments) {
        return jdbc.queryForObject(sql, Integer.class, arguments);
    }

    private UUID seedMenuItem(String name, String price, String stationCode, int preparationSeconds) {
        String sku = ("SKU-" + UUID.randomUUID()).toString().toUpperCase();
        String category = "Categoría " + stationCode;
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("""
                INSERT INTO wok.units (code, name, dimension, factor_to_base)
                VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING
                """);
        jdbc.update("""
                INSERT INTO wok.preparation_areas (code, name) VALUES (?, ?) ON CONFLICT (code) DO NOTHING
                """, stationCode, "Estación " + stationCode);
        jdbc.update("INSERT INTO wok.menu_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING", category);

        UUID itemTypeId = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unitId = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID areaId = jdbc.queryForObject("SELECT id FROM wok.preparation_areas WHERE code = ?", UUID.class, stationCode);
        UUID categoryId = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, category);
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID itemId = jdbc.queryForObject("""
                INSERT INTO wok.items (sku, name, item_type_id, base_unit_id) VALUES (?, ?, ?, ?) RETURNING id
                """, UUID.class, sku, name, itemTypeId, unitId);
        return jdbc.queryForObject("""
                INSERT INTO wok.menu_items
                    (item_id, category_id, preparation_area_id, name, price, currency_id,
                     visibility, status, estimated_preparation_seconds)
                VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', 'ACTIVE', ?) RETURNING id
                """, UUID.class, itemId, categoryId, areaId, name, new BigDecimal(price), currencyId, preparationSeconds);
    }
}
