package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class ReservationWorkflowIntegrationTest extends PostgresIntegrationTest {

    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void submissionReplaysAndRejectsDifferentContentOrCustomer() {
        setReservationsEnabled();
        UUID firstCustomer = customer("workflow-replay-first");
        UUID secondCustomer = customer("workflow-replay-second");
        String key = UUID.randomUUID().toString();
        String payload = payload("Primera solicitud");

        JsonNode first = body(post("/api/v1/client/reservations", tokenFor(firstCustomer), payload,
                Map.of("Idempotency-Key", key)));
        JsonNode replay = body(post("/api/v1/client/reservations", tokenFor(firstCustomer), payload,
                Map.of("Idempotency-Key", key)));

        assertThat(first.path("requestId").asText()).isEqualTo(replay.path("requestId").asText());
        assertThat(first.path("reservationId").asText()).isEqualTo(replay.path("reservationId").asText());
        assertThat(count("SELECT count(*) FROM wok.reservation_evaluations WHERE request_id = ?",
                UUID.fromString(key))).isEqualTo(1);

        var differentContent = post("/api/v1/client/reservations", tokenFor(firstCustomer),
                payload("Contenido distinto"), Map.of("Idempotency-Key", key));
        assertThat(differentContent.statusCode()).isEqualTo(409);

        var differentCustomer = post("/api/v1/client/reservations", tokenFor(secondCustomer), payload,
                Map.of("Idempotency-Key", key));
        assertThat(differentCustomer.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.reservation_evaluations WHERE request_id = ?",
                UUID.fromString(key))).isEqualTo(1);
    }

    @Test
    void clientHistoryIsIsolatedByRequester() {
        setReservationsEnabled();
        UUID firstCustomer = customer("workflow-history-first");
        UUID secondCustomer = customer("workflow-history-second");
        JsonNode first = submit(firstCustomer, "Historial uno", UUID.randomUUID().toString());
        JsonNode second = submit(secondCustomer, "Historial dos", UUID.randomUUID().toString());

        JsonNode firstHistory = body(get("/api/v1/client/reservations", tokenFor(firstCustomer)));
        JsonNode secondHistory = body(get("/api/v1/client/reservations", tokenFor(secondCustomer)));

        assertThat(firstHistory).hasSize(1);
        assertThat(firstHistory.get(0).path("requestId").asText()).isEqualTo(first.path("requestId").asText());
        assertThat(firstHistory.toString()).doesNotContain(second.path("requestId").asText());
        assertThat(secondHistory).hasSize(1);
        assertThat(secondHistory.get(0).path("requestId").asText()).isEqualTo(second.path("requestId").asText());
        assertThat(secondHistory.toString()).doesNotContain(first.path("requestId").asText());
    }

    @Test
    void pendingQueueAllowsOperationalAndAdminButRejectsClient() {
        setReservationsEnabled();
        UUID customerId = customer("workflow-queue");
        JsonNode submitted = submit(customerId, "En cola", UUID.randomUUID().toString());
        UUID reservationId = UUID.fromString(submitted.path("reservationId").asText());

        var operational = get("/api/v1/operational/reservations/pending", tokenForRole("OPERATIONAL"));
        var admin = get("/api/v1/operational/reservations/pending", tokenForRole("ADMIN"));
        var client = get("/api/v1/operational/reservations/pending", tokenFor(customerId));

        assertThat(operational.statusCode()).isEqualTo(200);
        assertThat(admin.statusCode()).isEqualTo(200);
        assertThat(body(operational).findValuesAsText("id")).contains(reservationId.toString());
        assertThat(body(admin).findValuesAsText("id")).contains(reservationId.toString());
        assertThat(client.statusCode()).isEqualTo(403);
    }

    @Test
    void staleDecisionVersionReturnsConflictWithoutMutation() {
        setReservationsEnabled();
        UUID customerId = customer("workflow-version");
        JsonNode submitted = submit(customerId, "Versión obsoleta", UUID.randomUUID().toString());
        UUID reservationId = UUID.fromString(submitted.path("reservationId").asText());
        UUID operatorId = createUserWithRole("workflow-version-op-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");

        var response = decide(reservationId, tokenFor(operatorId), "CONFIRM", 2, "versión vieja");

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForMap("SELECT status, row_version FROM wok.reservations WHERE id = ?", reservationId))
                .containsEntry("status", "REQUESTED").containsEntry("row_version", 1);
        assertThat(count("SELECT count(*) FROM wok.reservation_status_history WHERE reservation_id = ?", reservationId))
                .isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND entity_type = 'RESERVATION'",
                reservationId)).isZero();
    }

    @Test
    void concurrentConfirmAndRejectProduceOneTransitionHistoryAndAudit() throws Exception {
        setReservationsEnabled();
        UUID customerId = customer("workflow-concurrent");
        JsonNode submitted = submit(customerId, "Decisión concurrente", UUID.randomUUID().toString());
        UUID reservationId = UUID.fromString(submitted.path("reservationId").asText());
        DecisionCall confirm = decisionCall("CONFIRM");
        DecisionCall reject = decisionCall("REJECT");
        List<DecisionCall> calls = List.of(confirm, reject);

        List<HttpResponse<String>> responses = concurrentDecisions(reservationId, calls);

        assertThat(responses).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200, 409);
        HttpResponse<String> winnerResponse = responses.get(0).statusCode() == 200 ? responses.get(0) : responses.get(1);
        JsonNode winner = body(winnerResponse);
        String status = "CONFIRM".equals(winner.path("decision").asText()) ? "CONFIRMED" : "CANCELLED";
        assertThat(winner.path("status").asText()).isEqualTo(status);
        assertThat(winner.path("rowVersion").asInt()).isEqualTo(2);
        assertThat(jdbc.queryForMap("SELECT status, row_version FROM wok.reservations WHERE id = ?", reservationId))
                .containsEntry("status", status).containsEntry("row_version", 2);
        assertThat(count("SELECT count(*) FROM wok.reservation_status_history WHERE reservation_id = ?", reservationId))
                .isEqualTo(2);
        assertThat(count("""
                SELECT count(*) FROM wok.reservation_status_history
                WHERE reservation_id = ? AND to_status IN ('CONFIRMED', 'CANCELLED')
                """, reservationId)).isEqualTo(1);
        assertThat(count("""
                SELECT count(*) FROM wok.audit_logs
                WHERE entity_type = 'RESERVATION' AND entity_id = ? AND action = 'RESERVATION_REVIEWED'
                """, reservationId)).isEqualTo(1);
    }

    private List<HttpResponse<String>> concurrentDecisions(UUID reservationId, List<DecisionCall> calls) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try (Connection connection = jdbc.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("SELECT id FROM wok.reservations WHERE id = ? FOR UPDATE")) {
                lock.setObject(1, reservationId);
                try (var rows = lock.executeQuery()) { assertThat(rows.next()).isTrue(); }
            }
            var first = executor.submit(() -> postDecision(reservationId, calls.get(0)));
            var second = executor.submit(() -> postDecision(reservationId, calls.get(1)));
            try {
                Thread.sleep(300);
            } finally {
                connection.rollback();
            }
            return List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    private HttpResponse<String> postDecision(UUID reservationId, DecisionCall call) {
        return decide(reservationId, call.token(), call.decision(), 1, call.reason(), call.requestId());
    }

    private DecisionCall decisionCall(String decision) {
        UUID actor = createUserWithRole("workflow-concurrent-op-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        return new DecisionCall(tokenFor(actor), decision, decision.equals("REJECT") ? "vencida" : "confirmar", UUID.randomUUID());
    }

    private JsonNode submit(UUID userId, String notes, String key) {
        HttpResponse<String> response = post("/api/v1/client/reservations", tokenFor(userId), payload(notes),
                Map.of("Idempotency-Key", key));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(202);
        return body(response);
    }

    private String payload(String notes) {
        return """
                {"guests":2,"requestedAt":"%s","preorder":true,"notes":"%s"}
                """.formatted(requestedAt(), notes);
    }

    private HttpResponse<String> decide(UUID reservationId, String token, String decision, int version,
                                        String reason) {
        return decide(reservationId, token, decision, version, reason, UUID.randomUUID());
    }

    private HttpResponse<String> decide(UUID reservationId, String token, String decision, int version,
                                        String reason, UUID requestId) {
        return send("PUT", "/api/v1/operational/reservations/" + reservationId + "/decision", token,
                """
                {"decision":"%s","reason":"%s","expectedVersion":%d}
                """.formatted(decision, reason, version), Map.of("X-Request-Id", requestId.toString()));
    }

    private UUID customer(String prefix) {
        UUID userId = createUserWithRole(prefix + "-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        jdbc.update("INSERT INTO wok.customer_profiles (user_id, full_name) VALUES (?, ?)", userId, prefix);
        return userId;
    }

    private void setReservationsEnabled() {
        assertThat(jdbc.update("""
                UPDATE wok.service_capabilities SET status = 'ENABLED', effective_from = now(), effective_until = NULL
                WHERE code = 'RESERVATIONS'
                """)).isEqualTo(1);
    }

    private String requestedAt() {
        return ZonedDateTime.now(RESTAURANT_ZONE).plusDays(1).with(LocalTime.of(18, 0)).toInstant().toString();
    }

    private JsonNode body(HttpResponse<String> response) {
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }

    private int count(String sql, Object... arguments) {
        return jdbc.queryForObject(sql, Integer.class, arguments);
    }

    private record DecisionCall(String token, String decision, String reason, UUID requestId) {}
}
