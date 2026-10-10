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
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class OrderRequestDecisionIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void deliveryReceptionIncludesPrivateContactDataOnlyForAuthorizedStaff() throws Exception {
        UUID item = seedMenuItem("Delivery privado", "18.00", "PRIVATE_DELIVERY", 60);
        String customer = tokenForRole("CLIENT");
        String other = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        var payload = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(deliveryPayload(item));
        payload.put("reference", "Portón ficticio azul");
        UUID id = deliveryId(customer, payload.toString());
        JsonNode row = body(get("/api/v1/operational/order-requests?status=PENDING_REVIEW", operator))
                .valueStream().filter(entry -> id.toString().equals(entry.path("requestId").asText())).findFirst().orElseThrow();
        assertThat(row.path("deliveryAddress").asText()).isEqualTo(payload.path("address").asText());
        assertThat(row.path("deliveryReference").asText()).isEqualTo("Portón ficticio azul");
        assertThat(row.path("contactPhone").asText()).isEqualTo(payload.path("contactPhone").asText());
        assertThat(row.path("paymentPreference").asText()).isEqualTo(payload.path("paymentPreference").asText());
        assertThat(row.path("submittedAt").asText()).isNotBlank();
        assertThat(row.path("customerName").asText()).isNotBlank();
        assertThat(row.path("items").size()).isEqualTo(1);
        assertThat(row.path("orderStatus").isMissingNode()).isTrue();
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, id)).isNull();
        assertThat(get("/api/v1/operational/order-requests", customer).statusCode()).isEqualTo(403);
        assertThat(get("/api/v1/operational/order-requests", other).statusCode()).isEqualTo(403);
        assertThat(get("/api/v1/client/delivery-requests/" + id, other).statusCode()).isEqualTo(404);
        assertThat(body(get("/api/v1/client/delivery-requests", other)).valueStream()
                .noneMatch(entry -> id.toString().equals(entry.path("requestId").asText()))).isTrue();
    }

    @Test
    void listsRequestsWithoutStatusAndNormalizesOptionalFilters() {
        UUID menuItemId = seedMenuItem("Wok List", "20.00", "WOK_LIST", 60);
        String customer = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        String requestId = submit(customer, menuItemId, 1,
                nextServiceSlot().toString()).path("requestId").asText();

        for (String query : new String[] { "", "?status=", "?status=%20%20",
                "?status=%20pending_review%20" }) {
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
    }

    @Test
    void acceptsPickupRequestCreatingOrderAndReplaysDecision() {
        UUID menuItemId = seedMenuItem("Wok Pickup", "25.00", "WOK_DECISION", 120);
        String customer = tokenForRole("CLIENT");
        JsonNode submitted = submit(customer, menuItemId, 2, nextServiceSlot().toString());
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
        UUID requestId = UUID.fromString(submit(client, menuItemId, 1, nextServiceSlot().toString())
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
                nextServiceSlot().toString()).path("requestId").asText());
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
    void deliveryAcceptanceRequiresEnabledCapability() {
        UUID menuItemId = seedMenuItem("Wok Delivery", "18.00", "WOK_DELIVERY_DECISION", 60);
        enableDelivery();
        UUID requestId = deliveryId(tokenForRole("CLIENT"), deliveryPayload(menuItemId));
        var before = deliverySnapshot(requestId);

        var response = post("/api/v1/operational/order-requests/" + requestId + "/decision",
                tokenForRole("OPERATIONAL"), """
                {"action":"ACCEPT"}
                """);

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(deliverySnapshot(requestId)).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();
    }

    @Test
    void acceptsDeliveryCreatingSentOrderWithTakeawayLinesAndLinkedRequest() {
        enableDeliveryStatus("ENABLED");
        UUID item = seedMenuItem("Wok Delivery Accept", "18.00", "D4_ACCEPT", 60);
        String client = tokenForRole("CLIENT");
        UUID requestId = deliveryId(client, deliveryPayload(item));
        String operator = tokenForRole("OPERATIONAL");

        JsonNode accepted = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                "{\"action\":\"ACCEPT\"}"));
        UUID orderId = UUID.fromString(accepted.path("orderId").asText());
        var order = jdbc.queryForMap("""
                SELECT o.channel, o.status, o.subtotal, o.total, o.discount, o.dining_table_id,
                       a.status AS account_status
                FROM wok.orders o JOIN wok.order_accounts a ON a.id = o.account_id WHERE o.id = ?
                """, orderId);
        assertThat(order.get("channel")).isEqualTo("DELIVERY");
        assertThat(order.get("status")).isEqualTo("SENT");
        assertThat(order.get("subtotal")).isEqualTo(new BigDecimal("18.00"));
        assertThat(order.get("total")).isEqualTo(new BigDecimal("18.00"));
        assertThat(order.get("discount")).isEqualTo(new BigDecimal("0.00"));
        assertThat(order.get("dining_table_id")).isNull();
        assertThat(order.get("account_status")).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT fulfillment FROM wok.order_items WHERE order_id = ?", String.class, orderId))
                .isEqualTo("TAKEAWAY");
        var request = jdbc.queryForMap("""
                SELECT status, order_id, delivery_address, delivery_reference, contact_phone, payment_preference
                FROM wok.order_requests WHERE id = ?
                """, requestId);
        assertThat(request.get("status")).isEqualTo("ACCEPTED");
        assertThat(request.get("order_id")).isEqualTo(orderId);
        assertThat(request.get("delivery_address")).isEqualTo("Zona 1, prueba local");
        assertThat(request.get("delivery_reference")).isNull();
        assertThat(request.get("contact_phone")).isEqualTo("+502 5555-0101");
        assertThat(request.get("payment_preference")).isEqualTo("CASH_ON_DELIVERY");
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ? AND event_type = 'ACCEPTED'", requestId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'ORDER_REQUEST_ACCEPTED'", requestId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'ORDER_OPENED'", orderId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.kitchen_tickets WHERE order_id = ?", orderId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = (SELECT account_id FROM wok.orders WHERE id = ?)", orderId)).isEqualTo(0);

        JsonNode replay = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                "{\"action\":\"ACCEPT\"}"));
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(replay.path("orderId").asText()).isEqualTo(orderId.toString());
        assertThat(count("SELECT count(*) FROM wok.orders WHERE id = ?", orderId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_items WHERE order_id = ?", orderId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ? AND event_type = 'ACCEPTED'", requestId)).isEqualTo(1);
    }

    @Test
    void concurrentDeliveryAcceptsCreateOneOrderAndOneReplay() throws Exception {
        enableDeliveryStatus("ENABLED");
        UUID item = seedMenuItem("Wok Delivery Concurrent Accept", "19.00", "D4_CONCURRENT", 60);
        UUID requestId = deliveryId(tokenForRole("CLIENT"), deliveryPayload(item));
        String operator = tokenForRole("OPERATIONAL");
        String path = "/api/v1/operational/order-requests/" + requestId + "/decision";

        List<HttpResponse<String>> responses = concurrentDecisions(operator, path, "{\"action\":\"ACCEPT\"}");

        assertThat(responses).allMatch(response -> response.statusCode() == 200);
        List<JsonNode> bodies = responses.stream().map(this::readJson).toList();
        assertThat(bodies.stream().filter(body -> !body.path("idempotentReplay").asBoolean()).count()).isEqualTo(1);
        assertThat(bodies.stream().filter(body -> body.path("idempotentReplay").asBoolean()).count()).isEqualTo(1);
        assertThat(bodies.get(0).path("orderId")).isEqualTo(bodies.get(1).path("orderId"));
        UUID orderId = UUID.fromString(bodies.get(0).path("orderId").asText());
        assertThat(count("SELECT count(*) FROM wok.orders WHERE id = ?", orderId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_items WHERE order_id = ?", orderId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ? AND event_type = 'ACCEPTED'", requestId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'ORDER_REQUEST_ACCEPTED'", requestId)).isEqualTo(1);
    }

    @Test
    void deliveryAcceptRejectsCatalogChangesWithoutCreatingOrder() {
        enableDeliveryStatus("ENABLED");
        UUID item = seedMenuItem("Wok Delivery Gone", "18.00", "D4_GONE", 60);
        UUID requestId = deliveryId(tokenForRole("CLIENT"), deliveryPayload(item));
        jdbc.update("UPDATE wok.menu_items SET status = 'INACTIVE' WHERE id = ?", item);
        int orders = count("SELECT count(*) FROM wok.orders");

        var response = post("/api/v1/operational/order-requests/" + requestId + "/decision",
                tokenForRole("OPERATIONAL"), "{\"action\":\"ACCEPT\"}");

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId)).isNull();
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(orders);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "\"address\":null", "\"address\":\"   \"", "\"address\":\"abcd\"",
            "\"contactPhone\":null", "\"contactPhone\":\"\"", "\"contactPhone\":\"abcdefg\"",
            "\"paymentPreference\":null",
            "\"items\":null", "\"items\":[]",
            "\"items\":[{\"menuItemId\":null,\"quantity\":1}]",
            "\"items\":[{\"menuItemId\":\"00000000-0000-0000-0000-000000000001\",\"quantity\":0}]"
    })
    void rejectsInvalidDeliveryFieldsWithoutPersistence(String replacement) throws Exception {
        enableDelivery();
        var payload = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(deliveryPayload(UUID.randomUUID()));
        var field = json.readTree("{" + replacement + "}");
        field.fields().forEachRemaining(entry -> payload.set(entry.getKey(), entry.getValue()));
        var before = persistenceCounts();
        var response = postDelivery(tokenForRole("CLIENT"), UUID.randomUUID(), payload.toString());
        assertThat(response.statusCode()).as("%s: %s", replacement, response.body()).isEqualTo(400);
        assertThat(persistenceCounts()).isEqualTo(before);
    }

    @Test
    void rejectsNullDeliveryItemWithBeanValidationWithoutPersistence() throws Exception {
        var payload = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(deliveryPayload(UUID.randomUUID()));
        payload.putArray("items").addNull();
        String client = tokenForRole("CLIENT");
        var before = persistenceCounts();

        var response = postDelivery(client, UUID.randomUUID(), payload.toString());

        assertThat(response.statusCode()).as("body %s", response.body()).isEqualTo(400);
        assertThat(json.readTree(response.body()).path("message").asText()).isEqualTo("Revisa los datos enviados.");
        assertThat(persistenceCounts()).isEqualTo(before);
    }

    @Test
    void rejectsDuplicateAndUnavailableDeliveryItemsWithoutPersistence() {
        enableDelivery();
        UUID item = seedMenuItem("Prueba delivery", "18.00", "D1_ITEMS", 60);
        String client = tokenForRole("CLIENT");
        String payload = deliveryPayload(item);
        String line = "{\"menuItemId\":\"" + item + "\",\"quantity\":1}";
        var before = persistenceCounts();
        assertThat(postDelivery(client, UUID.randomUUID(), payload.replace(line, line + "," + line)).statusCode())
                .isEqualTo(400);
        jdbc.update("UPDATE wok.menu_items SET status = 'INACTIVE' WHERE id = ?", item);
        assertThat(postDelivery(client, UUID.randomUUID(), payload).statusCode()).isEqualTo(422);
        assertThat(postDelivery(client, UUID.randomUUID(), deliveryPayload(UUID.randomUUID())).statusCode()).isEqualTo(422);
        assertThat(persistenceCounts()).isEqualTo(before);
    }

    @Test
    void replaysDeliveryAndConflictsWithoutChangingPersistedSnapshot() {
        enableDelivery();
        UUID item = seedMenuItem("Prueba replay", "18.00", "D1_REPLAY", 60);
        String client = tokenForRole("CLIENT");
        UUID key = UUID.randomUUID();
        String payload = deliveryPayload(item);
        JsonNode first = body(postDelivery(client, key, payload));
        assertThat(first.path("idempotentReplay").asBoolean()).isFalse();
        UUID id = UUID.fromString(first.path("requestId").asText());
        var before = deliverySnapshot(id);
        var counts = persistenceCounts();
        JsonNode replay = body(postDelivery(client, key, payload));
        assertThat(replay.path("requestId")).isEqualTo(first.path("requestId"));
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(postDelivery(client, key, payload.replace("Zona 1", "Zona 2")).statusCode()).isEqualTo(409);
        assertThat(deliverySnapshot(id)).isEqualTo(before);
        assertThat(persistenceCounts()).isEqualTo(counts);
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ?", id)).isEqualTo(1);
    }

    @Test
    void concurrentIdenticalDeliveryPostsProduceOneOriginalAndOneReplay() throws Exception {
        enableDelivery();
        UUID clientId = createUserWithRole("d2-identical-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String token = tokenFor(clientId);
        UUID item = seedMenuItem("D2 idéntico", "18.00", "D2_IDENTICAL", 60);
        UUID key = UUID.randomUUID();
        String payload = deliveryPayload(item);
        var before = persistenceCounts();

        List<HttpResponse<String>> responses = concurrentPosts(token, key, payload, payload);

        assertThat(responses).allMatch(response -> response.statusCode() == 202);
        List<JsonNode> bodies = responses.stream().map(this::readJson).toList();
        assertThat(bodies.stream().filter(body -> !body.path("idempotentReplay").asBoolean()).count()).isEqualTo(1);
        assertThat(bodies.stream().filter(body -> body.path("idempotentReplay").asBoolean()).count()).isEqualTo(1);
        assertThat(bodies.get(0).path("requestId")).isEqualTo(bodies.get(1).path("requestId"));
        UUID requestId = UUID.fromString(bodies.get(0).path("requestId").asText());
        assertThat(deliverySnapshot(requestId).get("request")).isNotNull();
        assertThat(count("SELECT count(*) FROM wok.order_requests WHERE customer_user_id = ? AND idempotency_key = ?", clientId, key)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_request_items WHERE order_request_id = ?", requestId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ? AND event_type = 'SUBMITTED'", requestId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT request_fingerprint FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo(jdbc.queryForObject("SELECT request_fingerprint FROM wok.order_requests WHERE customer_user_id = ? AND idempotency_key = ?", String.class, clientId, key));
        Map<String, Object> after = persistenceCounts();
        assertThat(((Number) after.get("requests")).longValue() - ((Number) before.get("requests")).longValue()).isEqualTo(1);
        assertThat(((Number) after.get("items")).longValue() - ((Number) before.get("items")).longValue()).isEqualTo(1);
        assertThat(((Number) after.get("events")).longValue() - ((Number) before.get("events")).longValue()).isEqualTo(1);
    }

    @Test
    void concurrentDifferentDeliveryPostsProduceOneCreationAndOneConflict() throws Exception {
        enableDelivery();
        UUID clientId = createUserWithRole("d2-conflict-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String token = tokenFor(clientId);
        UUID item = seedMenuItem("D2 conflicto", "18.00", "D2_CONFLICT", 60);
        UUID key = UUID.randomUUID();
        String firstPayload = deliveryPayload(item);
        String secondPayload = firstPayload.replace("Zona 1, prueba local", "Zona 2, prueba local");
        var before = persistenceCounts();

        List<HttpResponse<String>> responses = concurrentPosts(token, key, firstPayload, secondPayload);

        assertThat(responses.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(202, 409);
        JsonNode created = readJson(responses.stream().filter(response -> response.statusCode() == 202).findFirst().orElseThrow());
        assertThat(created.path("idempotentReplay").asBoolean()).isFalse();
        UUID requestId = UUID.fromString(created.path("requestId").asText());
        assertThat(count("SELECT count(*) FROM wok.order_requests WHERE customer_user_id = ? AND idempotency_key = ?", clientId, key)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_request_items WHERE order_request_id = ?", requestId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ?", requestId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT delivery_address FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isIn("Zona 1, prueba local", "Zona 2, prueba local");
        Map<String, Object> after = persistenceCounts();
        assertThat(((Number) after.get("requests")).longValue() - ((Number) before.get("requests")).longValue()).isEqualTo(1);
        assertThat(((Number) after.get("items")).longValue() - ((Number) before.get("items")).longValue()).isEqualTo(1);
        assertThat(((Number) after.get("events")).longValue() - ((Number) before.get("events")).longValue()).isEqualTo(1);
    }

    @Test
    void concurrentSameKeyDeliveryPostsRemainIsolatedByClient() throws Exception {
        enableDelivery();
        UUID firstClient = createUserWithRole("d2-owner-a-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID secondClient = createUserWithRole("d2-owner-b-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID item = seedMenuItem("D2 aislamiento", "18.00", "D2_ISOLATION", 60);
        UUID key = UUID.randomUUID();
        String payload = deliveryPayload(item);
        var before = persistenceCounts();

        List<HttpResponse<String>> responses = concurrentPosts(tokenFor(firstClient), key, payload, tokenFor(secondClient), payload);

        assertThat(responses).allMatch(response -> response.statusCode() == 202);
        assertThat(responses.stream().map(this::readJson).map(body -> body.path("idempotentReplay").asBoolean()))
                .containsExactlyInAnyOrder(false, false);
        assertThat(count("SELECT count(*) FROM wok.order_requests WHERE customer_user_id IN (?, ?) AND idempotency_key = ?", firstClient, secondClient, key)).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM wok.order_request_items WHERE order_request_id IN (SELECT id FROM wok.order_requests WHERE customer_user_id IN (?, ?) AND idempotency_key = ?)", firstClient, secondClient, key)).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id IN (SELECT id FROM wok.order_requests WHERE customer_user_id IN (?, ?) AND idempotency_key = ?)", firstClient, secondClient, key)).isEqualTo(2);
        Map<String, Object> after = persistenceCounts();
        assertThat(((Number) after.get("requests")).longValue() - ((Number) before.get("requests")).longValue()).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"PAUSED", "DISABLED"})
    void unavailableDeliveryDoesNotPersist(String status) {
        enableDelivery();
        UUID item = seedMenuItem("Prueba servicio", "18.00", "D1_SERVICE", 60);
        jdbc.update("UPDATE wok.service_capabilities SET status = ? WHERE code = 'DELIVERY'", status);
        try {
            var before = persistenceCounts();
            assertThat(postDelivery(tokenForRole("CLIENT"), UUID.randomUUID(), deliveryPayload(item)).statusCode())
                    .isEqualTo(503);
            assertThat(persistenceCounts()).isEqualTo(before);
        } finally {
            enableDelivery();
        }
    }

    @Test
    void isolatesDeliveryHistoryAndDetailsBetweenCustomers() {
        enableDelivery();
        UUID item = seedMenuItem("Prueba aislamiento", "18.00", "D1_ISOLATION", 60);
        String first = tokenForRole("CLIENT");
        String second = tokenForRole("CLIENT");
        UUID firstId = deliveryId(first, deliveryPayload(item));
        UUID secondId = deliveryId(second, deliveryPayload(item));
        for (var customer : Map.of(first, firstId, second, secondId).entrySet()) {
            JsonNode history = body(get("/api/v1/client/delivery-requests", customer.getKey()));
            assertThat(history.size()).isEqualTo(1);
            assertThat(history.get(0).path("requestId").asText()).isEqualTo(customer.getValue().toString());
            JsonNode detail = body(get("/api/v1/client/delivery-requests/" + customer.getValue(), customer.getKey()));
            assertThat(detail.path("requestId").asText()).isEqualTo(customer.getValue().toString());
            assertThat(detail.path("items").size()).isEqualTo(1);
        }
        assertThat(get("/api/v1/client/delivery-requests/" + firstId, second).statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/client/delivery-requests/" + secondId, first).statusCode()).isEqualTo(404);
    }

    @Test
    void rejectsDeliveryOnceWithoutCreatingOrder() {
        enableDelivery();
        UUID item = seedMenuItem("Prueba rechazo", "18.00", "D1_REJECT", 60);
        UUID id = deliveryId(tokenForRole("CLIENT"), deliveryPayload(item));
        String operator = tokenForRole("OPERATIONAL");
        int orders = count("SELECT count(*) FROM wok.orders");
        String path = "/api/v1/operational/order-requests/" + id + "/decision";
        String decision = "{\"action\":\"REJECT\",\"reason\":\"Prueba sin cobertura\"}";
        JsonNode first = body(post(path, operator, decision));
        assertThat(first.path("status").asText()).isEqualTo("REJECTED");
        assertThat(first.path("idempotentReplay").asBoolean()).isFalse();
        var before = deliverySnapshot(id);
        assertThat(body(post(path, operator, decision)).path("idempotentReplay").asBoolean()).isTrue();
        assertThat(deliverySnapshot(id)).isEqualTo(before);
        assertThat(count("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ? AND event_type = 'REJECTED'", id)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'ORDER_REQUEST_REJECTED'", id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, id)).isNull();
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(orders);
    }

    private void enableDelivery() {
        enableDeliveryStatus("MANUAL_APPROVAL");
    }

    @Test
    void deliveryDoesNotInheritTheUnconfirmedPickupMaximum() {
        enableDeliveryStatus("ENABLED");
        UUID item = seedMenuItem("Delivery futuro", "18.00", "D4_FUTURE", 60);
        String payload = """
            {"requestedFor":"%s","address":"Dirección ficticia","contactPhone":"+50255550101",
             "paymentPreference":"CASH_ON_DELIVERY","items":[{"menuItemId":"%s","quantity":1}]}
            """.formatted(Instant.now().plusSeconds(14400), item);
        UUID id = deliveryId(tokenForRole("CLIENT"), payload);
        JsonNode accepted = body(post("/api/v1/operational/order-requests/" + id + "/decision",
                tokenForRole("OPERATIONAL"), "{\"action\":\"ACCEPT\"}"));
        assertThat(accepted.path("status").asText()).isEqualTo("ACCEPTED");
    }

    private void enableDeliveryStatus(String status) {
        jdbc.update("""
                INSERT INTO wok.service_capabilities(code, status) VALUES ('DELIVERY', ?)
                ON CONFLICT (code) DO UPDATE SET status = EXCLUDED.status,
                    effective_from = now(), effective_until = NULL
                """, status);
    }

    private String deliveryPayload(UUID item) {
        return """
                {"requestedFor":"%s","address":"Zona 1, prueba local","contactPhone":"+502 5555-0101",
                 "paymentPreference":"CASH_ON_DELIVERY","items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(nextServiceSlot(), item);
    }

    private HttpResponse<String> postDelivery(String token, UUID key, String payload) {
        verifiedPhoneFixture(token,"+502 5555-0101");
        return post("/api/v1/client/delivery-requests", token, withCoreQuote(token,payload,"DELIVERY"), Map.of("Idempotency-Key", key.toString()));
    }

    private List<HttpResponse<String>> concurrentPosts(String token, UUID key, String firstPayload, String secondPayload)
            throws Exception {
        return concurrentPosts(token, key, firstPayload, token, secondPayload);
    }

    private List<HttpResponse<String>> concurrentPosts(String firstToken, UUID key, String firstPayload,
                                                       String secondToken, String secondPayload) throws Exception {
        verifiedPhoneFixture(firstToken,"+502 5555-0101");verifiedPhoneFixture(secondToken,"+502 5555-0101");
        String quotedFirst=withCoreQuote(firstToken,firstPayload,"DELIVERY"),quotedSecond=withCoreQuote(secondToken,secondPayload,"DELIVERY");
        HttpClient client = HttpClient.newHttpClient();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        CompletableFuture<HttpResponse<String>> first = CompletableFuture.supplyAsync(
                () -> awaitAndPost(client, firstToken, key, quotedFirst, ready, start));
        CompletableFuture<HttpResponse<String>> second = CompletableFuture.supplyAsync(
                () -> awaitAndPost(client, secondToken, key, quotedSecond, ready, start));
        assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
        start.countDown();
        return List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));
    }

    private List<HttpResponse<String>> concurrentDecisions(String token, String path, String payload) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        CompletableFuture<HttpResponse<String>> first = CompletableFuture.supplyAsync(
                () -> awaitAndPost(client, token, null, payload, path, ready, start));
        CompletableFuture<HttpResponse<String>> second = CompletableFuture.supplyAsync(
                () -> awaitAndPost(client, token, null, payload, path, ready, start));
        assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
        start.countDown();
        return List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));
    }

    private HttpResponse<String> awaitAndPost(HttpClient client, String token, UUID key, String payload,
                                               CountDownLatch ready, CountDownLatch start) {
        return awaitAndPost(client, token, key, payload, "/api/v1/client/delivery-requests", ready, start);
    }

    private HttpResponse<String> awaitAndPost(HttpClient client, String token, UUID key, String payload,
                                               String path, CountDownLatch ready, CountDownLatch start) {
        ready.countDown();
        try {
            if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("concurrency gate timed out");
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl() + path))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + token);
            if (key != null) builder.header("Idempotency-Key", key.toString());
            HttpRequest request = builder.POST(HttpRequest.BodyPublishers.ofString(payload)).build();
            return client.sendAsync(request, HttpResponse.BodyHandlers.ofString()).join();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }

    private UUID deliveryId(String token, String payload) {
        UUID id=UUID.fromString(body(postDelivery(token, UUID.randomUUID(), payload)).path("requestId").asText());authorizeReviewFixture(id);return id;
    }

    private JsonNode readJson(HttpResponse<String> response) {
        try {
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new IllegalStateException("Invalid JSON response: " + response.body(), failure);
        }
    }

    private Map<String, Object> persistenceCounts() {
        return jdbc.queryForMap("""
                SELECT (SELECT count(*) FROM wok.order_requests) AS requests,
                       (SELECT count(*) FROM wok.order_request_items) AS items,
                       (SELECT count(*) FROM wok.order_request_events) AS events,
                       (SELECT count(*) FROM wok.audit_logs) AS audits,
                       (SELECT count(*) FROM wok.orders) AS orders,
                       (SELECT count(*) FROM wok.order_accounts) AS accounts
                """);
    }

    private Map<String, Object> deliverySnapshot(UUID id) {
        return Map.of("request", jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", id),
                "items", jdbc.queryForList("SELECT * FROM wok.order_request_items WHERE order_request_id = ? ORDER BY id", id),
                "events", jdbc.queryForList("SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id", id),
                "audits", jdbc.queryForList("SELECT * FROM wok.audit_logs WHERE entity_id = ? ORDER BY id", id),
                "counts", persistenceCounts());
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
        return body(post("/api/v1/client/order-requests", token, withCoreQuote(token,"""
                {"requestedFor":"%s","customerNote":"prueba","items":[{"menuItemId":"%s","quantity":%d}]}
                """.formatted(requestedFor, menuItemId, quantity),"PICKUP"),
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
