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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.stream.Stream;

class ClientOrderChangeRequestIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void postgresAndJavaCountSupplementaryReasonsAsCodePoints() {
        String reason = "😀a";
        assertThat(reason.length()).isEqualTo(3); // Medida UTF-16, no longitud comercial.
        assertThat(reason.codePointCount(0, reason.length())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT char_length(btrim(CAST(? AS text)))", Integer.class, reason)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SHOW server_encoding", String.class)).isEqualTo("UTF8");
        System.out.println("F4_COUNT utf16=3 java_codepoints=2 postgres_char_length=2 encoding=UTF8");
    }

    @Test
    void supplementaryAndBlankSubmissionReasonsRejectWithoutAnyPersistentChange() throws Exception {
        AcceptedOrder order = acceptedPickup();
        String path = "/api/v1/client/order-requests/" + order.requestId() + "/change-requests";
        Map<String, String> key = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        var before = completeCancellationSnapshot();
        for (String reason : new String[] {"😀a", " 😀a ", "", "   ", "\t\r\n", "ab", "x".repeat(501), "😀".repeat(501)}) {
            var response = post(path, order.clientToken(), json.writeValueAsString(Map.of("reason", reason)), key);
            assertThat(response.statusCode()).as("reason code points %s", reason.codePointCount(0, reason.length())).isEqualTo(400);
            assertThat(completeCancellationSnapshot()).isEqualTo(before);
        }
        assertThat(post(path, order.clientToken(), "{\"reason\":null}", key).statusCode()).isEqualTo(400);
        assertThat(completeCancellationSnapshot()).isEqualTo(before);
        JsonNode submitted = body(post(path, order.clientToken(), "{\"reason\":\" 😀aa \"}", key));
        assertThat(submitted.path("reason").asText()).isEqualTo("😀aa");
        var persisted = completeCancellationSnapshot();
        assertThat(body(post(path, order.clientToken(), "{\"reason\":\"😀aa\"}", key)).path("id")).isEqualTo(submitted.path("id"));
        assertThat(completeCancellationSnapshot()).isEqualTo(persisted);
        System.out.println("F4_SUBMIT Unicode/blank/bounds=400 no_writes=true rejected_key_reusable=true replay_stable=true");
    }

    @Test
    void supplementaryDecisionReasonsRejectBeforeApprovalAndDoNotConsumeKeys() throws Exception {
        AcceptedOrder order = acceptedPickup();
        JsonNode submitted = body(post("/api/v1/client/order-requests/" + order.requestId() + "/change-requests",
                order.clientToken(), "{\"reason\":\"Motivo válido\"}", Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        String path = "/api/v1/operational/order-change-requests/" + submitted.path("id").asText();
        Map<String, String> key = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        var before = completeCancellationSnapshot();
        for (String decision : new String[] {"APPROVE", "REJECT"}) {
            for (String reason : new String[] {"😀a", " 😀a ", "ab", "x".repeat(501), "😀".repeat(501)}) {
                var response = patch(path, order.operatorToken(), json.writeValueAsString(Map.of(
                        "decision", decision, "expectedVersion", 1, "reason", reason)), key);
                assertThat(response.statusCode()).isEqualTo(400);
                assertThat(completeCancellationSnapshot()).isEqualTo(before);
            }
        }
        for (String reason : new String[] {"", "   ", "\t\r\n"}) {
            assertThat(patch(path, order.operatorToken(), json.writeValueAsString(Map.of(
                    "decision", "REJECT", "expectedVersion", 1, "reason", reason)), key).statusCode()).isEqualTo(422);
            assertThat(completeCancellationSnapshot()).isEqualTo(before);
        }
        assertThat(patch(path, order.operatorToken(), "{\"decision\":\"REJECT\",\"expectedVersion\":1,\"reason\":null}", key).statusCode()).isEqualTo(422);
        assertThat(completeCancellationSnapshot()).isEqualTo(before);
        JsonNode approved = body(patch(path, order.operatorToken(), "{\"decision\":\"APPROVE\",\"expectedVersion\":1,\"reason\":\" 😀aa \"}", key));
        assertThat(approved.path("decisionReason").asText()).isEqualTo("😀aa");
        var persisted = completeCancellationSnapshot();
        assertThat(body(patch(path, order.operatorToken(), "{\"decision\":\"APPROVE\",\"expectedVersion\":1,\"reason\":\"😀aa\"}", key))).isEqualTo(approved);
        assertThat(completeCancellationSnapshot()).isEqualTo(persisted);
        System.out.println("F4_DECISION Unicode/bounds=400 blank_REJECT=422 no_writes=true rejected_key_reusable=true replay_stable=true");
    }

    static Stream<Arguments> validReasonBoundaries() {
        return Stream.of("abc", "x".repeat(500), "😀aa", "😀".repeat(3), "😀".repeat(500), "e\u0301a")
                .flatMap(reason -> Stream.of("APPROVE", "REJECT").map(decision -> Arguments.of(reason, decision)));
    }

    @ParameterizedTest(name = "valid Unicode/ASCII boundary #{index}: {1}")
    @MethodSource("validReasonBoundaries")
    void validAsciiAndSupplementaryBoundariesPersistAndReplay(String reason, String decision) throws Exception {
        AcceptedOrder order = acceptedPickup();
        String requestPath = "/api/v1/client/order-requests/" + order.requestId() + "/change-requests";
        Map<String, String> requestKey = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode submitted = body(post(requestPath, order.clientToken(), json.writeValueAsString(Map.of("reason", " " + reason + " ")), requestKey));
        assertThat(submitted.path("reason").asText()).isEqualTo(reason);
        int expectedLength = reason.equals("x".repeat(500)) || reason.equals("😀".repeat(500)) ? 500 : 3;
        UUID id = UUID.fromString(submitted.path("id").asText());
        assertThat(jdbc.queryForObject("SELECT char_length(btrim(reason)) FROM wok.order_change_requests WHERE id = ?", Integer.class, id)).isEqualTo(expectedLength);
        var submittedSnapshot = completeCancellationSnapshot();
        assertThat(body(post(requestPath, order.clientToken(), json.writeValueAsString(Map.of("reason", reason)), requestKey))).isEqualTo(submitted);
        assertThat(completeCancellationSnapshot()).isEqualTo(submittedSnapshot);
        String decisionPath = "/api/v1/operational/order-change-requests/" + id;
        Map<String, String> decisionKey = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode decided = body(patch(decisionPath, order.operatorToken(), json.writeValueAsString(Map.of(
                "decision", decision, "expectedVersion", 1, "reason", " " + reason + " ")), decisionKey));
        assertThat(decided.path("decisionReason").asText()).isEqualTo(reason);
        assertThat(jdbc.queryForObject("SELECT char_length(btrim(decision_reason)) FROM wok.order_change_requests WHERE id = ?", Integer.class, id)).isEqualTo(expectedLength);
        var decidedSnapshot = completeCancellationSnapshot();
        assertThat(body(patch(decisionPath, order.operatorToken(), json.writeValueAsString(Map.of(
                "decision", decision, "expectedVersion", 1, "reason", reason)), decisionKey))).isEqualTo(decided);
        assertThat(completeCancellationSnapshot()).isEqualTo(decidedSnapshot);
        System.out.println("F4_VALID chars=" + expectedLength + " utf16=" + reason.length() + " decision=" + decision + " persisted=true replay_stable=true");
    }

    private Map<String, Object> completeCancellationSnapshot() {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        for (String table : List.of("order_requests", "order_change_requests", "order_change_request_events",
                "audit_logs", "idempotency_keys", "orders", "order_accounts", "order_items", "order_status_history",
                "kitchen_tickets", "kitchen_ticket_status_history", "payments", "cash_movements", "inventory_movements",
                "inventory_reservations", "inventory_balances")) {
            snapshot.put(table, jdbc.queryForList("SELECT to_jsonb(t)::text AS row FROM wok." + table + " t ORDER BY to_jsonb(t)::text"));
        }
        return snapshot;
    }

    @Test
    void currentCancellationRemainsAccessibleBeyondOneHundredGlobalChanges() {
        AcceptedOrder order = acceptedPickup();
        String path = "/api/v1/client/order-requests/" + order.requestId() + "/change-requests";
        JsonNode target = body(post(path, order.clientToken(), "{\"reason\":\"Cambio de horario\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID customer = jdbc.queryForObject("SELECT customer_user_id FROM wok.order_requests WHERE id = ?", UUID.class, order.requestId());
        UUID differentRequest = jdbc.queryForObject("""
            INSERT INTO wok.order_requests(customer_user_id, status, fulfillment_type, requested_for, currency_id,
                idempotency_key, request_fingerprint, subtotal)
            SELECT customer_user_id, 'PENDING_REVIEW', 'PICKUP', requested_for, currency_id,
                gen_random_uuid(), request_fingerprint, subtotal
            FROM wok.order_requests WHERE id = ? RETURNING id
            """, UUID.class, order.requestId());
        // Fixture histórico distinto: decisiones ya resueltas, sin cancelaciones pendientes duplicadas.
        jdbc.update("""
            INSERT INTO wok.order_change_requests(order_id, order_request_id, customer_user_id, reason,
                expected_order_version, request_id, status, decided_by, decided_at, created_at)
            SELECT ?, ?, ?, 'Historial ficticio', 1, gen_random_uuid(), 'REJECTED', ?, now(), now() + interval '1 minute'
            FROM generate_series(1,101)
            """, order.orderId(), differentRequest, customer, UUID.fromString(order.operatorSubject()));
        JsonNode list = body(get("/api/v1/client/order-requests/change-requests", order.clientToken()));
        assertThat(list.size()).isEqualTo(100);
        assertThat(list.valueStream().noneMatch(entry -> target.path("id").asText().equals(entry.path("id").asText()))).isTrue();
        assertThat(body(get(path + "/current", order.clientToken())).path("id").asText()).isEqualTo(target.path("id").asText());
        assertThat(get(path + "/current", tokenForRole("CLIENT")).statusCode()).isEqualTo(404);
    }

    @Test
    void normalizedReasonsValidateBeforeAnyWriteAndRejectedKeysCanBeReused() throws Exception {
        AcceptedOrder order = acceptedPickup();
        String path = "/api/v1/client/order-requests/" + order.requestId() + "/change-requests";
        Map<String, String> key = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        Map<String, Object> before = cancellationWrites();
        for (String reason : new String[] {"", "   ", " a ", " ab ", "x".repeat(501)}) {
            var response = post(path, order.clientToken(), json.writeValueAsString(Map.of("reason", reason)), key);
            assertThat(response.statusCode()).as("reason length %s", reason.length()).isEqualTo(400);
            assertThat(cancellationWrites()).isEqualTo(before);
        }
        JsonNode change = body(post(path, order.clientToken(), "{\"reason\":\"  abc  \"}", key));
        assertThat(change.path("reason").asText()).isEqualTo("abc");
        assertThat(body(post(path, order.clientToken(), "{\"reason\":\"abc\"}", key)).path("id").asText()).isEqualTo(change.path("id").asText());
        String decisionPath = "/api/v1/operational/order-change-requests/" + change.path("id").asText();
        Map<String, String> decisionKey = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        before = cancellationWrites();
        for (String action : new String[] {"APPROVE", "REJECT"}) {
            for (String reason : new String[] {" a ", " ab ", "x".repeat(501)}) {
                var response = patch(decisionPath, order.operatorToken(), json.writeValueAsString(Map.of(
                        "decision", action, "expectedVersion", 1, "reason", reason)), decisionKey);
                assertThat(response.statusCode()).isEqualTo(400);
                assertThat(cancellationWrites()).isEqualTo(before);
            }
        }
        for (String reason : new String[] {"", "   "}) {
            assertThat(patch(decisionPath, order.operatorToken(), json.writeValueAsString(Map.of(
                    "decision", "REJECT", "expectedVersion", 1, "reason", reason)), decisionKey).statusCode()).isEqualTo(422);
            assertThat(cancellationWrites()).isEqualTo(before);
        }
        String max = "x".repeat(500);
        JsonNode rejected = body(patch(decisionPath, order.operatorToken(), json.writeValueAsString(Map.of(
                "decision", "REJECT", "expectedVersion", 1, "reason", " " + max + " ")), decisionKey));
        assertThat(rejected.path("decisionReason").asText()).isEqualTo(max);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId())).isEqualTo("SENT");
        JsonNode second = body(post(path, order.clientToken(), json.writeValueAsString(Map.of("reason", " " + max + " ")),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(second.path("reason").asText()).isEqualTo(max);
        JsonNode approved = body(patch("/api/v1/operational/order-change-requests/" + second.path("id").asText(),
                order.operatorToken(), "{\"decision\":\"APPROVE\",\"expectedVersion\":1,\"reason\":\"   \"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(approved.path("decisionReason").isMissingNode()).isTrue();
        assertThat(jdbc.queryForObject("SELECT decision_reason FROM wok.order_change_requests WHERE id = ?",
                String.class, UUID.fromString(second.path("id").asText()))).isNull();
    }

    private Map<String, Object> cancellationWrites() {
        return jdbc.queryForMap("""
            SELECT (SELECT count(*) FROM wok.order_change_requests) AS requests,
                   (SELECT count(*) FROM wok.order_change_request_events) AS events,
                   (SELECT count(*) FROM wok.audit_logs) AS audits,
                   (SELECT count(*) FROM wok.idempotency_keys) AS keys,
                   (SELECT sum(row_version) FROM wok.orders) AS order_versions,
                   (SELECT sum(row_version) FROM wok.order_change_requests) AS change_versions
            """);
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
    void capturedPaymentBlocksApprovalWithoutImplicitRefund() {
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

    @Test
    void ownershipPermissionFingerprintAndConcurrentDecisionsAreEnforced() throws Exception {
        AcceptedOrder order = acceptedPickup();
        String sourcePath = "/api/v1/client/order-requests/" + order.requestId() + "/change-requests";
        Map<String, String> key = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode submitted = body(post(sourcePath, order.clientToken(), "{\"reason\":\"Cambio de horario\"}", key));
        UUID id = UUID.fromString(submitted.path("id").asText());
        assertThat(post(sourcePath, order.clientToken(), "{\"reason\":\"Otro motivo\"}", key).statusCode()).isEqualTo(409);
        assertThat(post(sourcePath, order.clientToken(), "{\"reason\":\"Cambio de horario\"}", Map.of("Idempotency-Key", UUID.randomUUID().toString())).statusCode()).isEqualTo(409);
        String other = tokenForRole("CLIENT");
        assertThat(get(sourcePath + "/current", other).statusCode()).isEqualTo(404);
        assertThat(body(get("/api/v1/client/order-requests/change-requests", other)).isEmpty()).isTrue();
        String decisionPath = "/api/v1/operational/order-change-requests/" + id;
        assertThat(patch(decisionPath, order.clientToken(), "{\"decision\":\"APPROVE\",\"expectedVersion\":1}", key).statusCode()).isEqualTo(403);
        var start = new java.util.concurrent.CountDownLatch(1);
        var first = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
            try { start.await(); } catch (InterruptedException failure) { throw new IllegalStateException(failure); }
            return patch(decisionPath, order.operatorToken(), "{\"decision\":\"APPROVE\",\"expectedVersion\":1}", Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        });
        var second = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
            try { start.await(); } catch (InterruptedException failure) { throw new IllegalStateException(failure); }
            return patch(decisionPath, order.operatorToken(), "{\"decision\":\"REJECT\",\"reason\":\"Preparación iniciada\",\"expectedVersion\":1}", Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        });
        start.countDown();
        assertThat(java.util.List.of(first.get(20, java.util.concurrent.TimeUnit.SECONDS).statusCode(), second.get(20, java.util.concurrent.TimeUnit.SECONDS).statusCode())).containsExactlyInAnyOrder(200, 409);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_change_request_events WHERE order_change_request_id = ?", Integer.class, id)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'ORDER_CANCELLATION_DECIDED'", Integer.class, id)).isEqualTo(1);
        String status = jdbc.queryForObject("SELECT status FROM wok.order_change_requests WHERE id = ?", String.class, id);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId())).isEqualTo("APPROVED".equals(status) ? "CANCELLED" : "SENT");
    }

    @Test
    void acceptedDeliveryCancellationIsOnlyARequestAndRequiresOperationalReview() {
        AcceptedOrder order = acceptedPickup();
        jdbc.update("UPDATE wok.orders SET channel = 'DELIVERY' WHERE id = ?", order.orderId());
        jdbc.update("UPDATE wok.order_requests SET fulfillment_type = 'DELIVERY', delivery_address = 'Dirección ficticia', contact_phone = '+50255550101', payment_preference = 'CASH_ON_DELIVERY' WHERE id = ?", order.requestId());
        assertThat(post("/api/v1/client/order-requests/" + order.requestId() + "/change-requests", order.clientToken(), "{\"reason\":\"Quiero cancelar\"}", Map.of("Idempotency-Key", UUID.randomUUID().toString())).statusCode()).isEqualTo(201);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order.orderId())).isEqualTo("SENT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_change_requests WHERE order_id = ?", Integer.class, order.orderId())).isEqualTo(1);
    }

    private AcceptedOrder acceptedPickup() {
        jdbc.update("""
            INSERT INTO wok.business_hours(service_type, weekday, opens_at, closes_at, timezone_name)
            SELECT 'RESTAURANT', day, '00:00'::time, '23:59:59'::time, 'America/Guatemala'
            FROM generate_series(1,7) day
            """);
        UUID customerId = createUserWithRole("cancel-client-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID operatorId = createUserWithRole("cancel-operator-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID productId = seedMenuItem("Wok cancellation", "25.00");
        String client = tokenFor(customerId);
        String operator = tokenFor(operatorId);
        JsonNode request = body(post("/api/v1/client/order-requests", client,
                withCoreQuote(client,"{\"requestedFor\":\"" + nextServiceSlot() + "\",\"items\":[{\"menuItemId\":\"" + productId + "\",\"quantity\":1}]}", "PICKUP"),
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
