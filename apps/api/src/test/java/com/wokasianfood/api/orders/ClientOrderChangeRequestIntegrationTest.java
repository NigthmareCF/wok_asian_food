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

class ClientOrderChangeRequestIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void openRemoteServiceHoursForOrderLifecycleTests() {
        allowRemoteRequestsAtAnyTimeToday();
    }

    @AfterEach
    void restoreConfiguredRemoteServiceHours() {
        restoreBaselineRemoteHoursToday();
    }

    @Test
    void cancellationNeedsOperationalApprovalAndApprovalUsesOrderLifecycle() {
        AcceptedOrder order = acceptedPickup();
        UUID key = UUID.randomUUID();
        String path = "/api/v1/client/order-requests/" + order.requestId() + "/change-requests";
        Map<String, String> headers = Map.of("Idempotency-Key", key.toString());

        JsonNode submitted = body(post(path, order.clientToken(), "{\"reason\":\"Ya no puedo recogerlo\"}", headers));
        UUID changeId = UUID.fromString(submitted.path("id").asText());
        assertThat(submitted.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId()))
                .isEqualTo("SENT");

        JsonNode replay = body(post(path, order.clientToken(), "{\"reason\":\"Ya no puedo recogerlo\"}", headers));
        assertThat(replay.path("id").asText()).isEqualTo(changeId.toString());
        assertThat(replay.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_change_request_events WHERE order_change_request_id = ?",
                Integer.class, changeId)).isEqualTo(1);

        HttpResponse<String> otherClient = post(path, tokenForRole("CLIENT"),
                "{\"reason\":\"Quiero cancelarlo\"}", Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(otherClient.statusCode()).isEqualTo(404);

        String decisionBody = "{\"decision\":\"APPROVE\",\"expectedVersion\":1}";
        Map<String, String> decisionHeaders = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        String decisionPath = "/api/v1/operational/order-change-requests/" + changeId;
        JsonNode approved = body(patch(decisionPath, order.operatorToken(), decisionBody, decisionHeaders));
        assertThat(approved.path("status").asText()).isEqualTo("APPROVED");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId()))
                .isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_status_history WHERE order_id = ? AND to_status = 'CANCELLED'",
                Integer.class, order.orderId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_change_request_events WHERE order_change_request_id = ?",
                Integer.class, changeId)).isEqualTo(2);

        JsonNode decisionReplay = body(patch(decisionPath, order.operatorToken(), decisionBody, decisionHeaders));
        assertThat(decisionReplay.path("status").asText()).isEqualTo("APPROVED");
        assertThat(decisionReplay.path("version").asInt()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_status_history WHERE order_id = ? AND to_status = 'CANCELLED'",
                Integer.class, order.orderId())).isEqualTo(1);
    }

    @Test
    void approvalIsBlockedUntilCapturedBalanceIsRefunded() {
        AcceptedOrder order = acceptedPickup();
        UUID key = UUID.randomUUID();
        JsonNode submitted = body(post("/api/v1/client/order-requests/" + order.requestId() + "/change-requests",
                order.clientToken(), "{\"reason\":\"No podré llegar\"}", Map.of("Idempotency-Key", key.toString())));
        UUID changeId = UUID.fromString(submitted.path("id").asText());
        UUID currencyId = jdbc.queryForObject("SELECT currency_id FROM wok.orders WHERE id = ?", UUID.class, order.orderId());
        jdbc.update("INSERT INTO wok.payments (account_id, amount, currency_id, method, captured_by) VALUES (?, ?, ?, 'CASH', ?)",
                order.accountId(), new BigDecimal("25.00"), currencyId, UUID.fromString(order.operatorSubject()));

        HttpResponse<String> response = patch("/api/v1/operational/order-change-requests/" + changeId,
                order.operatorToken(), "{\"decision\":\"APPROVE\",\"expectedVersion\":1}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId())).isEqualTo("SENT");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_change_requests WHERE id = ?", String.class, changeId))
                .isEqualTo("PENDING_REVIEW");
    }

    @Test
    void staleOrderCannotBeCancelledAndOperationalRejectionRequiresReason() {
        AcceptedOrder order = acceptedPickup();
        JsonNode submitted = body(post("/api/v1/client/order-requests/" + order.requestId() + "/change-requests",
                order.clientToken(), "{\"reason\":\"Cambió mi horario\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID changeId = UUID.fromString(submitted.path("id").asText());

        HttpResponse<String> missingReason = patch("/api/v1/operational/order-change-requests/" + changeId,
                order.operatorToken(), "{\"decision\":\"REJECT\",\"expectedVersion\":1}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(missingReason.statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_change_requests WHERE id = ?", String.class, changeId))
                .isEqualTo("PENDING_REVIEW");

        body(patch("/api/v1/operational/orders/" + order.orderId() + "/status", order.operatorToken(),
                "{\"status\":\"PREPARING\",\"expectedVersion\":" + order.orderVersion() + "}"));
        HttpResponse<String> staleApproval = patch("/api/v1/operational/order-change-requests/" + changeId,
                order.operatorToken(), "{\"decision\":\"APPROVE\",\"expectedVersion\":1}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(staleApproval.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId()))
                .isEqualTo("PREPARING");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_change_requests WHERE id = ?", String.class, changeId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_change_request_events WHERE order_change_request_id = ?",
                Integer.class, changeId)).isEqualTo(1);
    }

    private AcceptedOrder acceptedPickup() {
        UUID customerId = createUserWithRole("cancel-client-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID operatorId = createUserWithRole("cancel-operator-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID productId = seedMenuItem("Wok cancellation", "25.00");
        String client = tokenFor(customerId);
        String operator = tokenFor(operatorId);
        JsonNode request = body(post("/api/v1/client/order-requests", client,
                "{\"requestedFor\":\"" + Instant.now().plusSeconds(3600) + "\",\"items\":[{\"menuItemId\":\"" + productId + "\",\"quantity\":1}]}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID requestId = UUID.fromString(request.path("requestId").asText());
        JsonNode accepted = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                "{\"action\":\"ACCEPT\"}"));
        UUID orderId = UUID.fromString(accepted.path("orderId").asText());
        UUID accountId = jdbc.queryForObject("SELECT account_id FROM wok.orders WHERE id = ?", UUID.class, orderId);
        int orderVersion = jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id = ?", Integer.class, orderId);
        return new AcceptedOrder(requestId, orderId, accountId, client, operator, operatorId.toString(), orderVersion);
    }

    private UUID seedMenuItem(String name, String price) {
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.units (code, name, dimension, factor_to_base) VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.preparation_areas (code, name) VALUES (?, ?) ON CONFLICT (code) DO NOTHING", "CANCEL_" + suffix, "Estación cancelación");
        jdbc.update("INSERT INTO wok.menu_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING", "Cancelación " + suffix);
        UUID itemType = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unit = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID area = jdbc.queryForObject("SELECT id FROM wok.preparation_areas WHERE code = ?", UUID.class, "CANCEL_" + suffix);
        UUID category = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, "Cancelación " + suffix);
        UUID currency = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID item = jdbc.queryForObject("INSERT INTO wok.items (sku, name, item_type_id, base_unit_id) VALUES (?, ?, ?, ?) RETURNING id",
                UUID.class, "CANCEL-" + suffix, name, itemType, unit);
        return jdbc.queryForObject("""
                INSERT INTO wok.menu_items (item_id, category_id, preparation_area_id, name, price, currency_id,
                    visibility, status, estimated_preparation_seconds)
                VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', 'ACTIVE', 60) RETURNING id
                """, UUID.class, item, category, area, name, new BigDecimal(price), currency);
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }

    private record AcceptedOrder(UUID requestId, UUID orderId, UUID accountId,
                                 String clientToken, String operatorToken, String operatorSubject, int orderVersion) {}
}
