package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class ClientDeliveryRequestIntegrationTest extends PostgresIntegrationTest {
    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private final ObjectMapper json = new ObjectMapper();
    private LocalDate overrideDate;
    private UUID overrideActor;

    @AfterEach
    void removeDeliveryScheduleOverride() {
        if (overrideDate != null && overrideActor != null) {
            jdbc.update("DELETE FROM wok.business_hours_overrides WHERE service_type = 'DELIVERY' AND service_date = ? AND created_by = ?",
                    overrideDate, overrideActor);
        }
    }

    @Test
    void deliveryCreationUsesServerIdentityPriceAndPendingLifecycleAndReplaysIdempotently() throws Exception {
        UUID itemId = seedMenuItem("Delivery guard item", "13.50", "DELIVERY_GUARD_TEST", 45);
        UUID customerId = createUserWithRole("delivery-guard-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID forgedOwnerId = createUserWithRole("delivery-guard-forged-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        overrideActor = createUserWithRole("delivery-guard-staff-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        overrideDate = LocalDate.now(RESTAURANT_ZONE).plusDays(10);
        Instant requestedFor = overrideDate.atTime(18, 0).atZone(RESTAURANT_ZONE).toInstant();
        jdbc.update("""
            INSERT INTO wok.business_hours_overrides
                (service_type, service_date, is_open, opens_at, closes_at, timezone_name, reason, expires_at,
                 created_by, updated_by)
            VALUES ('DELIVERY', ?, true, ?, ?, 'America/Guatemala', 'Ventana de prueba delivery', ?, ?, ?)
            """, overrideDate, LocalTime.MIDNIGHT, LocalTime.of(23, 59, 59),
                Timestamp.from(overrideDate.plusDays(1).atStartOfDay(RESTAURANT_ZONE).toInstant()),
                overrideActor, overrideActor);

        String token = tokenFor(customerId);
        UUID idempotencyKey = UUID.randomUUID();
        String path = "/api/v1/client/delivery-requests";
        String payload = """
            {
              "requestedFor":"%s",
              "address":"Zona de prueba, Ciudad de Guatemala",
              "reference":"Casa azul",
              "contactPhone":"5555 0101",
              "paymentPreference":"CASH_ON_DELIVERY",
              "invoiceRequested":false,
              "items":[{"menuItemId":"%s","quantity":2}],
              "customerUserId":"%s",
              "fulfillmentType":"PICKUP",
              "subtotal":0,
              "status":"ACCEPTED",
              "paymentStatus":"PAID",
              "orderStatus":"READY",
              "orderId":"%s"
            }
            """.formatted(requestedFor, itemId, forgedOwnerId, UUID.randomUUID());
        Map<String, String> headers = Map.of("Idempotency-Key", idempotencyKey.toString());

        var response = post(path, token, payload, headers);
        assertThat(response.statusCode()).as("body %s", response.body()).isEqualTo(202);
        JsonNode receipt = json.readTree(response.body());
        UUID requestId = UUID.fromString(receipt.path("requestId").asText());
        assertThat(receipt.path("fulfillmentType").asText()).isEqualTo("DELIVERY");
        assertThat(receipt.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(receipt.path("subtotal").decimalValue()).isEqualByComparingTo("27.00");
        assertThat(receipt.path("paymentPreference").asText()).isEqualTo("CASH_ON_DELIVERY");
        assertThat(jdbc.queryForObject("SELECT customer_user_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isEqualTo(customerId);
        assertThat(jdbc.queryForObject("SELECT fulfillment_type FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("DELIVERY");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT subtotal FROM wok.order_requests WHERE id = ?", BigDecimal.class, requestId))
                .isEqualByComparingTo("27.00");
        assertThat(jdbc.queryForObject("SELECT payment_preference FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("CASH_ON_DELIVERY");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_requests WHERE id = ? AND order_id IS NULL", Integer.class, requestId))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT unit_price FROM wok.order_request_items WHERE order_request_id = ?", BigDecimal.class, requestId))
                .isEqualByComparingTo("13.50");
        assertThat(jdbc.queryForObject("SELECT quantity FROM wok.order_request_items WHERE order_request_id = ?", Integer.class, requestId))
                .isEqualTo(2);

        JsonNode replay = json.readTree(post(path, token, payload, headers).body());
        assertThat(replay.path("requestId").asText()).isEqualTo(requestId.toString());
        assertThat(count("SELECT count(*) FROM wok.order_requests WHERE customer_user_id = ? AND idempotency_key = ?",
                customerId, idempotencyKey)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ? AND event_type = 'SUBMITTED'",
                requestId)).isEqualTo(1);

        var conflictingReplay = post(path, token, payload.replace("5555 0101", "5555 0202"), headers);
        assertThat(conflictingReplay.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.order_requests WHERE customer_user_id = ?", customerId)).isEqualTo(1);
    }

    private UUID seedMenuItem(String name, String price, String stationCode, int preparationSeconds) {
        String sku = ("SKU-" + UUID.randomUUID().toString().substring(0, 8)).toUpperCase();
        String category = "Categoría " + stationCode;
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.units (code, name, dimension, factor_to_base) VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.preparation_areas (code, name) VALUES (?, ?) ON CONFLICT (code) DO NOTHING",
                stationCode, "Estación " + stationCode);
        jdbc.update("INSERT INTO wok.menu_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING", category);
        UUID itemTypeId = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unitId = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID areaId = jdbc.queryForObject("SELECT id FROM wok.preparation_areas WHERE code = ?", UUID.class, stationCode);
        UUID categoryId = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, category);
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID itemId = jdbc.queryForObject("INSERT INTO wok.items (sku, name, item_type_id, base_unit_id) "
                + "VALUES (?, ?, ?, ?) RETURNING id", UUID.class, sku, name, itemTypeId, unitId);
        return jdbc.queryForObject("""
            INSERT INTO wok.menu_items
                (item_id, category_id, preparation_area_id, name, price, currency_id, visibility, status,
                 estimated_preparation_seconds)
            VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', 'ACTIVE', ?) RETURNING id
            """, UUID.class, itemId, categoryId, areaId, name, new BigDecimal(price), currencyId, preparationSeconds);
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }
}
