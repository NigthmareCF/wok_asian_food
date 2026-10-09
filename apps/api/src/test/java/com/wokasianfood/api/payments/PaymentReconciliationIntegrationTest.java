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
import org.springframework.beans.factory.annotation.Autowired;

class PaymentReconciliationIntegrationTest extends PostgresIntegrationTest {
    private static final String QUEUE = "/api/v1/operational/payment-intents/reconciliation";
    private final ObjectMapper json = new ObjectMapper();
    @Autowired private PaymentIntentCreationWorker paymentIntentWorker;

    @BeforeEach
    void openRemoteServiceHours() {
        allowRemoteRequestsAtAnyTimeToday();
    }

    @AfterEach
    void restoreRemoteServiceHours() {
        restoreBaselineRemoteHoursToday();
    }

    @Test
    void paymentReconciliationQueueListsOnlyUnknownIntentsForAuthorizedOperators() throws Exception {
        String customer = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        UUID unknownIntent = createAcceptedDeliveryIntent(customer, operator, "Unknown settlement", "22.00");
        UUID pendingIntent = createAcceptedDeliveryIntent(customer, operator, "Pending settlement", "31.00");
        jdbc.update("UPDATE wok.outbox_events SET next_attempt_at = now() WHERE aggregate_id IN (?, ?)",
                unknownIntent, pendingIntent);
        paymentIntentWorker.createNext();
        jdbc.update("UPDATE wok.payment_intents SET status = 'UNKNOWN', updated_at = now() WHERE id = ?", unknownIntent);

        HttpResponse<String> response = get(QUEUE, operator);

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode rows = json.readTree(response.body());
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).path("intentId").asText()).isEqualTo(unknownIntent.toString());
        assertThat(rows.get(0).path("status").asText()).isEqualTo("UNKNOWN");
        assertThat(rows.get(0).path("currency").asText()).isEqualTo("GTQ");
        assertThat(rows.get(0).path("amount").decimalValue()).isEqualByComparingTo("22.00");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.payment_intents WHERE id = ?", String.class, pendingIntent))
                .isEqualTo("PENDING");
        assertThat(get(QUEUE, customer).statusCode()).isEqualTo(403);
        assertThat(get(QUEUE, null).statusCode()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.payment_intents WHERE id = ?", String.class, unknownIntent))
                .isEqualTo("UNKNOWN");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.payments WHERE account_id = (SELECT account_id FROM wok.payment_intents WHERE id = ?)",
                Integer.class, unknownIntent)).isZero();
    }

    private UUID createAcceptedDeliveryIntent(String customer, String operator, String name, String price) throws Exception {
        UUID itemId = seedMenuItem(name, price);
        JsonNode request = body(post("/api/v1/client/delivery-requests", customer, """
                {"requestedFor":"%s","address":"Zona 10, Ciudad de Guatemala",
                 "contactPhone":"+502 5555-0101","paymentPreference":"ONLINE_PAYMENT_REQUESTED",
                 "invoiceRequested":false,"items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(Instant.now().plusSeconds(3600), itemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID requestId = UUID.fromString(request.path("requestId").asText());
        JsonNode accepted = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                "{\"action\":\"ACCEPT\"}"));
        HttpResponse<String> intentResponse = post("/api/v1/client/delivery-requests/" + requestId + "/payment-intents",
                customer, "{}", Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(intentResponse.statusCode()).isEqualTo(202);
        UUID intentId = UUID.fromString(body(intentResponse).path("intentId").asText());
        assertThat(accepted.path("orderId").asText()).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT amount FROM wok.payment_intents WHERE id = ?", BigDecimal.class, intentId))
                .isEqualByComparingTo(price);
        return intentId;
    }

    private JsonNode body(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).as("response body: %s", response.body()).isBetween(200, 299);
        return json.readTree(response.body());
    }

    private UUID seedMenuItem(String name, String price) {
        String code = "RECON-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        jdbc.update("INSERT INTO wok.item_types(code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.units(code, name, dimension, factor_to_base) VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.preparation_areas(code, name) VALUES (?, ?) ON CONFLICT (code) DO NOTHING", code, code);
        jdbc.update("INSERT INTO wok.menu_categories(name) VALUES (?) ON CONFLICT (name) DO NOTHING", code);
        UUID itemType = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unit = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID area = jdbc.queryForObject("SELECT id FROM wok.preparation_areas WHERE code = ?", UUID.class, code);
        UUID category = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, code);
        UUID currency = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID item = jdbc.queryForObject("INSERT INTO wok.items(sku, name, item_type_id, base_unit_id) VALUES (?, ?, ?, ?) RETURNING id",
                UUID.class, code, name, itemType, unit);
        return jdbc.queryForObject("""
                INSERT INTO wok.menu_items(item_id, category_id, preparation_area_id, name, price, currency_id,
                    visibility, status, estimated_preparation_seconds)
                VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', 'ACTIVE', 60) RETURNING id
                """, UUID.class, item, category, area, name, new BigDecimal(price), currency);
    }
}
