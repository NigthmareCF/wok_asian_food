package com.wokasianfood.api.operational;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
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
    void keepsDeliveryRequestPendingWhenDeliveryCapacityIsNotEnabled() {
        UUID menuItemId = seedMenuItem("Wok Delivery", "18.00", "WOK_DELIVERY_DECISION", 60);
        UUID requestId = submitDelivery(tokenForRole("CLIENT"), menuItemId);
        setDeliveryStatus("MANUAL_APPROVAL");

        var response = post("/api/v1/operational/order-requests/" + requestId + "/decision",
                tokenForRole("OPERATIONAL"), """
                {"action":"ACCEPT"}
                """);

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();
    }

    @Test
    void acceptsDeliveryCreatingSentOrderAndReplaysDecisionWhenEnabled() {
        UUID menuItemId = seedMenuItem("Wok Delivery Accepted", "18.00", "WOK_DELIVERY_ACCEPT", 60);
        UUID requestId = submitDelivery(tokenForRole("CLIENT"), menuItemId);
        enableDelivery();
        String operator = tokenForRole("OPERATIONAL");

        JsonNode decision = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        UUID orderId = UUID.fromString(decision.path("orderId").asText());
        assertThat(decision.path("status").asText()).isEqualTo("ACCEPTED");
        assertThat(decision.path("idempotentReplay").asBoolean()).isFalse();

        var order = jdbc.queryForMap("""
                SELECT o.channel, o.status, o.dining_table_id, a.status AS account_status,
                       (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id) AS items,
                       (SELECT count(*) FROM wok.kitchen_tickets k WHERE k.order_id = o.id) AS tickets
                FROM wok.orders o JOIN wok.order_accounts a ON a.id = o.account_id WHERE o.id = ?
                """, orderId);
        assertThat(order).containsEntry("channel", "DELIVERY").containsEntry("status", "SENT")
                .containsEntry("dining_table_id", null).containsEntry("account_status", "OPEN");
        assertThat(((Number) order.get("items")).intValue()).isEqualTo(1);
        assertThat(((Number) order.get("tickets")).intValue()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT fulfillment FROM wok.order_items WHERE order_id = ?", String.class,
                orderId)).isEqualTo("TAKEAWAY");

        JsonNode replay = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(replay.path("orderId").asText()).isEqualTo(orderId.toString());
        assertThat(count("SELECT count(*) FROM wok.orders WHERE id = ?", orderId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ? AND event_type = 'ACCEPTED'",
                requestId)).isEqualTo(1);
    }

    @Test
    void rejectsSubmittedDeliveryAndShowsOnlyOwnHistoryWithoutCreatingOrder() {
        UUID menuItemId = seedMenuItem("Delivery de prueba", "18.00", "DELIVERY_REJECTION", 60);
        String client = tokenForRole("CLIENT");
        String otherClient = tokenForRole("CLIENT");
        UUID operatorId = createUserWithRole("delivery-review-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String operator = tokenFor(operatorId);
        int ordersBefore = count("SELECT count(*) FROM wok.orders");

        UUID requestId = submitDelivery(client, menuItemId);
        UUID otherRequestId = submitDelivery(otherClient, menuItemId);
        setDeliveryStatus("MANUAL_APPROVAL");
        String decisionPath = "/api/v1/operational/order-requests/" + requestId + "/decision";
        var pending = jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId);
        var submittedEvents = jdbc.queryForList("""
                SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id
                """, requestId);
        assertThat(pending.get("fulfillment_type")).isEqualTo("DELIVERY");
        assertThat(pending.get("order_id")).isNull();

        var blocked = post(decisionPath, operator, """
                {"action":"ACCEPT"}
                """);
        assertThat(blocked.statusCode()).as(blocked.body()).isEqualTo(503);
        assertThat(jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId)).isEqualTo(pending);
        assertThat(jdbc.queryForList("""
                SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id
                """, requestId)).isEqualTo(submittedEvents);
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(ordersBefore);

        String rejection = """
                {"action":"REJECT","reason":"Fuera de cobertura"}
                """;
        var rejectedResponse = post(decisionPath, operator, rejection);
        assertThat(rejectedResponse.statusCode()).as(rejectedResponse.body()).isEqualTo(200);
        JsonNode rejected = body(rejectedResponse);
        assertThat(rejected.path("requestId").asText()).isEqualTo(requestId.toString());
        assertThat(rejected.path("status").asText()).isEqualTo("REJECTED");
        assertThat(rejected.path("idempotentReplay").asBoolean()).isFalse();
        assertThat(rejected.hasNonNull("orderId")).isFalse();
        var persisted = jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId);
        assertThat(persisted.get("status")).isEqualTo("REJECTED");
        assertThat(persisted.get("decision_reason")).isEqualTo("Fuera de cobertura");
        assertThat(persisted.get("decided_by")).isEqualTo(operatorId);
        assertThat(persisted.get("order_id")).isNull();
        var events = jdbc.queryForList("""
                SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id
                """, requestId);
        assertThat(events).hasSize(2);
        assertThat(count("""
                SELECT count(*) FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type = 'REJECTED'
                  AND reason = 'Fuera de cobertura' AND actor_user_id = ?
                """, requestId, operatorId)).isEqualTo(1);

        var replayResponse = post(decisionPath, operator, rejection);
        assertThat(replayResponse.statusCode()).as(replayResponse.body()).isEqualTo(200);
        JsonNode replay = body(replayResponse);
        assertThat(replay.path("requestId").asText()).isEqualTo(requestId.toString());
        assertThat(replay.path("status").asText()).isEqualTo("REJECTED");
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(replay.hasNonNull("orderId")).isFalse();
        assertThat(jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId)).isEqualTo(persisted);
        assertThat(jdbc.queryForList("""
                SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id
                """, requestId)).isEqualTo(events);
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(ordersBefore);

        var historyResponse = get("/api/v1/client/delivery-requests", client);
        assertThat(historyResponse.statusCode()).as(historyResponse.body()).isEqualTo(200);
        JsonNode history = body(historyResponse);
        assertThat(history.isArray()).isTrue();
        assertThat(history).hasSize(1);
        assertThat(history.get(0).path("requestId").asText()).isEqualTo(requestId.toString());
        assertThat(history.get(0).path("fulfillmentType").asText()).isEqualTo("DELIVERY");
        assertThat(history.get(0).path("status").asText()).isEqualTo("REJECTED");
        assertThat(history.get(0).hasNonNull("orderId")).isFalse();

        var otherHistoryResponse = get("/api/v1/client/delivery-requests", otherClient);
        assertThat(otherHistoryResponse.statusCode()).as(otherHistoryResponse.body()).isEqualTo(200);
        JsonNode otherHistory = body(otherHistoryResponse);
        assertThat(otherHistory.isArray()).isTrue();
        assertThat(otherHistory).hasSize(1);
        assertThat(otherHistory.get(0).path("requestId").asText()).isEqualTo(otherRequestId.toString());
        assertThat(otherHistory.get(0).path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(get("/api/v1/client/delivery-requests/" + requestId, otherClient).statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/client/delivery-requests/" + otherRequestId, client).statusCode()).isEqualTo(404);
    }

    @Test
    void concurrentAcceptsCreateOneOrderAndReplayTheSameDecision() throws Exception {
        assertConcurrentDecisions("ACCEPT", "ACCEPT");
    }

    @Test
    void concurrentAcceptAndRejectCommitOnlyTheWinningDecision() throws Exception {
        assertConcurrentDecisions("ACCEPT", "REJECT");
    }

    private void assertConcurrentDecisions(String firstAction, String secondAction) throws Exception {
        UUID menuItemId = seedMenuItem("Pickup concurrente", "25.00", "CONCURRENT_DECISION", 60);
        UUID requestId = UUID.fromString(submit(tokenForRole("CLIENT"), menuItemId, 1,
                Instant.now().plusSeconds(3600).toString()).path("requestId").asText());
        DecisionCall first = decisionCall(firstAction);
        DecisionCall second = decisionCall(secondAction);
        List<DecisionCall> calls = List.of(first, second);
        int ordersBefore = count("SELECT count(*) FROM wok.orders");
        List<HttpResponse<String>> responses = concurrentDecisions(requestId, calls);

        int winnerIndex;
        if (firstAction.equals(secondAction)) {
            assertThat(responses).extracting(HttpResponse::statusCode).containsExactly(200, 200);
            JsonNode firstBody = body(responses.get(0));
            JsonNode secondBody = body(responses.get(1));
            assertThat(List.of(firstBody.path("idempotentReplay").asBoolean(),
                    secondBody.path("idempotentReplay").asBoolean())).containsExactlyInAnyOrder(false, true);
            assertThat(firstBody.path("orderId").asText()).isEqualTo(secondBody.path("orderId").asText());
            assertThat(firstBody.path("status").asText()).isEqualTo("ACCEPTED");
            assertThat(secondBody.path("status").asText()).isEqualTo("ACCEPTED");
            assertThat(firstBody.path("requestId").asText()).isEqualTo(requestId.toString());
            assertThat(secondBody.path("requestId").asText()).isEqualTo(requestId.toString());
            winnerIndex = firstBody.path("idempotentReplay").asBoolean() ? 1 : 0;
        } else {
            assertThat(responses).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200, 409);
            winnerIndex = responses.get(0).statusCode() == 200 ? 0 : 1;
        }

        DecisionCall winner = calls.get(winnerIndex);
        JsonNode decision = body(responses.get(winnerIndex));
        boolean accepted = winner.action().equals("ACCEPT");
        String status = accepted ? "ACCEPTED" : "REJECTED";
        assertThat(decision.path("requestId").asText()).isEqualTo(requestId.toString());
        assertThat(decision.path("status").asText()).isEqualTo(status);
        assertThat(decision.path("idempotentReplay").asBoolean()).isFalse();
        var persisted = jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId);
        assertThat(persisted.get("status")).isEqualTo(status);
        assertThat(persisted.get("decided_by")).isEqualTo(winner.actor());
        assertThat(persisted.get("decided_at")).isNotNull();
        assertThat(persisted.get("decision_reason")).isEqualTo(accepted ? "ACCEPTED" : "Sin disponibilidad");
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(ordersBefore + (accepted ? 1 : 0));
        if (accepted) {
            UUID orderId = UUID.fromString(decision.path("orderId").asText());
            assertThat(persisted.get("order_id")).isEqualTo(orderId);
            assertThat(jdbc.queryForMap("SELECT channel, status FROM wok.orders WHERE id = ?", orderId))
                    .containsEntry("channel", "PICKUP").containsEntry("status", "SENT");
        } else {
            assertThat(persisted.get("order_id")).isNull();
            assertThat(decision.hasNonNull("orderId")).isFalse();
        }

        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ?", requestId))
                .isEqualTo(2);
        var events = jdbc.queryForList("""
                SELECT event_type, actor_user_id, reason FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type IN ('ACCEPTED', 'REJECTED')
                """, requestId);
        assertThat(events).hasSize(1);
        assertThat(events.getFirst()).containsEntry("event_type", status)
                .containsEntry("actor_user_id", winner.actor())
                .containsEntry("reason", accepted ? "ORDER_CREATED" : "Sin disponibilidad");
        var audits = jdbc.queryForList("""
                SELECT action, actor_user_id, request_id, after_data->>'status' AS status, reason, result
                FROM wok.audit_logs WHERE entity_type = 'ORDER_REQUEST' AND entity_id = ?
                """, requestId);
        assertThat(audits).hasSize(1);
        assertThat(audits.getFirst()).containsEntry("action", "ORDER_REQUEST_" + status)
                .containsEntry("actor_user_id", winner.actor())
                .containsEntry("request_id", winner.correlationId())
                .containsEntry("status", status).containsEntry("result", "SUCCESS")
                .containsEntry("reason", accepted ? null : "Sin disponibilidad");
    }

    private DecisionCall decisionCall(String action) {
        UUID actor = createUserWithRole("concurrent-review-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        return new DecisionCall(actor, tokenFor(actor), UUID.randomUUID(), action);
    }

    private List<HttpResponse<String>> concurrentDecisions(UUID requestId, List<DecisionCall> calls) throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        try (Connection connection = jdbc.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("SELECT id FROM wok.order_requests WHERE id = ? FOR UPDATE")) {
                lock.setObject(1, requestId);
                try (var rows = lock.executeQuery()) {
                    assertThat(rows.next()).isTrue();
                }
            }
            var first = executor.submit(() -> postDecision(requestId, calls.get(0)));
            var second = executor.submit(() -> postDecision(requestId, calls.get(1)));
            try {
                // Both HTTP transactions must reach PostgreSQL before the fixture lock is released.
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
                int waiting;
                do {
                    waiting = count("""
                            SELECT count(*) FROM pg_stat_activity
                            WHERE datname = current_database() AND wait_event_type = 'Lock'
                              AND query LIKE '%FROM wok.order_requests WHERE id = %FOR UPDATE%'
                            """);
                    if (waiting == 2) break;
                    Thread.sleep(25);
                } while (System.nanoTime() < deadline);
                assertThat(waiting).as("Both decisions must overlap while waiting for the request lock").isEqualTo(2);
            } finally {
                connection.rollback();
            }
            return List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    private HttpResponse<String> postDecision(UUID requestId, DecisionCall call) {
        return post("/api/v1/operational/order-requests/" + requestId + "/decision", call.token(), """
                {"action":"%s","reason":"Sin disponibilidad"}
                """.formatted(call.action()), Map.of("X-Request-Id", call.correlationId().toString()));
    }

    private record DecisionCall(UUID actor, String token, UUID correlationId, String action) {}

    private UUID submitDelivery(String token, UUID menuItemId) {
        var response = post("/api/v1/client/delivery-requests", token, """
                {"requestedFor":"%s","address":"Zona 1, Ciudad de Guatemala",
                 "contactPhone":"+502 5555-0101","paymentPreference":"CASH_ON_DELIVERY",
                 "items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(Instant.now().plusSeconds(3600), menuItemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(202);
        JsonNode submitted = body(response);
        assertThat(submitted.path("fulfillmentType").asText()).isEqualTo("DELIVERY");
        assertThat(submitted.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(submitted.hasNonNull("orderId")).isFalse();
        return UUID.fromString(submitted.path("requestId").asText());
    }

    private void enableDelivery() {
        setDeliveryStatus("ENABLED");
    }

    private void setDeliveryStatus(String status) {
        jdbc.update("""
                UPDATE wok.service_capabilities
                SET status = ?, effective_from = now(), effective_until = NULL
                WHERE code = 'DELIVERY'
                """, status);
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
