package com.wokasianfood.api.cash;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CashSessionIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void opensRecordsMovementsAndClosesWithReconciliation() {
        String token = tokenForRole("OPERATIONAL");
        String code = uniqueCode("CAJA");
        openRegister(code);

        JsonNode opened = body(post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":500.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID sessionId = UUID.fromString(opened.path("id").asText());
        assertThat(opened.path("status").asText()).isEqualTo("OPEN");
        assertThat(opened.path("registerCode").asText()).isEqualTo(code);
        assertThat(opened.path("expectedCash").decimalValue()).isEqualByComparingTo("500.00");
        assertThat(opened.path("countedCash").isMissingNode()).isTrue();
        assertThat(opened.path("movements")).hasSize(1);
        assertThat(opened.path("movements").get(0).path("type").asText()).isEqualTo("OPENING");
        assertThat(opened.path("movements").get(0).path("amountDelta").decimalValue())
                .isEqualByComparingTo("500.00");

        JsonNode income = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/movements", token, """
                {"type":"INCOME","amount":20.00,"reason":"Venta de mostrador"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(income.path("type").asText()).isEqualTo("INCOME");
        assertThat(income.path("amountDelta").decimalValue()).isEqualByComparingTo("20.00");

        JsonNode expense = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/movements", token, """
                {"type":"EXPENSE","amount":30.00,"reason":"Compra de insumos"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(expense.path("amountDelta").decimalValue()).isEqualByComparingTo("-30.00");

        JsonNode current = body(get("/api/v1/operational/cash-sessions/current?registerCode=" + code, token));
        assertThat(current.path("id").asText()).isEqualTo(sessionId.toString());
        assertThat(current.path("expectedCash").decimalValue()).isEqualByComparingTo("490.00");
        assertThat(current.path("movements")).hasSize(3);

        String closeKey = UUID.randomUUID().toString();
        String closePayload = """
                {"countedCash":485.00,"expectedVersion":1}
                """;
        JsonNode closed = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/close", token,
                closePayload, Map.of("Idempotency-Key", closeKey)));
        assertThat(closed.path("status").asText()).isEqualTo("CLOSED");
        assertThat(closed.path("expectedCash").decimalValue()).isEqualByComparingTo("490.00");
        assertThat(closed.path("countedCash").decimalValue()).isEqualByComparingTo("485.00");
        assertThat(closed.path("difference").decimalValue()).isEqualByComparingTo("-5.00");
        assertThat(closed.path("closedBy").isMissingNode()).isFalse();

        assertThat(jdbc.queryForObject("SELECT status FROM wok.cash_sessions WHERE id = ?", String.class,
                sessionId)).isEqualTo("CLOSED");
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.cash_reconciliations WHERE cash_session_id = ? AND is_final
                """, Integer.class, sessionId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT difference FROM wok.cash_reconciliations WHERE cash_session_id = ? AND is_final
                """, BigDecimal.class, sessionId)).isEqualByComparingTo("-5.00");
        assertThat(count("""
                SELECT count(*) FROM wok.audit_logs WHERE action = 'CASH_SESSION_CLOSED' AND entity_id = ?
                """, sessionId)).isEqualTo(1);

        JsonNode replay = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/close", token,
                closePayload, Map.of("Idempotency-Key", closeKey)));
        assertThat(replay.path("id").asText()).isEqualTo(sessionId.toString());
        assertThat(replay.path("difference").decimalValue()).isEqualByComparingTo("-5.00");
        assertThat(count("SELECT count(*) FROM wok.cash_reconciliations WHERE cash_session_id = ? AND is_final",
                sessionId)).isEqualTo(1);

        var conflictingClose = post("/api/v1/operational/cash-sessions/" + sessionId + "/close", token,
                closePayload.replace("485.00", "480.00"), Map.of("Idempotency-Key", closeKey));
        assertThat(conflictingClose.statusCode()).isEqualTo(409);
    }

    @Test
    void replaysIdempotentOpenAndMovementAndRejectsDifferentPayload() {
        String token = tokenForRole("OPERATIONAL");
        String code = uniqueCode("CAJA");
        openRegister(code);
        String openKey = UUID.randomUUID().toString();
        String openPayload = """
                {"registerCode":"%s","openingFloat":300.00}
                """.formatted(code);

        JsonNode first = body(post("/api/v1/operational/cash-sessions", token, openPayload,
                Map.of("Idempotency-Key", openKey)));
        UUID sessionId = UUID.fromString(first.path("id").asText());

        JsonNode replay = body(post("/api/v1/operational/cash-sessions", token, openPayload,
                Map.of("Idempotency-Key", openKey)));
        assertThat(replay.path("id").asText()).isEqualTo(sessionId.toString());
        assertThat(count("SELECT count(*) FROM wok.cash_sessions WHERE id = ?", sessionId)).isEqualTo(1);

        var conflictingOpen = post("/api/v1/operational/cash-sessions", token,
                openPayload.replace("300.00", "400.00"), Map.of("Idempotency-Key", openKey));
        assertThat(conflictingOpen.statusCode()).isEqualTo(409);

        String movementKey = UUID.randomUUID().toString();
        String movementPayload = """
                {"type":"WITHDRAWAL","amount":25.00,"reason":"Retiro parcial"}
                """;
        JsonNode movement = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/movements", token,
                movementPayload, Map.of("Idempotency-Key", movementKey)));
        UUID movementId = UUID.fromString(movement.path("id").asText());

        JsonNode movementReplay = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/movements",
                token, movementPayload, Map.of("Idempotency-Key", movementKey)));
        assertThat(movementReplay.path("id").asText()).isEqualTo(movementId.toString());
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id = ?", sessionId))
                .isEqualTo(2);

        var conflictingMovement = post("/api/v1/operational/cash-sessions/" + sessionId + "/movements", token,
                movementPayload.replace("25.00", "50.00"), Map.of("Idempotency-Key", movementKey));
        assertThat(conflictingMovement.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id = ?", sessionId))
                .isEqualTo(2);
    }

    @Test
    void rejectsCashValuesPostgresWouldRoundOrCannotStore() {
        String token = tokenForRole("OPERATIONAL");
        String code = uniqueCode("CAJA-MONTO");
        openRegister(code);

        var roundedOpening = post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":1.005}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        var oversizedOpening = post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":1000000000000.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(roundedOpening.statusCode()).isEqualTo(422);
        assertThat(oversizedOpening.statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.cash_sessions s JOIN wok.cash_registers r "
                + "ON r.id = s.cash_register_id WHERE r.code = ?", code)).isZero();

        JsonNode opened = body(post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":10.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID sessionId = UUID.fromString(opened.path("id").asText());
        var roundedMovement = post("/api/v1/operational/cash-sessions/" + sessionId + "/movements", token, """
                {"type":"INCOME","amount":1.005,"reason":"Prueba de precisión"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        var oversizedMovement = post("/api/v1/operational/cash-sessions/" + sessionId + "/movements", token, """
                {"type":"INCOME","amount":1000000000000.00,"reason":"Prueba de límite"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(roundedMovement.statusCode()).isEqualTo(422);
        assertThat(oversizedMovement.statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id = ?", sessionId)).isEqualTo(1);

        var roundedReconciliation = post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations",
                token, """
                {"countedCash":1.005}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        var oversizedReconciliation = post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations",
                token, """
                {"countedCash":1000000000000.00}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        var roundedClose = post("/api/v1/operational/cash-sessions/" + sessionId + "/close", token, """
                {"countedCash":1.005,"expectedVersion":1}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(roundedReconciliation.statusCode()).isEqualTo(422);
        assertThat(oversizedReconciliation.statusCode()).isEqualTo(422);
        assertThat(roundedClose.statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.cash_sessions WHERE id = ?", String.class, sessionId))
                .isEqualTo("OPEN");
        assertThat(count("SELECT count(*) FROM wok.cash_reconciliations WHERE cash_session_id = ?", sessionId)).isZero();
    }

    @Test
    void rejectsSecondOpenUnknownRegisterAndUnauthorizedRole() {
        String token = tokenForRole("OPERATIONAL");
        String code = uniqueCode("CAJA");
        openRegister(code);

        body(post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":100.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        var secondOpen = post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":50.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(secondOpen.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.cash_sessions s JOIN wok.cash_registers r "
                + "ON r.id = s.cash_register_id WHERE r.code = ? AND s.status = 'OPEN'", code)).isEqualTo(1);

        var unknown = post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":10.00}
                """.formatted(uniqueCode("NOEXISTE")), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(unknown.statusCode()).isEqualTo(404);

        assertThat(get("/api/v1/operational/cash-sessions/current?registerCode=" + code,
                tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
    }

    @Test
    void keepsSessionOpenWhenCloseVersionIsStale() {
        String token = tokenForRole("OPERATIONAL");
        String code = uniqueCode("CAJA");
        openRegister(code);
        UUID sessionId = UUID.fromString(body(post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":200.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())))
                .path("id").asText());

        var stale = post("/api/v1/operational/cash-sessions/" + sessionId + "/close", token, """
                {"countedCash":200.00,"expectedVersion":9}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.cash_sessions WHERE id = ?", String.class,
                sessionId)).isEqualTo("OPEN");
        assertThat(count("SELECT count(*) FROM wok.cash_reconciliations WHERE cash_session_id = ?", sessionId))
                .isZero();

        var closed = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/close", token, """
                {"countedCash":198.00,"expectedVersion":1}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(closed.path("status").asText()).isEqualTo("CLOSED");
        assertThat(closed.path("difference").decimalValue()).isEqualByComparingTo("-2.00");
    }

    @Test
    void recordsIntermediateReconciliationAndExposesBreakdown() {
        String token = tokenForRole("OPERATIONAL");
        String code = uniqueCode("CAJA");
        openRegister(code);
        UUID sessionId = UUID.fromString(body(post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":500.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())))
                .path("id").asText());
        body(post("/api/v1/operational/cash-sessions/" + sessionId + "/movements", token, """
                {"type":"INCOME","amount":20.00,"reason":"Venta de mostrador"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        body(post("/api/v1/operational/cash-sessions/" + sessionId + "/movements", token, """
                {"type":"EXPENSE","amount":30.00,"reason":"Compra de insumos"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        String reconciliationPayload = """
                {"countedCash":485.00,"notes":"Arqueo intermedio"}
                """;
        String reconciliationKey = UUID.randomUUID().toString();
        JsonNode counted = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations", token,
                reconciliationPayload, Map.of("Idempotency-Key", reconciliationKey)));
        UUID reconciliationId = UUID.fromString(counted.path("id").asText());
        assertThat(counted.path("expectedCash").decimalValue()).isEqualByComparingTo("490.00");
        assertThat(counted.path("countedCash").decimalValue()).isEqualByComparingTo("485.00");
        assertThat(counted.path("difference").decimalValue()).isEqualByComparingTo("-5.00");
        assertThat(counted.path("isFinal").asBoolean()).isFalse();

        JsonNode replay = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations", token,
                reconciliationPayload, Map.of("Idempotency-Key", reconciliationKey)));
        assertThat(replay.path("id").asText()).isEqualTo(reconciliationId.toString());
        var reusedWithDifferentPayload = post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations",
                token, reconciliationPayload.replace("485.00", "480.00"), Map.of("Idempotency-Key", reconciliationKey));
        assertThat(reusedWithDifferentPayload.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.cash_reconciliations WHERE cash_session_id = ? AND NOT is_final",
                sessionId)).isEqualTo(1);

        JsonNode current = body(get("/api/v1/operational/cash-sessions/" + sessionId, token));
        JsonNode breakdown = current.path("breakdown");
        assertThat(breakdown.path("opening").decimalValue()).isEqualByComparingTo("500.00");
        assertThat(breakdown.path("sales").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(breakdown.path("tips").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(breakdown.path("otherIncome").decimalValue()).isEqualByComparingTo("20.00");
        assertThat(breakdown.path("expenses").decimalValue()).isEqualByComparingTo("30.00");
        assertThat(breakdown.path("withdrawals").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(breakdown.path("expectedCash").decimalValue()).isEqualByComparingTo("490.00");
        assertThat(current.path("reconciliations")).hasSize(1);

        body(post("/api/v1/operational/cash-sessions/" + sessionId + "/close", token, """
                {"countedCash":490.00,"expectedVersion":1}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        JsonNode closed = body(get("/api/v1/operational/cash-sessions/" + sessionId, token));
        assertThat(closed.path("reconciliations")).hasSize(2);
        assertThat(count("""
                SELECT count(*) FROM wok.audit_logs WHERE action = 'CASH_RECONCILED' AND entity_id = ?
                """, sessionId)).isEqualTo(1);

        JsonNode closedReplay = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations", token,
                reconciliationPayload, Map.of("Idempotency-Key", reconciliationKey)));
        assertThat(closedReplay.path("id").asText()).isEqualTo(reconciliationId.toString());

        var afterClose = post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations", token, """
                {"countedCash":490.00}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(afterClose.statusCode()).isEqualTo(409);
        assertThat(post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations",
                tokenForRole("CLIENT"), """
                {"countedCash":490.00}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())).statusCode()).isEqualTo(403);
    }

    @Test
    void concurrentReplayOfTheSameIntermediateReconciliationCreatesOneRecord() throws Exception {
        String token = tokenForRole("OPERATIONAL");
        String code = uniqueCode("CAJA-RACE");
        openRegister(code);
        UUID sessionId = UUID.fromString(body(post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":125.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())))
                .path("id").asText());
        String path = "/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations";
        String payload = """
                {"countedCash":125.00,"notes":"Arqueo al cambio de turno"}
                """;
        String key = UUID.randomUUID().toString();
        Map<String, String> headers = Map.of("Idempotency-Key", key);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent test start timed out");
                return post(path, token, payload, headers);
            });
            var second = executor.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent test start timed out");
                return post(path, token, payload, headers);
            });

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            HttpResponse<String> firstResponse = first.get(15, TimeUnit.SECONDS);
            HttpResponse<String> secondResponse = second.get(15, TimeUnit.SECONDS);
            JsonNode firstReceipt = body(firstResponse);
            JsonNode secondReceipt = body(secondResponse);

            assertThat(List.of(firstResponse.statusCode(), secondResponse.statusCode()))
                    .containsExactlyInAnyOrder(201, 201);
            assertThat(firstReceipt.path("id").asText()).isEqualTo(secondReceipt.path("id").asText());
            assertThat(count("SELECT count(*) FROM wok.cash_reconciliations WHERE cash_session_id = ? AND NOT is_final",
                    sessionId)).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE action = 'CASH_RECONCILED' AND entity_id = ?",
                    sessionId)).isEqualTo(1);
        }
    }

    private void openRegister(String code) {
        jdbc.update("""
                INSERT INTO wok.cash_registers (code, name, currency_id)
                SELECT ?, ?, id FROM wok.currencies WHERE code = 'GTQ'
                """, code, "Caja de prueba " + code);
    }

    private String uniqueCode(String prefix) {
        return (prefix + "_" + UUID.randomUUID().toString().substring(0, 8)).toUpperCase();
    }

    private int count(String sql, Object... arguments) {
        return jdbc.queryForObject(sql, Integer.class, arguments);
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try {
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }
}
