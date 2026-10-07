package com.wokasianfood.api.payments;

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

class ClientPaymentIntentIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void openRemoteServiceHoursForPaymentIntentTests() {
        allowRemoteRequestsAtAnyTimeToday();
    }

    @AfterEach
    void restoreConfiguredRemoteServiceHours() {
        restoreBaselineRemoteHoursToday();
    }

    @Test
    void createsOneOwnedPendingIntentAndNeverRecordsCapturedPayment() throws Exception {
        UUID menuItemId = seedMenuItem("Wok Online Delivery", "37.50", "WOK_ONLINE_PAYMENT", 60);
        String customer = tokenForRole("CLIENT");
        String otherCustomer = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        JsonNode request = body(post("/api/v1/client/delivery-requests", customer, """
                {"requestedFor":"%s","address":"Zona 10, Ciudad de Guatemala",
                 "contactPhone":"+502 5555-0101","paymentPreference":"ONLINE_PAYMENT_REQUESTED",
                 "invoiceRequested":false,"items":[{"menuItemId":"%s","quantity":2}]}
                """.formatted(Instant.now().plusSeconds(1800), menuItemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID requestId = UUID.fromString(request.path("requestId").asText());
        assertThat(request.path("status").asText()).isEqualTo("PENDING_REVIEW");

        JsonNode accepted = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        UUID orderId = UUID.fromString(accepted.path("orderId").asText());
        String path = "/api/v1/client/delivery-requests/" + requestId + "/payment-intents";
        UUID idempotencyKey = UUID.randomUUID();
        HttpResponse<String> createdResponse = post(path, customer, "{}",
                Map.of("Idempotency-Key", idempotencyKey.toString()));

        assertThat(createdResponse.statusCode()).isEqualTo(202);
        JsonNode created = body(createdResponse);
        UUID intentId = UUID.fromString(created.path("intentId").asText());
        assertThat(created.path("orderId").asText()).isEqualTo(orderId.toString());
        assertThat(created.path("provider").asText()).isEqualTo("MOCK");
        assertThat(created.path("status").asText()).isEqualTo("PENDING");
        assertThat(created.path("amount").decimalValue()).isEqualByComparingTo("75.00");
        assertThat(created.path("currency").asText()).isEqualTo("GTQ");
        assertThat(created.path("message").asText()).contains("No se ha procesado");
        assertThat(count("SELECT count(*) FROM wok.payment_intents WHERE order_id = ?", orderId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = (SELECT account_id FROM wok.orders WHERE id = ?)", orderId)).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_accounts WHERE id = (SELECT account_id FROM wok.orders WHERE id = ?)",
                String.class, orderId)).isEqualTo("OPEN");

        HttpResponse<String> current = get(path + "/current", customer);
        assertThat(current.statusCode()).isEqualTo(200);
        assertThat(json.readTree(current.body()).path("intentId").asText()).isEqualTo(intentId.toString());

        JsonNode replay = body(post(path, customer, "{}", Map.of("Idempotency-Key", idempotencyKey.toString())));
        assertThat(replay.path("intentId").asText()).isEqualTo(intentId.toString());
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        JsonNode recoveredWithNewKey = body(post(path, customer, "{}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(recoveredWithNewKey.path("intentId").asText()).isEqualTo(intentId.toString());
        assertThat(recoveredWithNewKey.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(count("SELECT count(*) FROM wok.payment_intents WHERE order_id = ?", orderId)).isEqualTo(1);
        assertThat(get(path + "/current", otherCustomer).statusCode()).isEqualTo(404);
        assertThat(post(path, otherCustomer, "{}", Map.of("Idempotency-Key", UUID.randomUUID().toString()))
                .statusCode()).isEqualTo(404);
    }

    @Test
    void rejectsPaymentIntentForDeliveryThatDidNotRequestOnlinePayment() {
        UUID menuItemId = seedMenuItem("Wok Cash Delivery", "22.00", "WOK_CASH_DELIVERY", 60);
        String customer = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        JsonNode request = body(post("/api/v1/client/delivery-requests", customer, """
                {"requestedFor":"%s","address":"Zona 1, Ciudad de Guatemala",
                 "contactPhone":"+502 5555-0102","paymentPreference":"CASH_ON_DELIVERY",
                 "invoiceRequested":false,"items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(Instant.now().plusSeconds(1800), menuItemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID requestId = UUID.fromString(request.path("requestId").asText());
        JsonNode accepted = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        UUID orderId = UUID.fromString(accepted.path("orderId").asText());

        assertThat(get("/api/v1/client/delivery-requests/" + requestId + "/payment-intents/current", customer)
                .statusCode()).isEqualTo(204);

        HttpResponse<String> response = post("/api/v1/client/delivery-requests/" + requestId + "/payment-intents",
                customer, "{}", Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.payment_intents WHERE order_id = ?", orderId)).isZero();
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
