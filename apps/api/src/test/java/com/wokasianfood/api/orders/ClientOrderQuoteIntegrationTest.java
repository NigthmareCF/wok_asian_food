package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ClientOrderQuoteIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void openRemoteServiceHoursForQuoteTests() {
        allowRemoteRequestsAtAnyTimeToday();
    }

    @AfterEach
    void restoreConfiguredRemoteServiceHours() {
        restoreBaselineRemoteHoursToday();
    }

    @Test
    void quotesCurrentServerPriceAndStoresSnapshotsWithoutCreatingAnOrder() throws Exception {
        UUID itemId = seedMenuItem("Quote item", "37.50", "QUOTE_TEST", 60);
        UUID customerId = createUserWithRole("quote-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String client = tokenFor(customerId);
        UUID key = UUID.randomUUID();
        Instant requestedFor = Instant.now().plusSeconds(3600);
        String payload = quotePayload("PICKUP", requestedFor, itemId, 2);

        JsonNode quote = body(post("/api/v1/client/order-quotes", client, payload,
                Map.of("Idempotency-Key", key.toString())));

        assertThat(quote.path("fulfillmentType").asText()).isEqualTo("PICKUP");
        assertThat(quote.path("subtotal").decimalValue()).isEqualByComparingTo("75.00");
        assertThat(quote.path("currency").asText()).isEqualTo("GTQ");
        assertThat(quote.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(quote.path("usable").asBoolean()).isTrue();
        assertThat(quote.path("preparationSeconds").asInt()).isEqualTo(120);
        assertThat(quote.path("items").get(0).path("name").asText()).isEqualTo("Quote item");
        assertThat(quote.path("items").get(0).path("lineTotal").decimalValue()).isEqualByComparingTo("75.00");
        assertThat(quote.path("message").asText()).contains("volverá a validar capacidad e inventario");
        UUID quoteId = UUID.fromString(quote.path("quoteId").asText());
        assertThat(count("SELECT count(*) FROM wok.order_quotes WHERE id = ?", quoteId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_quote_items WHERE order_quote_id = ?", quoteId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_requests WHERE customer_user_id = ?", customerId)).isZero();

        JsonNode replay = body(post("/api/v1/client/order-quotes", client, payload,
                Map.of("Idempotency-Key", key.toString())));
        assertThat(replay.path("quoteId").asText()).isEqualTo(quoteId.toString());
        assertThat(count("SELECT count(*) FROM wok.order_quotes WHERE customer_user_id = ?", customerId)).isEqualTo(1);
    }

    @Test
    void quoteMustMatchTheCartAndLivePriceBeforeRequestCreation() throws Exception {
        UUID itemId = seedMenuItem("Mutable quote item", "18.00", "QUOTE_PRICE_TEST", 30);
        UUID customerId = createUserWithRole("quote-price-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String client = tokenFor(customerId);
        Instant requestedFor = Instant.now().plusSeconds(3600);
        JsonNode quote = body(post("/api/v1/client/order-quotes", client,
                quotePayload("PICKUP", requestedFor, itemId, 1),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID quoteId = UUID.fromString(quote.path("quoteId").asText());
        jdbc.update("UPDATE wok.menu_items SET price = ? WHERE id = ?", new BigDecimal("19.00"), itemId);

        HttpResponse<String> response = post("/api/v1/client/order-requests", client,
                """
                {"requestedFor":"%s","paymentPreference":"CASH_AT_PICKUP","items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(requestedFor, itemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString(), "X-Order-Quote-Id", quoteId.toString()));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.body()).contains("El precio cambió desde la cotización");
        assertThat(count("SELECT count(*) FROM wok.order_requests WHERE customer_user_id = ?", customerId)).isZero();
    }

    @Test
    void matchingQuoteIsConsumedWhenTheCustomerSubmitsAndStillCreatesOnlyPendingReview() throws Exception {
        UUID itemId = seedMenuItem("Accepted quote item", "22.00", "QUOTE_CONSUME_TEST", 30);
        String client = tokenForRole("CLIENT");
        Instant requestedFor = Instant.now().plusSeconds(3600);
        JsonNode quote = body(post("/api/v1/client/order-quotes", client,
                quotePayload("PICKUP", requestedFor, itemId, 1),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID quoteId = UUID.fromString(quote.path("quoteId").asText());

        HttpResponse<String> submitted = post("/api/v1/client/order-requests", client,
                """
                {"requestedFor":"%s","paymentPreference":"CASH_AT_PICKUP","items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(requestedFor, itemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString(), "X-Order-Quote-Id", quoteId.toString()));

        JsonNode request = body(submitted);
        assertThat(request.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(count("SELECT count(*) FROM wok.order_quotes WHERE id = ? AND status = 'CONSUMED' AND consumed_order_request_id = ?",
                quoteId, UUID.fromString(request.path("requestId").asText()))).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.orders WHERE id = (SELECT order_id FROM wok.order_requests WHERE id = ?)",
                UUID.fromString(request.path("requestId").asText()))).isZero();
    }

    @Test
    void quoteCannotBeReadByAnotherCustomer() throws Exception {
        UUID itemId = seedMenuItem("Private quote item", "11.00", "QUOTE_OWNERSHIP_TEST", 30);
        String client = tokenForRole("CLIENT");
        String other = tokenForRole("CLIENT");
        JsonNode quote = body(post("/api/v1/client/order-quotes", client,
                quotePayload("PICKUP", Instant.now().plusSeconds(3600), itemId, 1),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        assertThat(get("/api/v1/client/order-quotes/" + quote.path("quoteId").asText(), other).statusCode()).isEqualTo(404);
    }

    private String quotePayload(String fulfillment, Instant requestedFor, UUID itemId, int quantity) {
        return """
                {"fulfillmentType":"%s","requestedFor":"%s","items":[{"menuItemId":"%s","quantity":%d}]}
                """.formatted(fulfillment, requestedFor, itemId, quantity);
    }

    private JsonNode body(HttpResponse<String> response) {
        try {
            assertThat(response.statusCode()).isBetween(200, 299);
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new AssertionError("Could not read response: " + response.body(), failure);
        }
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private UUID seedMenuItem(String name, String price, String stationCode, int preparationSeconds) {
        String sku = ("SKU-" + UUID.randomUUID().toString().substring(0, 8)).toUpperCase();
        String category = "Categoría " + stationCode;
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.units (code, name, dimension, factor_to_base) VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.preparation_areas (code, name) VALUES (?, ?) ON CONFLICT (code) DO NOTHING", stationCode, "Estación " + stationCode);
        jdbc.update("INSERT INTO wok.menu_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING", category);
        UUID itemTypeId = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unitId = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID areaId = jdbc.queryForObject("SELECT id FROM wok.preparation_areas WHERE code = ?", UUID.class, stationCode);
        UUID categoryId = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, category);
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID itemId = jdbc.queryForObject("INSERT INTO wok.items (sku, name, item_type_id, base_unit_id) VALUES (?, ?, ?, ?) RETURNING id",
                UUID.class, sku, name, itemTypeId, unitId);
        return jdbc.queryForObject("""
                INSERT INTO wok.menu_items
                    (item_id, category_id, preparation_area_id, name, price, currency_id, visibility, status, estimated_preparation_seconds)
                VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', 'ACTIVE', ?) RETURNING id
                """, UUID.class, itemId, categoryId, areaId, name, new BigDecimal(price), currencyId, preparationSeconds);
    }

}
