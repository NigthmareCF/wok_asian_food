package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    @Test
    void clientSuppliedOrderStatesCannotChangeTheAuthoritativeOrderState() {
        AcceptedOrder order = acceptedPickup();

        HttpResponse<String> response = post("/api/v1/client/order-requests/" + order.requestId() + "/change-requests",
                order.clientToken(), """
                    {"reason":"Quiero cambiar mi solicitud","status":"PAID","orderStatus":"READY"}
                    """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(body(response).path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId()))
                .isEqualTo("SENT");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, order.requestId()))
                .isEqualTo("ACCEPTED");
    }

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
    void clientCanRequestOneQueuedLineCancellationAndOperatorApprovalKeepsOtherLineActive() {
        AcceptedOrder order = acceptedPickup();
        UUID secondMenuItem = seedMenuItem("Wok second cancellation line", "30.00");
        HttpResponse<String> addLine = post("/api/v1/operational/orders/" + order.orderId() + "/items",
                order.operatorToken(), "{\"items\":[{\"menuItemId\":\"" + secondMenuItem + "\",\"quantity\":1,\"fulfillment\":\"TAKEAWAY\"}]}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(addLine.statusCode()).as("add second line: %s", addLine.body()).isBetween(200, 299);

        UUID targetItem = jdbc.queryForObject("""
                SELECT id FROM wok.order_items WHERE order_id = ? ORDER BY created_at, id LIMIT 1
                """, UUID.class, order.orderId());
        UUID untouchedItem = jdbc.queryForObject("""
                SELECT id FROM wok.order_items WHERE order_id = ? AND id <> ? ORDER BY created_at, id LIMIT 1
                """, UUID.class, order.orderId(), targetItem);
        String base = "/api/v1/client/order-requests/" + order.requestId() + "/change-requests";

        JsonNode available = body(get(base + "/cancellable-items", order.clientToken()));
        assertThat(available).hasSize(2);
        assertThat(available.findValuesAsText("orderItemId")).contains(targetItem.toString(), untouchedItem.toString());
        assertThat(get(base + "/cancellable-items", tokenForRole("CLIENT")).statusCode()).isEqualTo(404);

        UUID idempotencyKey = UUID.randomUUID();
        String linePath = base + "/items/" + targetItem + "/cancellations";
        JsonNode submitted = body(post(linePath, order.clientToken(), "{\"reason\":\"No deseo este platillo\"}",
                Map.of("Idempotency-Key", idempotencyKey.toString())));
        UUID changeId = UUID.fromString(submitted.path("id").asText());
        assertThat(submitted.path("requestType").asText()).isEqualTo("CANCEL_LINE");
        assertThat(submitted.path("orderItemId").asText()).isEqualTo(targetItem.toString());
        assertThat(submitted.path("expectedItemVersion").asInt()).isPositive();
        assertThat(submitted.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThatThrownBy(() -> jdbc.update("UPDATE wok.order_change_requests SET expected_item_version = NULL WHERE id = ?", changeId))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_items WHERE id = ?", String.class, targetItem))
                .isEqualTo("ACTIVE");

        JsonNode replay = body(post(linePath, order.clientToken(), "{\"reason\":\"No deseo este platillo\"}",
                Map.of("Idempotency-Key", idempotencyKey.toString())));
        assertThat(replay.path("id").asText()).isEqualTo(changeId.toString());
        HttpResponse<String> secondPending = post(base, order.clientToken(), "{\"reason\":\"Cancelar todo\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(secondPending.statusCode()).isEqualTo(409);

        String decisionPath = "/api/v1/operational/order-change-requests/" + changeId;
        JsonNode approved = body(patch(decisionPath, order.operatorToken(),
                "{\"decision\":\"APPROVE\",\"expectedVersion\":1}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(approved.path("status").asText()).isEqualTo("APPROVED");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_items WHERE id = ?", String.class, targetItem))
                .isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_items WHERE id = ?", String.class, untouchedItem))
                .isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId()))
                .isEqualTo("SENT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_item_change_events WHERE order_id = ? AND change_type = 'CANCEL_LINE'",
                Integer.class, order.orderId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_change_request_events WHERE order_change_request_id = ?",
                Integer.class, changeId)).isEqualTo(2);
    }

    @Test
    void operatorCanRejectLineCancellationWithoutChangingTheOrderLine() {
        AcceptedOrder order = acceptedPickup();
        UUID secondMenuItem = seedMenuItem("Wok line to keep", "30.00");
        HttpResponse<String> added = post("/api/v1/operational/orders/" + order.orderId() + "/items",
                order.operatorToken(), "{\"items\":[{\"menuItemId\":\"" + secondMenuItem + "\",\"quantity\":1,\"fulfillment\":\"TAKEAWAY\"}]}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(added.statusCode()).as("add second line: %s", added.body()).isBetween(200, 299);
        UUID targetItem = jdbc.queryForObject("SELECT id FROM wok.order_items WHERE order_id = ? ORDER BY created_at, id LIMIT 1",
                UUID.class, order.orderId());
        JsonNode submitted = body(post("/api/v1/client/order-requests/" + order.requestId() +
                "/change-requests/items/" + targetItem + "/cancellations", order.clientToken(),
                "{\"reason\":\"Lo voy a conservar\"}", Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID changeId = UUID.fromString(submitted.path("id").asText());

        JsonNode rejected = body(patch("/api/v1/operational/order-change-requests/" + changeId, order.operatorToken(),
                "{\"decision\":\"REJECT\",\"expectedVersion\":1,\"reason\":\"El producto ya está en preparación\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        assertThat(rejected.path("status").asText()).isEqualTo("REJECTED");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_items WHERE id = ?", String.class, targetItem))
                .isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId()))
                .isEqualTo("SENT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_item_change_events WHERE order_item_id = ?",
                Integer.class, targetItem)).isZero();
    }

    @Test
    void quantityChangeRequiresReviewAndUpdatesLineInventorySnapshotAndQueuedKitchenTicketOnce() {
        AcceptedOrder order = acceptedPickup(true);
        UUID itemId = jdbc.queryForObject("SELECT id FROM wok.order_items WHERE order_id = ?", UUID.class, order.orderId());
        int itemVersion = jdbc.queryForObject("SELECT row_version FROM wok.order_items WHERE id = ?", Integer.class, itemId);
        int orderVersion = jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id = ?", Integer.class, order.orderId());
        String path = "/api/v1/client/order-requests/" + order.requestId()
                + "/change-requests/items/" + itemId + "/quantity";
        UUID key = UUID.randomUUID();
        String requestBody = "{\"quantity\":2,\"reason\":\"Necesito una porción adicional\"}";
        JsonNode submitted = body(post(path, order.clientToken(), requestBody, Map.of("Idempotency-Key", key.toString())));
        UUID changeId = UUID.fromString(submitted.path("id").asText());

        assertThat(submitted.path("requestType").asText()).isEqualTo("MODIFY_LINE_QUANTITY");
        assertThat(submitted.path("requestedQuantity").asInt()).isEqualTo(2);
        assertThat(submitted.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT quantity FROM wok.order_items WHERE id = ?", Integer.class, itemId)).isEqualTo(1);
        assertThat(body(post(path, order.clientToken(), requestBody, Map.of("Idempotency-Key", key.toString())))
                .path("id").asText()).isEqualTo(changeId.toString());

        JsonNode approved = body(patch("/api/v1/operational/order-change-requests/" + changeId,
                order.operatorToken(), "{\"decision\":\"APPROVE\",\"expectedVersion\":1}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(approved.path("status").asText()).isEqualTo("APPROVED");
        assertThat(jdbc.queryForObject("SELECT quantity FROM wok.order_items WHERE id = ?", Integer.class, itemId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT quantity FROM wok.kitchen_ticket_items WHERE order_item_id = ?",
                Integer.class, itemId)).isEqualTo(2);
        UUID resourceId = jdbc.queryForObject("SELECT item_id FROM wok.order_item_resource_reservations WHERE order_item_id = ?",
                UUID.class, itemId);
        assertThat(jdbc.queryForObject("SELECT quantity_delta FROM wok.order_item_resource_reservations WHERE order_item_id = ? AND item_id = ?",
                BigDecimal.class, itemId, resourceId)).isEqualByComparingTo("1.000000");
        assertThat(jdbc.queryForObject("SELECT quantity FROM wok.inventory_reservations WHERE order_id = ? AND item_id = ? AND status = 'ACTIVE'",
                BigDecimal.class, order.orderId(), resourceId)).isEqualByComparingTo("1.000000");
        assertThat(jdbc.queryForObject("SELECT subtotal FROM wok.orders WHERE id = ?", BigDecimal.class, order.orderId()))
                .isEqualTo(new BigDecimal("50.00"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_item_change_events WHERE order_item_id = ? AND change_type = 'MODIFY_LINE_QUANTITY'",
                Integer.class, itemId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_change_request_events WHERE order_change_request_id = ?",
                Integer.class, changeId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id = ?", Integer.class, order.orderId()))
                .isGreaterThan(orderVersion);
        assertThat(jdbc.queryForObject("SELECT row_version FROM wok.order_items WHERE id = ?", Integer.class, itemId))
                .isEqualTo(itemVersion + 1);
    }

    @Test
    void quantityChangeThatNoLongerFitsRequestedTimeRollsBackAndStaysPending() {
        AcceptedOrder order = acceptedPickup();
        UUID itemId = jdbc.queryForObject("SELECT id FROM wok.order_items WHERE order_id = ?", UUID.class, order.orderId());
        JsonNode submitted = body(post("/api/v1/client/order-requests/" + order.requestId()
                + "/change-requests/items/" + itemId + "/quantity", order.clientToken(),
                "{\"quantity\":2,\"reason\":\"Necesito una porción adicional\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID changeId = UUID.fromString(submitted.path("id").asText());
        jdbc.update("UPDATE wok.order_requests SET requested_for = ? WHERE id = ?",
                java.sql.Timestamp.from(Instant.now().plusSeconds(30)), order.requestId());

        HttpResponse<String> approval = patch("/api/v1/operational/order-change-requests/" + changeId,
                order.operatorToken(), "{\"decision\":\"APPROVE\",\"expectedVersion\":1}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));

        assertThat(approval.statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT quantity FROM wok.order_items WHERE id = ?", Integer.class, itemId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT quantity FROM wok.kitchen_ticket_items WHERE order_item_id = ?",
                Integer.class, itemId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_change_requests WHERE id = ?", String.class, changeId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_item_change_events WHERE order_item_id = ?",
                Integer.class, itemId)).isZero();
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
        return acceptedPickup(false);
    }

    private AcceptedOrder acceptedPickup(boolean withInventoryRecipe) {
        UUID customerId = createUserWithRole("cancel-client-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID operatorId = createUserWithRole("cancel-operator-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID productId = seedMenuItem("Wok cancellation", "25.00");
        if (withInventoryRecipe) {
            UUID parentItem = jdbc.queryForObject("SELECT item_id FROM wok.menu_items WHERE id = ?", UUID.class, productId);
            UUID type = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
            UUID unit = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
            UUID resourceId = jdbc.queryForObject("""
                    INSERT INTO wok.items (sku, name, item_type_id, base_unit_id)
                    VALUES (?, 'Cambio receta test', ?, ?) RETURNING id
                    """, UUID.class, ("CHANGE-RESOURCE-" + UUID.randomUUID()).toUpperCase(java.util.Locale.ROOT), type, unit);
            jdbc.update("INSERT INTO wok.item_recipe_components (parent_item_id, component_item_id, quantity) VALUES (?, ?, 0.5)",
                    parentItem, resourceId);
            jdbc.update("UPDATE wok.menu_items SET recipe_status = 'ACTIVE' WHERE id = ?", productId);
            jdbc.update("INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 20)", resourceId);
        }
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
