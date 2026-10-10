package com.wokasianfood.api.cash;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.Map;
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

        JsonNode closed = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/close", token, """
                {"countedCash":485.00,"expectedVersion":%d}
                """.formatted(current.path("rowVersion").asInt())));
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
                """);
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.cash_sessions WHERE id = ?", String.class,
                sessionId)).isEqualTo("OPEN");
        assertThat(count("SELECT count(*) FROM wok.cash_reconciliations WHERE cash_session_id = ?", sessionId))
                .isZero();

        var closed = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/close", token, """
                {"countedCash":198.00,"expectedVersion":1}
                """));
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

        JsonNode counted = body(post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations", token, """
                {"countedCash":485.00,"notes":"Arqueo intermedio"}
                """));
        assertThat(counted.path("expectedCash").decimalValue()).isEqualByComparingTo("490.00");
        assertThat(counted.path("countedCash").decimalValue()).isEqualByComparingTo("485.00");
        assertThat(counted.path("difference").decimalValue()).isEqualByComparingTo("-5.00");
        assertThat(counted.path("isFinal").asBoolean()).isFalse();

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
                {"countedCash":490.00,"expectedVersion":%d}
                """.formatted(current.path("rowVersion").asInt())));
        JsonNode closed = body(get("/api/v1/operational/cash-sessions/" + sessionId, token));
        assertThat(closed.path("reconciliations")).hasSize(2);
        assertThat(count("""
                SELECT count(*) FROM wok.audit_logs WHERE action = 'CASH_RECONCILED' AND entity_id = ?
                """, sessionId)).isEqualTo(1);

        var afterClose = post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations", token, """
                {"countedCash":490.00}
                """);
        assertThat(afterClose.statusCode()).isEqualTo(409);
        assertThat(post("/api/v1/operational/cash-sessions/" + sessionId + "/reconciliations",
                tokenForRole("CLIENT"), """
                {"countedCash":490.00}
                """).statusCode()).isEqualTo(403);
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

    @Test
    void rejectsFractionalCentsAndOverflowBeforeAnyFinancialEffect() {
        String token = tokenForRole("OPERATIONAL");
        String code = uniqueCode("F03"); openRegister(code);
        for (String invalid : java.util.List.of("1.005", "999999999999.995", "1000000000000.00")) {
            String key = UUID.randomUUID().toString();
            assertThat(post("/api/v1/operational/cash-sessions", token,
                    "{\"registerCode\":\"" + code + "\",\"openingFloat\":" + invalid + "}",
                    Map.of("Idempotency-Key", key)).statusCode()).isEqualTo(422);
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE key=?", key)).isZero();
            assertThat(count("SELECT count(*) FROM wok.cash_sessions s JOIN wok.cash_registers r ON r.id=s.cash_register_id WHERE r.code=?", code)).isZero();
        }
        UUID id = UUID.fromString(body(post("/api/v1/operational/cash-sessions", token,
                "{\"registerCode\":\""+code+"\",\"openingFloat\":1.00}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()))).path("id").asText());
        int audit = count("SELECT count(*) FROM wok.audit_logs WHERE entity_id=?", id);
        for (String invalid : java.util.List.of("1.005", "1000000000000.00")) {
            String key = UUID.randomUUID().toString();
            assertThat(post("/api/v1/operational/cash-sessions/"+id+"/movements", token,
                    "{\"type\":\"INCOME\",\"amount\":"+invalid+",\"reason\":\"F03 prueba\"}",
                    Map.of("Idempotency-Key",key)).statusCode()).isEqualTo(422);
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE key=?",key)).isZero();
            assertThat(post("/api/v1/operational/cash-sessions/"+id+"/close",token,
                    "{\"countedCash\":"+invalid+",\"expectedVersion\":1}").statusCode()).isEqualTo(422);
            assertThat(post("/api/v1/operational/cash-sessions/"+id+"/reconciliations",token,
                    "{\"countedCash\":"+invalid+"}").statusCode()).isEqualTo(422);
        }
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id=?",id)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.cash_reconciliations WHERE cash_session_id=?",id)).isZero();
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id=?",id)).isEqualTo(audit);
        JsonNode unchanged=body(get("/api/v1/operational/cash-sessions/"+id,token));
        assertThat(unchanged.path("rowVersion").asInt()).isEqualTo(1);
        assertThat(unchanged.path("status").asText()).isEqualTo("OPEN");
        assertThat(unchanged.path("expectedCash").decimalValue()).isEqualByComparingTo("1.00");
        assertThat(post("/api/v1/operational/cash-sessions/"+id+"/close",token,
                "{\"countedCash\":1.00,\"expectedVersion\":1}").statusCode()).isEqualTo(200);
    }

    @Test
    void numericBoundariesAndAuditUseThePersistedMoneyWithoutRounding() {
        String token=tokenForRole("OPERATIONAL"); String code=uniqueCode("F03MAX");openRegister(code);
        UUID id=UUID.fromString(body(post("/api/v1/operational/cash-sessions",token,
                "{\"registerCode\":\""+code+"\",\"openingFloat\":999999999999.99}",
                Map.of("Idempotency-Key",UUID.randomUUID().toString()))).path("id").asText());
        assertThat(post("/api/v1/operational/cash-sessions/"+id+"/close",token,
                "{\"countedCash\":999999999999.99,\"expectedVersion\":1}").statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT (after_data->>'countedCash')::numeric FROM wok.audit_logs WHERE entity_id=? AND action='CASH_SESSION_CLOSED'",BigDecimal.class,id))
                .isEqualByComparingTo("999999999999.99");
        String second=uniqueCode("F03M");openRegister(second);
        UUID sid=UUID.fromString(body(post("/api/v1/operational/cash-sessions",token,
                "{\"registerCode\":\""+second+"\",\"openingFloat\":0.00}",
                Map.of("Idempotency-Key",UUID.randomUUID().toString()))).path("id").asText());
        JsonNode movement=body(post("/api/v1/operational/cash-sessions/"+sid+"/movements",token,
                "{\"type\":\"INCOME\",\"amount\":999999999999.99,\"reason\":\"F03 max\"}",
                Map.of("Idempotency-Key",UUID.randomUUID().toString())));
        assertThat(movement.path("amountDelta").decimalValue()).isEqualByComparingTo("999999999999.99");
        assertThat(jdbc.queryForObject("SELECT (after_data->>'amountDelta')::numeric FROM wok.audit_logs WHERE entity_id=? AND action='CASH_MOVEMENT_RECORDED'",BigDecimal.class,UUID.fromString(movement.path("id").asText())))
                .isEqualByComparingTo(movement.path("amountDelta").decimalValue());
        assertThat(post("/api/v1/operational/cash-sessions/"+sid+"/close",token,
                "{\"countedCash\":999999999999.99,\"expectedVersion\":2}").statusCode()).isEqualTo(200);
    }

    @Test
    void invalidMoneyCannotReachJdbcOrClaimEvenWhenTheServiceIsCalledDirectly() {
        var mockedJdbc=org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var claims=org.mockito.Mockito.mock(com.wokasianfood.api.platform.IdempotencyStore.class);
        var service=new CashSessionService(mockedJdbc,claims);
        UUID actor=UUID.randomUUID(),request=UUID.randomUUID(),key=UUID.randomUUID(),session=UUID.randomUUID();
        for(String invalid:java.util.List.of("1.005","1000000000000.00","-0.01")) {
            BigDecimal amount=new BigDecimal(invalid);
            org.assertj.core.api.Assertions.assertThatThrownBy(()->service.open(actor,request,key,new CashSessionController.OpenRequest("MAIN",amount)))
                    .isInstanceOf(com.wokasianfood.api.identity.AuthException.class);
            org.assertj.core.api.Assertions.assertThatThrownBy(()->service.addMovement(session,actor,request,key,new CashSessionController.MovementRequest(CashSessionController.MovementType.INCOME,amount,"F03 prueba")))
                    .isInstanceOf(com.wokasianfood.api.identity.AuthException.class);
            org.assertj.core.api.Assertions.assertThatThrownBy(()->service.close(session,actor,request,new CashSessionController.CloseRequest(amount,1)))
                    .isInstanceOf(com.wokasianfood.api.identity.AuthException.class);
            org.assertj.core.api.Assertions.assertThatThrownBy(()->service.reconcile(session,actor,request,new CashSessionController.ReconciliationRequest(amount,null)))
                    .isInstanceOf(com.wokasianfood.api.identity.AuthException.class);
        }
        org.mockito.Mockito.verifyNoInteractions(mockedJdbc,claims);
    }

    @Test
    void validCentValuesPreserveSignsAndAuditMatchesPersistedOpeningMovementAndCount() {
        String token=tokenForRole("OPERATIONAL"),code=uniqueCode("F03AUD");openRegister(code);
        String payload="{\"registerCode\":\""+code+"\",\"openingFloat\":1.000}";
        Map<String,String> key=Map.of("Idempotency-Key",UUID.randomUUID().toString());
        UUID id=UUID.fromString(body(post("/api/v1/operational/cash-sessions",token,payload,key)).path("id").asText());
        assertThat(body(post("/api/v1/operational/cash-sessions",token,payload,key)).path("id").asText()).isEqualTo(id.toString());
        assertThat(jdbc.queryForObject("SELECT (a.after_data->>'openingFloat')::numeric-m.amount_delta FROM wok.audit_logs a JOIN wok.cash_movements m ON m.cash_session_id=a.entity_id AND m.movement_type='OPENING' WHERE a.action='CASH_SESSION_OPENED' AND a.entity_id=?",BigDecimal.class,id)).isZero();
        for(String type:java.util.List.of("INCOME","EXPENSE","WITHDRAWAL")) {
            JsonNode movement=body(post("/api/v1/operational/cash-sessions/"+id+"/movements",token,
                    "{\"type\":\""+type+"\",\"amount\":0.010,\"reason\":\"F03 audit\"}",
                    Map.of("Idempotency-Key",UUID.randomUUID().toString())));
            assertThat(movement.path("amountDelta").decimalValue()).isEqualByComparingTo(type.equals("INCOME")?"0.01":"-0.01");
            assertThat(jdbc.queryForObject("SELECT (a.after_data->>'amountDelta')::numeric-m.amount_delta FROM wok.audit_logs a JOIN wok.cash_movements m ON m.id=a.entity_id WHERE a.action='CASH_MOVEMENT_RECORDED' AND a.entity_id=?",BigDecimal.class,UUID.fromString(movement.path("id").asText()))).isZero();
        }
        assertThat(post("/api/v1/operational/cash-sessions/"+id+"/movements",token,
                "{\"type\":\"INCOME\",\"amount\":0,\"reason\":\"F03 minimum\"}",Map.of("Idempotency-Key",UUID.randomUUID().toString())).statusCode()).isEqualTo(400);
        assertThat(post("/api/v1/operational/cash-sessions/"+id+"/close",token,
                "{\"countedCash\":0.990,\"expectedVersion\":4}").statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT (a.after_data->>'countedCash')::numeric-r.counted_cash FROM wok.audit_logs a JOIN wok.cash_reconciliations r ON r.cash_session_id=a.entity_id AND r.is_final WHERE a.action='CASH_SESSION_CLOSED' AND a.entity_id=?",BigDecimal.class,id)).isZero();
    }

}
