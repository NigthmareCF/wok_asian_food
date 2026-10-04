package com.wokasianfood.api.operational;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderRequestDecisionIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void acceptsPickupRequestCreatingOrderAndReplaysDecision() {
        UUID menuItemId = seedMenuItem("Wok Pickup", "25.00", "WOK_DECISION", 120);
        JsonNode submitted = submit(tokenForRole("CLIENT"), menuItemId, 2, Instant.now().plusSeconds(900).toString());
        UUID requestId = UUID.fromString(submitted.path("requestId").asText());
        assertThat(submitted.path("status").asText()).isEqualTo("PENDING_REVIEW");

        String operator = tokenForRole("OPERATIONAL");
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

    @Test
    void listsAndLoadsOperationalDeliveryRequestDetailsWithPermissionChecks() {
        UUID menuItemId = seedMenuItem("Wok Delivery Review", "18.00", "WOK_DELIVERY_REVIEW", 60);
        String client = tokenForRole("CLIENT");
        UUID requestId = UUID.fromString(submit(client, menuItemId, 2,
                Instant.now().plusSeconds(900).toString()).path("requestId").asText());
        jdbc.update("""
                UPDATE wok.order_requests
                SET fulfillment_type = 'DELIVERY', delivery_address = 'Zona 1, Ciudad de Guatemala',
                    delivery_reference = 'Portón negro', contact_phone = '+502 5555-0101',
                    payment_preference = 'CASH_ON_DELIVERY'
                WHERE id = ?
                """, requestId);
        String operator = tokenForRole("OPERATIONAL");

        var listResponse = get("/api/v1/operational/order-requests?status=PENDING_REVIEW&fulfillmentType=delivery", operator);
        assertThat(listResponse.statusCode()).isEqualTo(200);
        JsonNode list = body(listResponse);
        JsonNode listedRequest = null;
        for (JsonNode item : list) {
            if (requestId.toString().equals(item.path("requestId").asText())) listedRequest = item;
        }
        assertThat(listedRequest).isNotNull();
        assertThat(listedRequest.path("fulfillmentType").asText()).isEqualTo("DELIVERY");
        assertThat(listedRequest.path("deliveryAddress").asText()).isEqualTo("Zona 1, Ciudad de Guatemala");
        assertThat(listedRequest.path("contactPhone").asText()).isEqualTo("+502 5555-0101");

        var detailsResponse = get("/api/v1/operational/order-requests/" + requestId, operator);
        assertThat(detailsResponse.statusCode()).isEqualTo(200);
        JsonNode details = body(detailsResponse);
        assertThat(details.path("request").path("paymentPreference").asText()).isEqualTo("CASH_ON_DELIVERY");
        assertThat(details.path("request").path("deliveryReference").asText()).isEqualTo("Portón negro");
        assertThat(details.path("items")).hasSize(1);
        assertThat(details.path("items").get(0).path("quantity").asInt()).isEqualTo(2);

        assertThat(get("/api/v1/operational/order-requests/" + requestId, client).statusCode()).isEqualTo(403);
        assertThat(get("/api/v1/operational/order-requests?status=UNKNOWN", operator).statusCode()).isEqualTo(400);
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
