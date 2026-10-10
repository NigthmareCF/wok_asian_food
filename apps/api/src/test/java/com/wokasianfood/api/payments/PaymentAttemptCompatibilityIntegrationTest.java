package com.wokasianfood.api.payments;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PaymentAttemptCompatibilityIntegrationTest extends PaymentAttemptTestSupport {
    @Autowired PaymentAttemptService attempts;
    @Autowired PaymentService payments;

    @Test void replayFirstMutexAllowsKeyShareAndThenNextExplicitPreparation() throws Exception {
        Fixture f=fixture("100");UUID key=UUID.randomUUID();String request="{\"method\":\"TRANSFER\",\"amount\":40}";
        JsonNode payment=legacy(f,key,request);
        UUID old=jdbc.queryForObject("SELECT id FROM wok.payment_attempts WHERE account_id=?",UUID.class,f.account());
        var pool=Executors.newFixedThreadPool(2);
        try(Connection held=databaseConnection();Connection probe=databaseConnection()) {
            held.setAutoCommit(false);
            try(var q=held.prepareStatement("SELECT id FROM wok.order_accounts WHERE id=? FOR UPDATE")) {q.setObject(1,f.account());q.executeQuery();}
            int holder;
            try(var q=held.createStatement();var rs=q.executeQuery("SELECT pg_backend_pid()")) {rs.next();holder=rs.getInt(1);}
            Future<HttpResponse<String>> replay=pool.submit(()->post(legacyPath(f),f.token(),request,Map.of("Idempotency-Key",key.toString())));
            int replayPid=awaitWaiter("SELECT pid FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%SELECT id FROM wok.order_accounts%'",holder);
            // Replay holds its attempt mutex while waiting for account. The FK's KEY SHARE must coexist.
            try(var q=probe.prepareStatement("SELECT id FROM wok.payment_attempts WHERE id=? FOR KEY SHARE")) {
                q.setQueryTimeout(2);q.setObject(1,old);assertThat(q.executeQuery().next()).isTrue();
            }
            Future<HttpResponse<String>> preparation=pool.submit(()->post(base(f),f.token(),payload("20",old)));
            // PostgreSQL may report the earlier queued replay as the soft blocker, rather than
            // the connection actually holding account. Both identify the same account wait queue.
            awaitWaiter("SELECT pid FROM pg_stat_activity WHERE (?=ANY(pg_blocking_pids(pid)) OR "+replayPid+"=ANY(pg_blocking_pids(pid))) AND pid<>"+replayPid+" AND query LIKE '%SELECT id FROM wok.order_accounts%'",holder);
            held.rollback();
            HttpResponse<String> replayed=replay.get(15,TimeUnit.SECONDS);
            assertThat(replayed.statusCode()).isEqualTo(201);
            assertThat(body(replayed).path("paymentId")).isEqualTo(payment.path("paymentId"));
            assertThat(preparation.get(15,TimeUnit.SECONDS).statusCode()).isEqualTo(200);
            assertThat(financialCount(f)).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=?",f.actor().toString())).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id=? AND action='PAYMENT_CAPTURED'",f.actor())).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE previous_attempt_id=?",old)).isEqualTo(1);
            System.out.println("R01 replay first="+replayPid+": KEY SHARE compatible while account waits, same confirmed payment and one prepared successor");
        } finally {pool.shutdownNow();}
    }

    @Test void legacyExplicitAndFullPreparationAllowConfirmedReplayAcrossPredecessorForeignKey() throws Exception {
        for (boolean full : List.of(false,true)) {
            Fixture f=fixture("100"); UUID oldKey=UUID.randomUUID();
            String original="{\"method\":\"TRANSFER\",\"amount\":40}";
            JsonNode payment=legacy(f,oldKey,original);
            UUID old=jdbc.queryForObject("SELECT id FROM wok.payment_attempts WHERE account_id=?",UUID.class,f.account());
            String frozen=jdbc.queryForObject("SELECT request_hash FROM wok.payment_attempts WHERE id=?",String.class,old);
            String next=full?"{\"method\":\"TRANSFER\"}":"{\"method\":\"TRANSFER\",\"amount\":20}";
            UUID nextKey=UUID.randomUUID();
            var responses=gatedInsert(f,old,
                    ()->post(legacyPath(f),f.token(),next,Map.of("Idempotency-Key",nextKey.toString())),
                    ()->post(legacyPath(f),f.token(),original,Map.of("Idempotency-Key",oldKey.toString())));
            assertThat(responses).extracting(HttpResponse::statusCode).containsExactly(201,201);
            assertThat(body(responses.get(1)).path("paymentId")).isEqualTo(payment.path("paymentId"));
            assertThat(body(responses.get(0)).path("amount").decimalValue()).isEqualByComparingTo(full?"60":"20");
            assertThat(jdbc.queryForObject("SELECT request_hash FROM wok.payment_attempts WHERE id=?",String.class,old)).isEqualTo(frozen);
            assertThat(financialCount(f)).isEqualTo(2);
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=? AND status='COMPLETED'",f.actor().toString())).isEqualTo(2);
            assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE previous_attempt_id=?",old)).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id=? AND action='PAYMENT_CAPTURED'",f.actor())).isEqualTo(2);
        }
    }

    @Test void legacyPreparationAndReplacementSerializeBothOrdersWithoutForeignKeyDeadlock() throws Exception {
        for(boolean legacyFirst:List.of(true,false)) {
            Fixture f=fixture("100");JsonNode old=prepare(f,"80",null);UUID previous=id(old);
            jdbc.update("UPDATE wok.orders SET total=70,subtotal=70 WHERE account_id=?",f.account());
            assertThat(capture(f,old).path("status").asText()).isEqualTo("REJECTED");
            UUID key=UUID.randomUUID();
            Supplier<HttpResponse<String>> legacy=()->post(legacyPath(f),f.token(),"{\"method\":\"TRANSFER\",\"amount\":20}",Map.of("Idempotency-Key",key.toString()));
            Supplier<HttpResponse<String>> replacement=()->post(path(f,old)+"/replacement",f.token(),"{\"expectedVersion\":3,\"reason\":\"Importe revisado\",\"payment\":"+payload("25",previous)+"}");
            var result=gatedInsert(f,previous,legacyFirst?legacy:replacement,legacyFirst?replacement:legacy);
            assertThat(result).extracting(HttpResponse::statusCode).containsExactly(legacyFirst?201:200,409);
            assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE previous_attempt_id=?",previous)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT status FROM wok.payment_attempts WHERE id=?",String.class,previous)).isEqualTo("REJECTED");
            assertThat(financialCount(f)).isEqualTo(legacyFirst?1:0);
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=?",f.actor().toString())).isEqualTo(legacyFirst?1:0);
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id=? AND action='PAYMENT_CAPTURED'",f.actor())).isEqualTo(legacyFirst?1:0);
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id=? AND action='PAYMENT_ATTEMPT_REJECTED'",f.actor())).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id=? AND action='PAYMENT_ATTEMPT_REPLACEMENT'",f.actor())).isEqualTo(1);
        }
    }

    @Test void confirmedReplacementReplayAndNextPreparationPreserveSuccessorEvidence() throws Exception {
        Fixture f=fixture("100");JsonNode old=prepare(f,"80",null);
        jdbc.update("UPDATE wok.orders SET total=70,subtotal=70 WHERE account_id=?",f.account()); capture(f,old);
        String replacing="{\"expectedVersion\":3,\"reason\":\"Importe revisado\",\"payment\":"+payload("25",id(old))+"}";
        JsonNode successor=body(post(path(f,old)+"/replacement",f.token(),replacing)); JsonNode confirmed=capture(f,successor);
        var result=gatedInsert(f,id(successor),()->post(base(f),f.token(),payload("20",id(successor))),
                ()->post(path(f,old)+"/replacement",f.token(),replacing));
        assertThat(result).extracting(HttpResponse::statusCode).containsExactly(200,200);
        assertThat(body(result.get(1)).path("attemptId")).isEqualTo(successor.path("attemptId"));
        assertThat(body(result.get(1)).path("confirmation").path("paymentId")).isEqualTo(confirmed.path("confirmation").path("paymentId"));
        assertThat(financialCount(f)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=?",f.actor().toString())).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id=? AND action='PAYMENT_CAPTURED'",f.actor())).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE previous_attempt_id=?",id(old))).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE previous_attempt_id=?",id(successor))).isEqualTo(1);
    }

    private List<HttpResponse<String>> gatedInsert(Fixture f,UUID previous,
            Supplier<HttpResponse<String>> first,Supplier<HttpResponse<String>> second) throws Exception {
        long guard=84041002L;var pool=Executors.newFixedThreadPool(2);
        // Real API holds account before this INSERT; predecessor FK checking runs after the pause.
        jdbc.execute("CREATE FUNCTION wok.f04_successor_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.previous_attempt_id='"+previous+"'::uuid THEN PERFORM pg_advisory_xact_lock("+guard+"); END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER f04_successor_gate BEFORE INSERT ON wok.payment_attempts FOR EACH ROW EXECUTE FUNCTION wok.f04_successor_gate()");
        try(Connection gate=databaseConnection()) {
            gate.createStatement().execute("SELECT pg_advisory_lock("+guard+")");
            Future<HttpResponse<String>> a=pool.submit(first::get);
            int holder=awaitWaiter("SELECT pid FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%INSERT INTO wok.payment_attempts%'",null);
            Future<HttpResponse<String>> b=pool.submit(second::get);
            int waiter=awaitWaiter("SELECT pid FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM wok.order_accounts%'",holder);
            gate.createStatement().execute("SELECT pg_advisory_unlock("+guard+")");
            var result=List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));
            System.out.println("R01 successor FK account holder="+holder+" contender="+waiter+" responses="+result.stream().map(HttpResponse::statusCode).toList());
            return result;
        } finally {pool.shutdownNow();jdbc.execute("DROP TRIGGER f04_successor_gate ON wok.payment_attempts");jdbc.execute("DROP FUNCTION wok.f04_successor_gate()");}
    }

    @Test void legacyPartialFullAndReplayPreserveOriginalFingerprintAcrossSessions() {
        Fixture f=fixture("136"); UUID key=UUID.randomUUID();
        JsonNode partial=legacy(f,key,"{\"method\":\"TRANSFER\",\"amount\":50}");
        assertThat(partial.path("balance").decimalValue()).isEqualByComparingTo("86");
        assertThat(body(post(legacyPath(f),tokenFor(f.actor()),"{\"method\":\"TRANSFER\",\"amount\":50}",Map.of("Idempotency-Key",key.toString()))).path("paymentId")).isEqualTo(partial.path("paymentId"));
        UUID fullKey=UUID.randomUUID(); JsonNode full=legacy(f,fullKey,"{\"method\":\"TRANSFER\"}");
        assertThat(full.path("amount").decimalValue()).isEqualByComparingTo("86");
        assertThat(full.path("accountStatus").asText()).isEqualTo("PAID");
        assertThat(legacy(f,fullKey,"{\"method\":\"TRANSFER\"}").path("paymentId")).isEqualTo(full.path("paymentId"));
        assertThat(post(legacyPath(f),f.token(),"{\"method\":\"TRANSFER\",\"amount\":86}",Map.of("Idempotency-Key",fullKey.toString())).statusCode()).isEqualTo(409);
        assertThat(financialCount(f)).isEqualTo(2);
    }

    @Test void legacyFullFreezesOnceAndDurableRejectionCannotRevive() {
        for(String debt:List.of("70","120")) {
            Fixture f=fixture("100"); UUID key=UUID.randomUUID();
            PaymentController.PaymentRequest request=new PaymentController.PaymentRequest(PaymentController.PaymentMethod.TRANSFER,null,null,null,null);
            UUID attempt=attempts.prepareLegacy(f.actor(),UUID.randomUUID(),f.account(),key,payments.normalize(f.account(),request));
            String fingerprint=jdbc.queryForObject("SELECT request_hash FROM wok.payment_attempts WHERE id = ?",String.class,attempt);
            jdbc.update("UPDATE wok.orders SET total = ?::numeric, subtotal = ?::numeric WHERE account_id = ?",debt,debt,f.account());
            var response=post(legacyPath(f),f.token(),"{\"method\":\"TRANSFER\"}",Map.of("Idempotency-Key",key.toString()));
            assertThat(response.statusCode()).as(response.body()).isEqualTo(debt.equals("70")?422:201);
            assertThat(jdbc.queryForObject("SELECT request_hash FROM wok.payment_attempts WHERE id = ?",String.class,attempt)).isEqualTo(fingerprint);
            if(debt.equals("70")) {
                jdbc.update("UPDATE wok.orders SET total = 120, subtotal = 120 WHERE account_id = ?",f.account());
                assertThat(post(legacyPath(f),f.token(),"{\"method\":\"TRANSFER\"}",Map.of("Idempotency-Key",key.toString())).statusCode()).isEqualTo(422);
                assertThat(financialCount(f)).isZero();
                assertThat(legacy(f,UUID.randomUUID(),"{\"method\":\"TRANSFER\",\"amount\":20}").path("amount").decimalValue()).isEqualByComparingTo("20");
                assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE previous_attempt_id = ?",attempt)).isEqualTo(1);
            } else {
                assertThat(body(response).path("amount").decimalValue()).isEqualByComparingTo("100");
                assertThat(body(response).path("balance").decimalValue()).isEqualByComparingTo("20");
            }
        }
    }

    @Test void legacyConfirmedAnomalyAndHistoricalReplayAreReadOnly() {
        Fixture f=fixture("100");UUID key=UUID.randomUUID();JsonNode receipt=legacy(f,key,"{\"method\":\"TRANSFER\",\"amount\":40}");
        // Simulate a pre-protocol confirmed payment in this isolated database; GET/replay must not backfill.
        jdbc.update("DELETE FROM wok.payment_attempts WHERE account_id = ?",f.account());
        assertThat(legacy(f,key,"{\"method\":\"TRANSFER\",\"amount\":40}").path("paymentId")).isEqualTo(receipt.path("paymentId"));
        assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE account_id = ?",f.account())).isZero();
        jdbc.update("INSERT INTO wok.orders(id,code,account_id,channel,status,subtotal,discount,total,currency_id,guest_count,opened_by,closed_at) SELECT ?,?,?,'PICKUP','CLOSED',1,0,1,id,1,?,now() FROM wok.currencies WHERE code = 'USD'",UUID.randomUUID(),"F04-"+UUID.randomUUID(),f.account(),f.actor());
        int audit=count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id = ?",f.actor());
        assertThat(get(legacyPath(f)+"/by-idempotency-key/"+key,f.token()).statusCode()).isEqualTo(409);
        assertThat(post(legacyPath(f),f.token(),"{\"method\":\"TRANSFER\",\"amount\":40}",Map.of("Idempotency-Key",key.toString())).statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id = ?",f.actor())).isEqualTo(audit);
        assertThat(financialCount(f)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE account_id = ?",f.account())).isZero();
    }

    @Test void rejectedCashCanBeReplacedExplicitlyButNotByRecoveryKey() {
        Fixture f=fixture("30");UUID key=UUID.randomUUID();String cash="{\"method\":\"CASH\",\"amount\":30,\"registerCode\":\"F04_NO_REGISTER\"}";
        assertThat(post(legacyPath(f),f.token(),cash,Map.of("Idempotency-Key",key.toString())).statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.payment_attempts WHERE created_by = ? AND capture_key = ?",String.class,f.actor(),key)).isEqualTo("REJECTED");
        assertThat(financialCount(f)).isZero();
        assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope = ?",f.actor().toString())).isZero();
        assertThat(post(legacyPath(f),f.token(),"{\"method\":\"TRANSFER\",\"amount\":30}",Map.of("Idempotency-Key",key.toString())).statusCode()).isEqualTo(409);
        assertThat(legacy(f,UUID.randomUUID(),"{\"method\":\"TRANSFER\",\"amount\":30}").path("accountStatus").asText()).isEqualTo("PAID");
    }

    @Test void legacyPrecisionAndRangeRejectWithoutAttemptsClaimsOrPayments() {
        Fixture f=fixture("100");
        for(String invalid:List.of("1.005","1000000000000.00")) {
            assertThat(post(legacyPath(f),f.token(),"{\"method\":\"TRANSFER\",\"amount\":"+invalid+"}",Map.of("Idempotency-Key",UUID.randomUUID().toString())).statusCode()).isEqualTo(422);
            assertThat(post(legacyPath(f),f.token(),"{\"method\":\"TRANSFER\",\"amount\":1,\"tipAmount\":"+invalid+"}",Map.of("Idempotency-Key",UUID.randomUUID().toString())).statusCode()).isEqualTo(422);
        }
        assertThat(financialCount(f)).isZero();
        assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE account_id = ?",f.account())).isZero();
        assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope = ?",f.actor().toString())).isZero();
    }

    @Test void replacedKeyAndOtherOperatorCannotBypassAccountFence() throws Exception {
        Fixture f=fixture("100"); JsonNode row=prepare(f,"40",null);
        var results=race(() -> post(legacyPath(f),f.token(),"{\"method\":\"TRANSFER\",\"amount\":40}",Map.of("Idempotency-Key",UUID.randomUUID().toString())),
                () -> post(legacyPath(f),tokenForRole("OPERATIONAL"),"{\"method\":\"TRANSFER\",\"amount\":40}",Map.of("Idempotency-Key",UUID.randomUUID().toString())));
        assertThat(results).extracting(java.net.http.HttpResponse::statusCode).containsExactly(409,409);
        assertThat(financialCount(f)).isZero();
        assertThat(capture(f,row).path("status").asText()).isEqualTo("CONFIRMED");
    }

    @Test void oneLegacyKeyAcrossDifferentAccountsHasOneCaptureAndOneConflict() throws Exception {
        Fixture left=fixture("100"), initial=fixture("100");
        Fixture right=new Fixture(left.actor(),initial.account(),left.token());UUID key=UUID.randomUUID();
        var results=race(()->post(legacyPath(left),left.token(),"{\"method\":\"TRANSFER\",\"amount\":40}",Map.of("Idempotency-Key",key.toString())),
                ()->post(legacyPath(right),right.token(),"{\"method\":\"TRANSFER\",\"amount\":40}",Map.of("Idempotency-Key",key.toString())));
        assertThat(results).extracting(java.net.http.HttpResponse::statusCode).containsExactlyInAnyOrder(201,409);
        assertThat(financialCount(left)+financialCount(right)).isEqualTo(1);
    }
    String legacyPath(Fixture f){return "/api/v1/operational/accounts/"+f.account()+"/payments";}
    JsonNode legacy(Fixture f,UUID key,String body){var response=post(legacyPath(f),f.token(),body,Map.of("Idempotency-Key",key.toString()));assertThat(response.statusCode()).as(response.body()).isEqualTo(201);return body(response);}
}
