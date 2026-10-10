package com.wokasianfood.api.payments;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PaymentAttemptIntegrationTest extends PaymentAttemptTestSupport {
    @Autowired PaymentAttemptService attempts;

    @Test void prepareAndReplacementCompareEveryNormalizedFieldNotDelimitedHashes() throws Exception {
        for (boolean replacement : List.of(false, true)) {
            Fixture f = fixture("100");
            JsonNode rejected = null;
            if (replacement) {
                rejected = prepare(f, "80", null);
                jdbc.update("UPDATE wok.orders SET total=70,subtotal=70 WHERE account_id=?", f.account());
                assertThat(capture(f, rejected).path("status").asText()).isEqualTo("REJECTED");
            }
            UUID previous = rejected == null ? null : id(rejected);
            String route = replacement ? path(f, rejected)+"/replacement" : base(f);
            Map<String,Object> content = new LinkedHashMap<>(Map.of("method","TRANSFER","amount",25,
                    "tipAmount",2,"currency","GTQ","reference","A\nB","registerCode","C"));
            if (previous != null) content.put("expectedPreviousAttemptId", previous.toString());
            String request = contentRequest(content, replacement);
            JsonNode first = body(post(route, f.token(), request));
            String before = protocolSnapshot(f);
            assertThat(body(post(route, f.token(), request)).path("attemptId")).isEqualTo(first.path("attemptId"));
            for (Map<String,Object> differences : List.<Map<String,Object>>of(
                    Map.of("reference","A","registerCode","B\nC"), Map.of("amount",26),
                    Map.of("tipAmount",3), Map.of("method","CARD_EXTERNAL"), Map.of("currency","USD"),
                    Map.of("reference","different"), Map.of("registerCode","different"))) {
                Map<String,Object> changed = new LinkedHashMap<>(content); changed.putAll(differences);
                assertThat(post(route, f.token(), contentRequest(changed,replacement)).statusCode()).isEqualTo(409);
                assertThat(protocolSnapshot(f)).isEqualTo(before);
            }
            Map<String,Object> equivalent = new LinkedHashMap<>(content);
            equivalent.put("amount",new BigDecimal("25.00")); equivalent.put("tipAmount",new BigDecimal("2.00"));
            equivalent.put("reference","  A\nB  "); equivalent.put("registerCode"," c ");
            assertThat(body(post(route,f.token(),contentRequest(equivalent,replacement))).path("attemptId")).isEqualTo(first.path("attemptId"));
            assertThat(protocolSnapshot(f)).isEqualTo(before);
            assertThat(financialCount(f)).isZero();
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=?",f.actor().toString())).isZero();
            assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE account_id=? AND status='PREPARED'",f.account())).isEqualTo(1);
        }
        Fixture f=fixture("100");
        JsonNode first=body(post(base(f),f.token(),"{\"method\":\"TRANSFER\",\"amount\":25,\"currency\":\"GTQ\",\"reference\":\"  \"}"));
        String before=protocolSnapshot(f);
        assertThat(body(post(base(f),f.token(),"{\"method\":\"TRANSFER\",\"amount\":25.00,\"tipAmount\":0.00,\"currency\":\"GTQ\",\"reference\":null,\"registerCode\":\" main \"}")).path("attemptId")).isEqualTo(first.path("attemptId"));
        assertThat(protocolSnapshot(f)).isEqualTo(before);
    }

    private String contentRequest(Map<String,Object> content, boolean replacement) throws Exception {
        return json.writeValueAsString(replacement
                ? Map.of("expectedVersion",3,"reason","Contenido revisado","payment",content) : content);
    }

    @Test void paymentIdUniqueUpdateUpgradeKeepsPendingFenceAndSerializesSuccessorAndReplay() throws Exception {
        Fixture f=fixture("100"); JsonNode row=prepare(f,"40",null); UUID attempt=id(row);
        UUID key=jdbc.queryForObject("SELECT capture_key FROM wok.payment_attempts WHERE id=?",UUID.class,attempt);
        long guard=84041001L; var pool=Executors.newFixedThreadPool(5);
        jdbc.execute("CREATE FUNCTION wok.f04_confirm_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='"+attempt+"'::uuid AND NEW.status='CONFIRMED' THEN PERFORM pg_advisory_xact_lock("+guard+"); END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER f04_confirm_gate BEFORE UPDATE ON wok.payment_attempts FOR EACH ROW EXECUTE FUNCTION wok.f04_confirm_gate()");
        try(Connection gate=databaseConnection()) {
            gate.createStatement().execute("SELECT pg_advisory_lock("+guard+")");
            Future<HttpResponse<String>> captured=pool.submit(()->post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":1}"));
            int capturePid=awaitWaiter("SELECT pid FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%UPDATE wok.payment_attempts%'",null);
            assertThat(body(get(path(f,row),f.token())).path("status").asText()).isEqualTo("PENDING");
            assertThat(financialCount(f)).isZero();
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=?",f.actor().toString())).isZero();
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id=? AND action IN ('PAYMENT_CAPTURED','PAYMENT_ATTEMPT_CONFIRMED')",f.actor())).isZero();
            Future<Boolean> keyShare=pool.submit(()->{
                try(Connection probe=databaseConnection();var q=probe.prepareStatement("SELECT id FROM wok.payment_attempts WHERE id=? FOR KEY SHARE")) {
                    q.setObject(1,attempt); return q.executeQuery().next();
                }
            });
            awaitWaiter("SELECT pid FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%FOR KEY SHARE%'",capturePid);
            Future<HttpResponse<String>> prepared=pool.submit(()->post(base(f),f.token(),payload("20",attempt)));
            awaitWaiter("SELECT pid FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%SELECT id FROM wok.order_accounts%'",capturePid);
            Future<HttpResponse<String>> replay=pool.submit(()->post("/api/v1/operational/accounts/"+f.account()+"/payments",f.token(),"{\"method\":\"TRANSFER\",\"amount\":40}",Map.of("Idempotency-Key",key.toString())));
            Future<HttpResponse<String>> recovery=pool.submit(()->post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":2}"));
            gate.createStatement().execute("SELECT pg_advisory_unlock("+guard+")");
            JsonNode confirmed=body(captured.get(15,TimeUnit.SECONDS));
            assertThat(keyShare.get(15,TimeUnit.SECONDS)).isTrue();
            assertThat(prepared.get(15,TimeUnit.SECONDS).statusCode()).isEqualTo(200);
            HttpResponse<String> replayed=replay.get(15,TimeUnit.SECONDS);
            assertThat(replayed.statusCode()).as(replayed.body()).isEqualTo(201);
            assertThat(body(replayed).path("paymentId")).isEqualTo(confirmed.path("confirmation").path("paymentId"));
            assertThat(body(recovery.get(15,TimeUnit.SECONDS)).path("confirmation").path("paymentId")).isEqualTo(confirmed.path("confirmation").path("paymentId"));
            assertThat(financialCount(f)).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=? AND status='COMPLETED'",f.actor().toString())).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE previous_attempt_id=?",attempt)).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id=? AND action='PAYMENT_CAPTURED'",f.actor())).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id=? AND action='PAYMENT_ATTEMPT_CONFIRMED'",attempt)).isEqualTo(1);
            System.out.println("R01 UPDATE payment_id: KEY SHARE blocked by capture="+capturePid+"; visible PENDING until commit; one payment/claim/audit, one successor");
        } finally {
            pool.shutdownNow(); jdbc.execute("DROP TRIGGER f04_confirm_gate ON wok.payment_attempts");jdbc.execute("DROP FUNCTION wok.f04_confirm_gate()");
        }
    }

    @Test void preparationRecoveryAndRetirementAreServerOwnedAndReadOnly() throws Exception {
        Fixture f = fixture("100");
        JsonNode first = prepare(f, "40", null);
        JsonNode recovered = prepare(f, "40", null);
        assertThat(recovered.path("attemptId")).isEqualTo(first.path("attemptId"));
        assertThat(financialCount(f)).isZero();
        int audits = count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ?", id(first));
        assertThat(body(get(path(f, first), tokenFor(f.actor()))).path("status").asText()).isEqualTo("PREPARED");
        assertThat(body(get("/api/v1/operational/payment-attempts", f.token())).path("items").toString()).contains(id(first).toString());
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ?", id(first))).isEqualTo(audits);
        String other = tokenForRole("OPERATIONAL");
        assertThat(get(path(f, first), other).statusCode()).isEqualTo(404);
        assertThat(body(get(base(f), other)).path("blockedByAnotherOperator").asBoolean()).isTrue();
        assertThat(post(base(f), other, payload("40", null)).statusCode()).isEqualTo(409);
        assertThat(post(base(f), tokenForRole("CLIENT"), payload("40", null)).statusCode()).isEqualTo(403);
        assertThat(post(path(f, first)+"/retire", f.token(), "{\"expectedVersion\":2,\"reason\":\"Cambio\"}").statusCode()).isEqualTo(409);
        JsonNode retired = body(post(path(f, first)+"/retire", f.token(), "{\"expectedVersion\":1,\"reason\":\"No se recibió dinero\"}"));
        assertThat(retired.path("status").asText()).isEqualTo("RETIRED");
        assertThat(post(path(f, first)+"/capture", f.token(), "{\"expectedVersion\":1}").statusCode()).isEqualTo(409);
        assertThat(financialCount(f)).isZero();
        assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope = ?", f.actor().toString())).isZero();
        assertThat(prepare(f, "20", id(first)).path("attemptId")).isNotEqualTo(first.path("attemptId"));
    }

    @Test void frozenAmountRejectsReducedDebtAndReplacementNeverRevivesOriginal() {
        Fixture f = fixture("100"); JsonNode original = prepare(f, "100", null);
        jdbc.update("UPDATE wok.orders SET total = 70, subtotal = 70 WHERE account_id = ?", f.account());
        JsonNode rejection = capture(f, original);
        assertThat(rejection.path("status").asText()).isEqualTo("REJECTED");
        assertThat(rejection.path("amount").decimalValue()).isEqualByComparingTo("100");
        assertThat(financialCount(f)).isZero();
        jdbc.update("UPDATE wok.orders SET total = 120, subtotal = 120 WHERE account_id = ?", f.account());
        assertThat(capture(f, original).path("status").asText()).isEqualTo("REJECTED");
        String replacement = "{\"expectedVersion\":3,\"reason\":\"Importe revisado\",\"payment\":"+payload("100", id(original))+"}";
        JsonNode next = body(post(path(f, original)+"/replacement", f.token(), replacement));
        assertThat(next.path("previousAttemptId").asText()).isEqualTo(id(original).toString());
        assertThat(body(post(path(f, original)+"/replacement", f.token(), replacement)).path("attemptId")).isEqualTo(next.path("attemptId"));
        JsonNode confirmed = capture(f, next);
        assertThat(confirmed.path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(confirmed.path("balance").decimalValue()).isEqualByComparingTo("20");
        assertThat(financialCount(f)).isEqualTo(1);
        assertThat(post(path(f, next)+"/replacement", f.token(), replacement).statusCode()).isEqualTo(422);
    }

    @Test void retirementVersusCaptureAndConcurrentPreparationHaveOneWinner() throws Exception {
        for (int i=0; i<5; i++) {
            Fixture f = fixture("100"); JsonNode row = prepare(f, "40", null);
            List<HttpResponse<String>> results = race(
                    () -> post(path(f,row)+"/capture", f.token(), "{\"expectedVersion\":1}"),
                    () -> post(path(f,row)+"/retire", f.token(), "{\"expectedVersion\":1,\"reason\":\"Nunca capturado\"}"));
            assertThat(results).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200,409);
            JsonNode actual = body(get(path(f,row),f.token()));
            assertThat(actual.path("status").asText()).isIn("RETIRED","CONFIRMED");
            assertThat(financialCount(f)).isEqualTo("CONFIRMED".equals(actual.path("status").asText())?1:0);
        }
        Fixture f=fixture("100");
        List<HttpResponse<String>> prepared=race(() -> post(base(f),f.token(),payload("40",null)),
                () -> post(base(f),f.token(),payload("40",null)));
        assertThat(body(prepared.get(0)).path("attemptId")).isEqualTo(body(prepared.get(1)).path("attemptId"));
        assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE account_id = ?",f.account())).isEqualTo(1);
    }

    @Test void pendingBoundaryBlocksEveryAlternativeAndRecoveryCapturesOnce() throws Exception {
        Fixture f=fixture("100"); JsonNode row=prepare(f,"40",null);
        attempts.requestExecution(f.actor(),f.account(),id(row),1L); // process loss before financial transaction
        assertThat(body(get(path(f,row),f.token())).path("status").asText()).isEqualTo("PENDING");
        assertThat(financialCount(f)).isZero();
        assertThat(post(path(f,row)+"/retire",f.token(),"{\"expectedVersion\":2,\"reason\":\"Timeout\"}").statusCode()).isEqualTo(409);
        assertThat(post(base(f),f.token(),payload("20",null)).statusCode()).isEqualTo(409);
        assertThat(post("/api/v1/operational/accounts/"+f.account()+"/payments",f.token(),"{\"method\":\"TRANSFER\",\"amount\":20}",Map.of("Idempotency-Key",UUID.randomUUID().toString())).statusCode()).isEqualTo(409);
        List<HttpResponse<String>> outcomes=race(() -> post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":2}"),
                () -> post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":2}"));
        assertThat(outcomes).extracting(HttpResponse::statusCode).containsExactly(200,200);
        assertThat(body(outcomes.get(0)).path("confirmation").path("paymentId")).isEqualTo(body(outcomes.get(1)).path("confirmation").path("paymentId"));
        assertThat(financialCount(f)).isEqualTo(1);
    }

    @Test void failureAfterPaymentWriteRollsBackFinanceButPreservesPendingFence() {
        Fixture f=fixture("100"); JsonNode row=prepare(f,"40",null);
        // Fault is scoped to this fixture, created ONLY in the new Testcontainers database.
        jdbc.execute("CREATE FUNCTION wok.f04_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'PAYMENT_CAPTURED' AND NEW.actor_user_id = '"+f.actor()+"'::uuid THEN RAISE EXCEPTION 'F04 isolated injected failure'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER f04_test_fail BEFORE INSERT ON wok.audit_logs FOR EACH ROW EXECUTE FUNCTION wok.f04_test_fail()");
        try {
            assertThat(post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":1}").statusCode()).isEqualTo(500);
            assertThat(financialCount(f)).isZero();
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope = ?",f.actor().toString())).isZero();
            assertThat(body(get(path(f,row),f.token())).path("status").asText()).isEqualTo("PENDING");
            assertThat(jdbc.queryForObject("SELECT status FROM wok.order_accounts WHERE id = ?",String.class,f.account())).isEqualTo("OPEN");
        } finally { jdbc.execute("DROP TRIGGER f04_test_fail ON wok.audit_logs"); jdbc.execute("DROP FUNCTION wok.f04_test_fail()"); }
        assertThat(capture(f,row).path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(financialCount(f)).isEqualTo(1);
    }

    @Test void precisionRangeAndImmutableContentRejectBeforeAnyClaimOrMetadata() {
        Fixture f=fixture("100");
        for(String invalid:List.of("1.005","1000000000000.00","0","-1"))
            assertThat(post(base(f),f.token(),payload(invalid,null)).statusCode()).isIn(400,422);
        assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE account_id = ?",f.account())).isZero();
        assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope = ?",f.actor().toString())).isZero();
        JsonNode row=prepare(f,"1.00",null);
        assertThatThrownBy(() -> jdbc.update("UPDATE wok.payment_attempts SET amount = 2, row_version = row_version + 1 WHERE id = ?",id(row))).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(capture(f,row).path("confirmation").path("amount").decimalValue()).isEqualByComparingTo("1.00");
    }

    @Test void confirmedAnomalyDoesNotDisappearOrAuthorizeReplacement() {
        Fixture f=fixture("100"); JsonNode row=prepare(f,"40",null); JsonNode payment=capture(f,row);
        jdbc.update("INSERT INTO wok.orders(id,code,account_id,channel,status,subtotal,discount,total,currency_id,guest_count,opened_by,closed_at) SELECT ?,? ,?,'PICKUP','CLOSED',1,0,1,id,1,?,now() FROM wok.currencies WHERE code = 'USD'",
                UUID.randomUUID(),"F04-"+UUID.randomUUID(),f.account(),f.actor());
        int audits=count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id = ?",f.actor());
        JsonNode read=body(get(path(f,row),f.token()));
        assertThat(read.path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(read.path("receiptAvailability").asText()).isEqualTo("RECONCILIATION_REQUIRED");
        assertThat(read.path("confirmation").path("paymentId")).isEqualTo(payment.path("confirmation").path("paymentId"));
        assertThat(capture(f,row).path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id = ?",f.actor())).isEqualTo(audits);
        assertThat(financialCount(f)).isEqualTo(1);
    }

    @Test void maximumAmountIsExactAndCashFailureRollsBackMovementsVersionAndPaidState() {
        Fixture boundary=fixture("999999999999.99"); JsonNode max=prepare(boundary,"999999999999.99",null);
        assertThat(capture(boundary,max).path("confirmation").path("amount").decimalValue()).isEqualByComparingTo("999999999999.99");
        Fixture f=fixture("30"); String code="F04_"+UUID.randomUUID().toString().substring(0,8).toUpperCase();
        jdbc.update("INSERT INTO wok.cash_registers(code,name,currency_id) SELECT ?,'F04 isolated cash',id FROM wok.currencies WHERE code='GTQ'",code);
        UUID cash=UUID.fromString(body(post("/api/v1/operational/cash-sessions",f.token(),"{\"registerCode\":\""+code+"\",\"openingFloat\":10}",Map.of("Idempotency-Key",UUID.randomUUID().toString()))).path("id").asText());
        JsonNode row=body(post(base(f),f.token(),"{\"method\":\"CASH\",\"amount\":30,\"tipAmount\":2,\"currency\":\"GTQ\",\"registerCode\":\""+code+"\"}"));
        long version=jdbc.queryForObject("SELECT row_version FROM wok.cash_sessions WHERE id=?",Long.class,cash);
        jdbc.execute("CREATE FUNCTION wok.f04_cash_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PAYMENT_ATTEMPT_CONFIRMED' AND NEW.actor_user_id='"+f.actor()+"'::uuid THEN RAISE EXCEPTION 'F04 isolated commit-boundary failure'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER f04_cash_fail BEFORE INSERT ON wok.audit_logs FOR EACH ROW EXECUTE FUNCTION wok.f04_cash_fail()");
        try {
            assertThat(post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":1}").statusCode()).isEqualTo(500);
            assertThat(financialCount(f)).isZero();
            assertThat(jdbc.queryForObject("SELECT row_version FROM wok.cash_sessions WHERE id=?",Long.class,cash)).isEqualTo(version);
            assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id=?",cash)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT status FROM wok.order_accounts WHERE id=?",String.class,f.account())).isEqualTo("OPEN");
            assertThat(body(get(path(f,row),f.token())).path("status").asText()).isEqualTo("PENDING");
        } finally {jdbc.execute("DROP TRIGGER f04_cash_fail ON wok.audit_logs");jdbc.execute("DROP FUNCTION wok.f04_cash_fail()");}
        assertThat(capture(f,row).path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(jdbc.queryForObject("SELECT SUM(amount_delta) FROM wok.cash_movements WHERE cash_session_id=?",BigDecimal.class,cash)).isEqualByComparingTo("42");
        assertThat(jdbc.queryForObject("SELECT row_version FROM wok.cash_sessions WHERE id=?",Long.class,cash)).isEqualTo(version+1);
    }

    @Test void concurrentReplacementCreatesOneSuccessorAndOwnershipIsEnforced() throws Exception {
        Fixture f=fixture("100");JsonNode original=prepare(f,"100",null);
        jdbc.update("UPDATE wok.orders SET total=70,subtotal=70 WHERE account_id=?",f.account());capture(f,original);
        String request="{\"expectedVersion\":3,\"reason\":\"Corrección explícita\",\"payment\":"+payload("70",id(original))+"}";
        var results=race(()->post(path(f,original)+"/replacement",f.token(),request),()->post(path(f,original)+"/replacement",f.token(),request));
        assertThat(body(results.get(0)).path("attemptId")).isEqualTo(body(results.get(1)).path("attemptId"));
        assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE previous_attempt_id=?",id(original))).isEqualTo(1);
        JsonNode next=body(results.get(0));String other=tokenForRole("OPERATIONAL");
        assertThat(post(path(f,next)+"/capture",other,"{\"expectedVersion\":1}").statusCode()).isEqualTo(404);
        assertThat(post(path(f,next)+"/retire",other,"{\"expectedVersion\":1,\"reason\":\"Ajeno\"}").statusCode()).isEqualTo(404);
        assertThat(post(path(f,original)+"/replacement",other,request).statusCode()).isEqualTo(404);
        assertThat(capture(f,next).path("status").asText()).isEqualTo("CONFIRMED");
    }

    @Test void captureAndTableReleaseSerializeWithoutLosingConfirmedEvidence() throws Exception {
        for(int i=0;i<5;i++) {
            Fixture f=fixture("100");UUID table=UUID.fromString(body(post("/api/v1/operational/tables",f.token(),"{\"name\":\"F04 "+UUID.randomUUID().toString().substring(0,8)+"\",\"capacity\":2,\"zone\":\"SALON\"}")).path("id").asText());
            body(post("/api/v1/operational/tables/"+table+"/open",f.token(),null));
            jdbc.update("UPDATE wok.order_accounts SET dining_table_id=? WHERE id=?",table,f.account());
            JsonNode row=prepare(f,"100",null);
            var result=race(()->post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":1}"),()->post("/api/v1/operational/tables/"+table+"/close",f.token(),null));
            assertThat(result.get(0).statusCode()).as(result.get(0).body()).isEqualTo(200);
            assertThat(result.get(1).statusCode()).as(result.get(1).body()).isIn(200,409);
            if(result.get(1).statusCode()==409) body(post("/api/v1/operational/tables/"+table+"/close",f.token(),null));
            assertThat(jdbc.queryForObject("SELECT status FROM wok.order_accounts WHERE id=?",String.class,f.account())).isEqualTo("CLOSED");
            assertThat(body(get(path(f,row),f.token())).path("status").asText()).isEqualTo("CONFIRMED");
            assertThat(financialCount(f)).isEqualTo(1);
        }
    }

    @Test void preparationAndRequestCommitFailuresCannotAdvanceTheProtocol() {
        for(String action:List.of("PAYMENT_ATTEMPT_PREPARED","PAYMENT_ATTEMPT_REQUESTED")) {
            Fixture f=fixture("100");JsonNode row=action.endsWith("REQUESTED")?prepare(f,"40",null):null;
            jdbc.execute("CREATE FUNCTION wok.f04_boundary_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='"+action+"' AND NEW.actor_user_id='"+f.actor()+"'::uuid THEN RAISE EXCEPTION 'F04 isolated precommit failure'; END IF; RETURN NEW; END $$");
            jdbc.execute("CREATE TRIGGER f04_boundary_fail BEFORE INSERT ON wok.audit_logs FOR EACH ROW EXECUTE FUNCTION wok.f04_boundary_fail()");
            try {
                var response=row==null?post(base(f),f.token(),payload("40",null)):post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":1}");
                assertThat(response.statusCode()).isEqualTo(500);
                assertThat(financialCount(f)).isZero();
                if(row==null) assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE account_id=?",f.account())).isZero();
                else {
                    JsonNode state=body(get(path(f,row),f.token()));
                    assertThat(state.path("status").asText()).isEqualTo("PREPARED");
                    assertThat(state.path("executionRequestedAt").isMissingNode()||state.path("executionRequestedAt").isNull()).isTrue();
                }
            } finally {jdbc.execute("DROP TRIGGER f04_boundary_fail ON wok.audit_logs");jdbc.execute("DROP FUNCTION wok.f04_boundary_fail()");}
            if(row!=null) assertThat(body(post(path(f,row)+"/retire",f.token(),"{\"expectedVersion\":1,\"reason\":\"Solicitud revertida\"}")).path("status").asText()).isEqualTo("RETIRED");
        }
    }

    @Test void cashCloseAndCaptureUseTheSameCashMutexAndVersion() throws Exception {
        for(int i=0;i<5;i++) {
            Fixture f=fixture("30");String code="F04_"+UUID.randomUUID().toString().substring(0,8).toUpperCase();
            jdbc.update("INSERT INTO wok.cash_registers(code,name,currency_id) SELECT ?,'F04 isolated race',id FROM wok.currencies WHERE code='GTQ'",code);
            UUID cash=UUID.fromString(body(post("/api/v1/operational/cash-sessions",f.token(),"{\"registerCode\":\""+code+"\",\"openingFloat\":10}",Map.of("Idempotency-Key",UUID.randomUUID().toString()))).path("id").asText());
            JsonNode row=body(post(base(f),f.token(),"{\"method\":\"CASH\",\"amount\":30,\"currency\":\"GTQ\",\"registerCode\":\""+code+"\"}"));
            var results=race(()->post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":1}"),()->post("/api/v1/operational/cash-sessions/"+cash+"/close",f.token(),"{\"countedCash\":10,\"expectedVersion\":1}"));
            JsonNode capture=body(results.get(0));
            if(capture.path("status").asText().equals("CONFIRMED")) {
                assertThat(results.get(1).statusCode()).isEqualTo(409);
                assertThat(financialCount(f)).isEqualTo(1);
                assertThat(jdbc.queryForObject("SELECT status FROM wok.cash_sessions WHERE id=?",String.class,cash)).isEqualTo("OPEN");
                body(post("/api/v1/operational/cash-sessions/"+cash+"/close",f.token(),"{\"countedCash\":40,\"expectedVersion\":2}"));
            } else {
                assertThat(capture.path("status").asText()).isEqualTo("REJECTED");
                assertThat(results.get(1).statusCode()).isEqualTo(200);
                assertThat(financialCount(f)).isZero();
            }
        }
    }

}

