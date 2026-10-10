package com.wokasianfood.api.operational;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderRequestQueryIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void listsPendingPickupAndDeliveryWithFiltersOrderAndSafeSummary() {
        UUID menuItem = seedMenuItem("Consulta operativa", "18.00", "QUERY_LIST");
        String client = tokenForRole("CLIENT");
        UUID pickupOlder = submitPickup(client, menuItem, 3600);
        UUID delivery = submitDelivery(client, menuItem, 7200);
        UUID pickupNewer = submitPickup(client, menuItem, 10_800);
        jdbc.update("UPDATE wok.order_requests SET created_at = now() - interval '3 minutes' WHERE id = ?", pickupOlder);
        jdbc.update("UPDATE wok.order_requests SET created_at = now() - interval '2 minutes' WHERE id = ?", delivery);
        jdbc.update("UPDATE wok.order_requests SET created_at = now() - interval '1 minute' WHERE id = ?", pickupNewer);

        String operator = tokenForRole("OPERATIONAL");
        var allResponse = get("/api/v1/operational/order-requests", operator);
        assertThat(allResponse.statusCode()).as(allResponse.body()).isEqualTo(200);
        JsonNode all = body(allResponse);
        List<String> ids = all.findValuesAsText("requestId");
        assertThat(ids).contains(pickupOlder.toString(), delivery.toString(), pickupNewer.toString());
        assertThat(ids.indexOf(pickupNewer.toString())).isLessThan(ids.indexOf(delivery.toString()));
        assertThat(ids.indexOf(delivery.toString())).isLessThan(ids.indexOf(pickupOlder.toString()));
        JsonNode deliverySummary = null;
        for (JsonNode item : all) {
            if (item.path("requestId").asText().equals(delivery.toString())) {
                deliverySummary = item;
                break;
            }
        }
        assertThat(deliverySummary).isNotNull();
        assertThat(deliverySummary.path("fulfillmentType").asText()).isEqualTo("DELIVERY");
        assertThat(deliverySummary.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(deliverySummary.has("customerUserId")).isFalse();
        assertThat(deliverySummary.has("deliveryAddress")).isFalse();
        assertThat(deliverySummary.has("contactPhone")).isFalse();
        assertThat(deliverySummary.has("idempotencyKey")).isFalse();
        assertThat(deliverySummary.has("requestFingerprint")).isFalse();

        JsonNode filtered = body(get("/api/v1/operational/order-requests?status=PENDING_REVIEW&type=DELIVERY", operator));
        assertThat(filtered.findValuesAsText("requestId")).contains(delivery.toString());
        for (JsonNode item : filtered) {
            assertThat(item.path("status").asText()).isEqualTo("PENDING_REVIEW");
            assertThat(item.path("fulfillmentType").asText()).isEqualTo("DELIVERY");
        }
    }

    @Test
    void returnsRequestDetailAndLinesWithoutTurningItIntoAnOrder() {
        UUID menuItem = seedMenuItem("Detalle operativo", "21.50", "QUERY_DETAIL");
        UUID requestId = submitPickup(tokenForRole("CLIENT"), menuItem, 3600);
        String operator = tokenForRole("ADMIN");

        var response = get("/api/v1/operational/order-requests/" + requestId, operator);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        JsonNode detail = body(response);
        assertThat(detail.path("requestId").asText()).isEqualTo(requestId.toString());
        assertThat(detail.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(detail.path("fulfillmentType").asText()).isEqualTo("PICKUP");
        assertThat(detail.hasNonNull("orderId")).isFalse();
        assertThat(detail.path("lines")).hasSize(1);
        assertThat(detail.path("lines").get(0).path("name").asText()).isEqualTo("Detalle operativo");
        assertThat(detail.path("lines").get(0).path("quantity").asInt()).isEqualTo(2);
        assertThat(detail.path("lines").get(0).path("unitPrice").decimalValue()).isEqualByComparingTo("21.50");
        assertThat(detail.has("customerUserId")).isFalse();
        assertThat(detail.has("idempotencyKey")).isFalse();
        assertThat(detail.has("requestFingerprint")).isFalse();
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();

        assertThat(get("/api/v1/operational/order-requests/" + UUID.randomUUID(), operator).statusCode())
                .isEqualTo(404);
        assertThat(get("/api/v1/operational/order-requests", tokenForRole("CLIENT")).statusCode())
                .isEqualTo(403);
        assertThat(get("/api/v1/operational/order-requests/" + requestId, tokenForRole("CLIENT")).statusCode())
                .isEqualTo(403);
    }

    private UUID submitPickup(String token, UUID menuItem, int seconds) {
        var response = post("/api/v1/client/order-requests", token, """
                {"requestedFor":"%s","customerNote":"nota interna de prueba",
                 "items":[{"menuItemId":"%s","quantity":2}]}
                """.formatted(Instant.now().plusSeconds(seconds), menuItem),
                java.util.Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(202);
        return UUID.fromString(body(response).path("requestId").asText());
    }

    private UUID submitDelivery(String token, UUID menuItem, int seconds) {
        var response = post("/api/v1/client/delivery-requests", token, """
                {"requestedFor":"%s","address":"Zona 1, Ciudad de Guatemala",
                 "contactPhone":"+502 5555-0101","paymentPreference":"CASH_ON_DELIVERY",
                 "items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(Instant.now().plusSeconds(seconds), menuItem),
                java.util.Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(202);
        return UUID.fromString(body(response).path("requestId").asText());
    }

    private JsonNode body(java.net.http.HttpResponse<String> response) {
        try {
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private UUID seedMenuItem(String name, String price, String stationCode) {
        String sku = ("SKU-" + UUID.randomUUID()).toUpperCase();
        String category = "Categoría " + stationCode;
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.units (code, name, dimension, factor_to_base) VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.preparation_areas (code, name) VALUES (?, ?) ON CONFLICT (code) DO NOTHING",
                stationCode, "Estación " + stationCode);
        jdbc.update("INSERT INTO wok.menu_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING", category);
        UUID itemType = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unit = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID area = jdbc.queryForObject("SELECT id FROM wok.preparation_areas WHERE code = ?", UUID.class, stationCode);
        UUID categoryId = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, category);
        UUID currency = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID item = jdbc.queryForObject("INSERT INTO wok.items (sku, name, item_type_id, base_unit_id) VALUES (?, ?, ?, ?) RETURNING id",
                UUID.class, sku, name, itemType, unit);
        return jdbc.queryForObject("""
                INSERT INTO wok.menu_items (item_id, category_id, preparation_area_id, name, price, currency_id,
                                            estimated_preparation_seconds, status, visibility)
                VALUES (?, ?, ?, ?, ?::numeric, ?, 60, 'ACTIVE', 'PUBLIC') RETURNING id
                """, UUID.class, item, categoryId, area, name, price, currency);
    }
}