abstract class PaymentAttemptTestSupport extends PostgresIntegrationTest {
    final ObjectMapper json = new ObjectMapper();
    Fixture fixture(String total) {
        jdbc.update("INSERT INTO wok.currencies(code,name) VALUES ('USD','F04 fictitious USD') ON CONFLICT (code) DO NOTHING");
        UUID actor=createUserWithRole("f04-"+UUID.randomUUID()+"@wok.test","OPERATIONAL"); UUID account=UUID.randomUUID();
        jdbc.update("INSERT INTO wok.order_accounts(id,name,status,opened_by,created_by,updated_by) VALUES (?,'F04 isolated','OPEN',?,?,?)",account,actor,actor,actor);
        jdbc.update("INSERT INTO wok.orders(id,code,account_id,channel,status,subtotal,discount,total,currency_id,guest_count,opened_by,closed_at) SELECT ?,?,?,'PICKUP','CLOSED',?::numeric,0,?::numeric,id,1,?,now() FROM wok.currencies WHERE code = 'GTQ'",
                UUID.randomUUID(),"F04-"+UUID.randomUUID(),account,total,total,actor);
        return new Fixture(actor,account,tokenFor(actor));
    }
    JsonNode prepare(Fixture f,String amount,UUID previous) {return body(post(base(f),f.token(),payload(amount,previous)));}
    JsonNode capture(Fixture f,JsonNode row) {return body(post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":"+row.path("version").asLong()+"}"));}
    String payload(String amount,UUID previous) {return "{\"method\":\"TRANSFER\",\"amount\":"+amount+",\"currency\":\"GTQ\",\"expectedPreviousAttemptId\":"+(previous==null?"null":"\""+previous+"\"")+"}";}
    String base(Fixture f) {return "/api/v1/operational/accounts/"+f.account()+"/payment-attempts";}
    String path(Fixture f,JsonNode row) {return base(f)+"/"+id(row);}
    UUID id(JsonNode row) {return UUID.fromString(row.path("attemptId").asText());}
    int financialCount(Fixture f) {return count("SELECT count(*) FROM wok.payments WHERE account_id = ?",f.account());}
    int count(String sql,Object...args) {return jdbc.queryForObject(sql,Integer.class,args);}
    JsonNode body(HttpResponse<String> response) {assertThat(response.statusCode()).as(response.body()).isBetween(200,299); try{return json.readTree(response.body());}catch(Exception e){throw new IllegalStateException(e);}}
    List<HttpResponse<String>> race(Supplier<HttpResponse<String>> left,Supplier<HttpResponse<String>> right) throws Exception {
        ExecutorService pool=Executors.newFixedThreadPool(2); CountDownLatch start=new CountDownLatch(1);
        try {Future<HttpResponse<String>> a=pool.submit(()->{start.await();return left.get();}); Future<HttpResponse<String>> b=pool.submit(()->{start.await();return right.get();});start.countDown();return List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS));}finally{pool.shutdownNow();}
    }
    record Fixture(UUID actor,UUID account,String token) {}
    Connection databaseConnection() throws Exception {
        return DriverManager.getConnection(DATABASE.getJdbcUrl(),DATABASE.getUsername(),DATABASE.getPassword());
    }
    int awaitWaiter(String sql,Integer argument) throws Exception {
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(6);
        while(System.nanoTime()<end) {
            List<Integer> rows=argument==null?jdbc.queryForList(sql,Integer.class):jdbc.queryForList(sql,Integer.class,argument);
            if(!rows.isEmpty()) return rows.getFirst();
            Thread.sleep(25);
        }
        throw new AssertionError("Expected PostgreSQL lock waiter was not observed");
    }
    String protocolSnapshot(Fixture f) {
        return jdbc.queryForObject("SELECT jsonb_build_object('payments',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM wok.payments p WHERE account_id=?),'attempts',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY sequence),'[]') FROM wok.payment_attempts a WHERE account_id=?),'claims',(SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY key),'[]') FROM wok.idempotency_keys k WHERE principal_scope=?),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM wok.audit_logs l WHERE actor_user_id=?),'account',(SELECT to_jsonb(a) FROM wok.order_accounts a WHERE id=?))::text",String.class,f.account(),f.account(),f.actor().toString(),f.actor(),f.account());
    }
}
