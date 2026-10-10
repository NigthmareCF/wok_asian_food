package com.wokasianfood.api.payments;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PaymentAttemptResolutionIntegrationTest extends PaymentAttemptTestSupport {
    @Autowired PaymentAttemptService attempts;
    String admin(){return tokenForRole("ADMIN");}
    String route(Fixture f,JsonNode row){return path(f,row)+"/resolution";}
    String request(long version,String physical){return "{\"expectedVersion\":"+version+",\"reason\":\"No se recibió dinero; revisión con operador\",\"evidenceSummary\":\"Caja y comprobantes ficticios revisados; el operador no recibió dinero\",\"evidenceReference\":\"F04B-fixture\",\"physicalReceiptStatus\":\""+physical+"\"}";}
    HttpResponse<String> resolve(Fixture f,JsonNode row,String token,long version){return post(route(f,row),token,request(version,"NOT_RECEIVED"),Map.of("X-Request-Id",UUID.randomUUID().toString()));}
    int audits(UUID attempt){return count("SELECT count(*) FROM wok.audit_logs WHERE entity_id=? AND action='PAYMENT_ATTEMPT_RESOLVED_WITHOUT_CAPTURE'",attempt);}
    String snapshot(Fixture f,UUID attempt){return jdbc.queryForObject("SELECT jsonb_build_object('protocol',?::text,'audit',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM wok.audit_logs l WHERE entity_id=?))::text",String.class,protocolSnapshot(f),attempt);}

    @Test void permissionsAndSeparationRequireAnotherResponsibleButAllowNormalOwnPreparedRetirement() {
        Fixture f=fixture("100");JsonNode row=prepare(f,"25",null);String before=snapshot(f,id(row));
        assertThat(resolve(f,row,null,1).statusCode()).isEqualTo(401);
        assertThat(resolve(f,row,f.token(),1).statusCode()).isEqualTo(403);
        assertThat(resolve(f,row,tokenForRole("CLIENT"),1).statusCode()).isEqualTo(403);
        jdbc.update("INSERT INTO wok.user_roles(user_id,role_id) SELECT ?,id FROM wok.roles WHERE code='ADMIN' ON CONFLICT DO NOTHING",f.actor());
        String ownAdmin=tokenFor(f.actor());
        HttpResponse<String> denied=resolve(f,row,ownAdmin,1);
        assertThat(denied.statusCode()).isEqualTo(403);
        assertThat(denied.body()).contains("SEPARATE_RESPONSIBLE_REQUIRED");
        assertThat(body(get(route(f,row),ownAdmin)).path("availableActions")).isEmpty();
        assertThat(snapshot(f,id(row))).isEqualTo(before);
        assertThat(body(post(path(f,row)+"/retire",ownAdmin,"{\"expectedVersion\":1,\"reason\":\"Nunca solicitado\"}")).path("status").asText()).isEqualTo("RETIRED");
        assertThat(audits(id(row))).isZero();
        // An independent second ADMIN can resolve this owner's requested operation.
        JsonNode pending=prepare(f,"25",id(row));attempts.requestExecution(f.actor(),f.account(),id(pending),1L);
        String pendingBefore=snapshot(f,id(pending));
        assertThat(resolve(f,pending,ownAdmin,2).statusCode()).isEqualTo(403);
        assertThat(post(path(f,pending)+"/retire",ownAdmin,"{\"expectedVersion\":2,\"reason\":\"Nunca solicitado\"}").statusCode()).isEqualTo(409);
        assertThat(snapshot(f,id(pending))).isEqualTo(pendingBefore);
        assertThat(body(resolve(f,pending,admin(),2)).path("attempt").path("status").asText()).isEqualTo("RETIRED");
    }

    @Test void bothAuthoritiesAreRequiredAndPhysicalUncertaintyOrMissingEvidenceNeverRetires() {
        Fixture f=fixture("100");JsonNode row=prepare(f,"25",null);String supervisor=admin();String before=snapshot(f,id(row));
        // Dedicated fictional role has resolve but no manage; real API method security must reject.
        UUID role=UUID.randomUUID(),user=createUserWithRole("resolve-only-"+UUID.randomUUID()+"@wok.test","CLIENT");
        jdbc.update("INSERT INTO wok.roles(id,code,name) VALUES (?,?,'F04B resolve only')",role,"F04B_"+UUID.randomUUID());
        jdbc.update("INSERT INTO wok.role_permissions(role_id,permission_id) SELECT ?,id FROM wok.permissions WHERE code='payments:resolve'",role);
        jdbc.update("INSERT INTO wok.user_roles(user_id,role_id) VALUES (?,?)",user,role);
        assertThat(resolve(f,row,tokenFor(user),1).statusCode()).isEqualTo(403);
        for(String state:List.of("RECEIVED","UNKNOWN")) {
            var response=post(route(f,row),supervisor,request(1,state),Map.of("X-Request-Id",UUID.randomUUID().toString()));
            assertThat(response.statusCode()).isEqualTo(422);assertThat(response.body()).contains("PHYSICAL_RECEIPT_UNRESOLVED");
        }
        assertThat(post(route(f,row),supervisor,request(1,"NOT_RECEIVED").replace("Caja y comprobantes ficticios revisados; el operador no recibió dinero"," "),Map.of("X-Request-Id",UUID.randomUUID().toString())).statusCode()).isIn(400,422);
        assertThat(resolve(f,row,supervisor,9).statusCode()).isEqualTo(409);
        assertThat(snapshot(f,id(row))).isEqualTo(before);
    }

    @Test void requestedMarkerEvidenceAndFinancialRowsSurviveResolutionReplayAndLateCapture() throws Exception {
        Fixture f=fixture("100");JsonNode row=prepare(f,"40",null);attempts.requestExecution(f.actor(),f.account(),id(row),1L);
        OffsetDateTime marker=jdbc.queryForObject("SELECT execution_requested_at FROM wok.payment_attempts WHERE id=?",OffsetDateTime.class,id(row));
        String supervisor=admin();var responses=race(()->resolve(f,row,supervisor,2),()->resolve(f,row,supervisor,2));
        assertThat(responses).extracting(HttpResponse::statusCode).containsExactly(200,200);
        JsonNode retired=body(responses.getFirst()).path("attempt");
        assertThat(retired.path("status").asText()).isEqualTo("RETIRED");assertThat(retired.path("version").asLong()).isEqualTo(3);
        assertThat(retired.path("executionRequestedAt").asText()).isNotBlank();
        assertThat(retired.path("resolution").path("physicalReceiptStatus").asText()).isEqualTo("NOT_RECEIVED");
        assertThat(jdbc.queryForObject("SELECT execution_requested_at FROM wok.payment_attempts WHERE id=?",OffsetDateTime.class,id(row))).isEqualTo(marker);
        assertThat(financialCount(f)).isZero();assertThat(audits(id(row))).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=?",f.actor().toString())).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_accounts WHERE id=?",String.class,f.account())).isEqualTo("OPEN");
        String before=snapshot(f,id(row));
        assertThat(body(get(path(f,row),f.token())).path("resolution").isObject()).isTrue();
        body(get(route(f,row),supervisor));body(resolve(f,row,supervisor,2));
        assertThat(resolve(f,row,admin(),2).statusCode()).isEqualTo(409);
        assertThat(post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":2}").statusCode()).isEqualTo(409);
        assertThat(post(path(f,row)+"/retire",f.token(),"{\"expectedVersion\":2,\"reason\":\"No se recibió dinero; revisión con operador\"}").statusCode()).isEqualTo(409);
        assertThat(snapshot(f,id(row))).isEqualTo(before);
        JsonNode next=prepare(f,"20",id(row));capture(f,next);
        assertThat(financialCount(f)).isEqualTo(1);assertThat(audits(id(row))).isEqualTo(1);
        assertThat(post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":3}").statusCode()).isEqualTo(409);
        assertThatThrownBy(()->jdbc.update("UPDATE wok.payment_attempts SET execution_requested_at=NULL,row_version=row_version+1 WHERE id=?",id(row))).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("UPDATE wok.payment_attempts SET resolution_reason='Changed',row_version=row_version+1 WHERE id=?",id(row))).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test void auditFailureRollsBackResolutionAndFenceThenSameAttemptCanConfirm() {
        Fixture f=fixture("100");JsonNode row=prepare(f,"40",null);attempts.requestExecution(f.actor(),f.account(),id(row),1L);
        String before=snapshot(f,id(row)),supervisor=admin();
        jdbc.execute("CREATE FUNCTION wok.f04b_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PAYMENT_ATTEMPT_RESOLVED_WITHOUT_CAPTURE' AND NEW.entity_id='"+id(row)+"'::uuid THEN RAISE EXCEPTION 'F04B isolated audit failure'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER f04b_audit_fail BEFORE INSERT ON wok.audit_logs FOR EACH ROW EXECUTE FUNCTION wok.f04b_audit_fail()");
        try {
            assertThat(resolve(f,row,supervisor,2).statusCode()).isEqualTo(500);
            assertThat(snapshot(f,id(row))).isEqualTo(before);
            assertThat(post(base(f),f.token(),payload("20",id(row))).statusCode()).isEqualTo(409);
        } finally {jdbc.execute("DROP TRIGGER f04b_audit_fail ON wok.audit_logs");jdbc.execute("DROP FUNCTION wok.f04b_audit_fail()");}
        assertThat(capture(f,row).path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(resolve(f,row,supervisor,3).statusCode()).isEqualTo(409);
        assertThat(financialCount(f)).isEqualTo(1);assertThat(audits(id(row))).isZero();
    }

    @Test void resolutionWinsOverAlreadyStartedExecutorWithInvisibleClaimAndFencesLegacy() throws Exception {
        Fixture f=fixture("100");JsonNode row=prepare(f,"40",null);attempts.requestExecution(f.actor(),f.account(),id(row),1L);
        UUID key=jdbc.queryForObject("SELECT capture_key FROM wok.payment_attempts WHERE id=?",UUID.class,id(row));
        String supervisor=admin();long guard=84042001L;var pool=Executors.newSingleThreadExecutor();
        jdbc.execute("CREATE FUNCTION wok.f04b_claim_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.principal_scope='"+f.actor()+"' AND NEW.operation='ACCOUNT_PAYMENT_CAPTURED' THEN PERFORM pg_advisory_xact_lock("+guard+"); END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER f04b_claim_gate AFTER INSERT ON wok.idempotency_keys FOR EACH ROW EXECUTE FUNCTION wok.f04b_claim_gate()");
        try(Connection gate=databaseConnection()) {
            gate.createStatement().execute("SELECT pg_advisory_lock("+guard+")");
            Future<HttpResponse<String>> executing=pool.submit(()->post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":2}"));
            int pid=awaitWaiter("SELECT pid FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%INSERT INTO wok.idempotency_keys%'",null);
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=?",f.actor().toString())).isZero();
            JsonNode retired=body(resolve(f,row,supervisor,2)).path("attempt");assertThat(retired.path("status").asText()).isEqualTo("RETIRED");
            gate.createStatement().execute("SELECT pg_advisory_unlock("+guard+")");
            assertThat(executing.get(15,TimeUnit.SECONDS).statusCode()).isEqualTo(409);
            assertThat(post("/api/v1/operational/accounts/"+f.account()+"/payments",f.token(),"{\"method\":\"TRANSFER\",\"amount\":40}",Map.of("Idempotency-Key",key.toString())).statusCode()).isEqualTo(409);
            assertThat(financialCount(f)).isZero();assertThat(audits(id(row))).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE principal_scope=?",f.actor().toString())).isZero();
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id=? AND action='PAYMENT_CAPTURED'",f.actor())).isZero();
            System.out.println("F04B resolution won against started executor="+pid+" with invisible claim: late new/legacy409, zero payments/claims; marker preserved");
        } finally {pool.shutdownNow();jdbc.execute("DROP TRIGGER f04b_claim_gate ON wok.idempotency_keys");jdbc.execute("DROP FUNCTION wok.f04b_claim_gate()");}
    }

    @Test void captureWinsWithPaymentIdUpgradeAndResolutionKeepsConfirmationAfterAnomaly() throws Exception {
        Fixture f=fixture("100");JsonNode row=prepare(f,"40",null);String supervisor=admin();long guard=84042002L;
        var pool=Executors.newFixedThreadPool(3);
        jdbc.execute("CREATE FUNCTION wok.f04b_confirm_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='"+id(row)+"'::uuid AND NEW.status='CONFIRMED' THEN PERFORM pg_advisory_xact_lock("+guard+"); END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER f04b_confirm_gate BEFORE UPDATE ON wok.payment_attempts FOR EACH ROW EXECUTE FUNCTION wok.f04b_confirm_gate()");
        try(Connection gate=databaseConnection()) {
            gate.createStatement().execute("SELECT pg_advisory_lock("+guard+")");
            Future<HttpResponse<String>> captured=pool.submit(()->post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":1}"));
            int pid=awaitWaiter("SELECT pid FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%UPDATE wok.payment_attempts%'",null);
            Future<HttpResponse<String>> resolution=pool.submit(()->resolve(f,row,supervisor,2));
            awaitWaiter("SELECT pid FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%FOR NO KEY UPDATE%'",pid);
            Future<Boolean> keyShare=pool.submit(()->{try(Connection c=databaseConnection();var q=c.prepareStatement("SELECT id FROM wok.payment_attempts WHERE id=? FOR KEY SHARE")){q.setObject(1,id(row));return q.executeQuery().next();}});
            awaitWaiter("SELECT pid FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%FOR KEY SHARE%'",pid);
            assertThat(body(get(path(f,row),f.token())).path("status").asText()).isEqualTo("PENDING");
            gate.createStatement().execute("SELECT pg_advisory_unlock("+guard+")");
            JsonNode confirmed=body(captured.get(15,TimeUnit.SECONDS));assertThat(keyShare.get(15,TimeUnit.SECONDS)).isTrue();
            HttpResponse<String> conflict=resolution.get(15,TimeUnit.SECONDS);assertThat(conflict.statusCode()).isEqualTo(409);assertThat(conflict.body()).contains("CONFIRMED_EVIDENCE_EXISTS");
            assertThat(financialCount(f)).isEqualTo(1);assertThat(audits(id(row))).isZero();
            jdbc.update("UPDATE wok.orders SET total=20,subtotal=20 WHERE account_id=?",f.account());
            String before=snapshot(f,id(row));JsonNode review=body(get(route(f,row),supervisor));
            assertThat(review.path("attempt").path("confirmation").path("paymentId")).isEqualTo(confirmed.path("confirmation").path("paymentId"));
            assertThat(review.path("attempt").path("receiptAvailability").asText()).isEqualTo("RECONCILIATION_REQUIRED");
            assertThat(resolve(f,row,supervisor,3).statusCode()).isEqualTo(409);assertThat(snapshot(f,id(row))).isEqualTo(before);
            System.out.println("F04B capture won="+pid+"; KEY SHARE observed UPDATE upgrade; resolution409 keeps one payment/claim and anomalous confirmation");
        } finally {pool.shutdownNow();jdbc.execute("DROP TRIGGER f04b_confirm_gate ON wok.payment_attempts");jdbc.execute("DROP FUNCTION wok.f04b_confirm_gate()");}
    }

    @Test void durableClaimsBlockResolutionEvenWhenExpiredAndCannotBeDeletedByIt() {
        for(String state:List.of("IN_PROGRESS","COMPLETED")) {
            Fixture f=fixture("100");JsonNode row=prepare(f,"25",null);attempts.requestExecution(f.actor(),f.account(),id(row),1L);
            jdbc.update("INSERT INTO wok.idempotency_keys(principal_scope,operation,key,request_hash,status,created_at,locked_until,expires_at) SELECT created_by::text,'ACCOUNT_PAYMENT_CAPTURED',capture_key::text,request_hash,?,now()-interval '2 days',now()-interval '1 day',now()-interval '1 day' FROM wok.payment_attempts WHERE id=?",state,id(row));
            String before=snapshot(f,id(row));assertThat(resolve(f,row,admin(),2).statusCode()).isEqualTo(409);
            assertThat(snapshot(f,id(row))).isEqualTo(before);assertThat(financialCount(f)).isZero();
        }
    }

    @Test void resolutionMetadataUpdateKeepsKeyShareCompatibleAndCommitFencesSuccessorAndCapture() throws Exception {
        Fixture f=fixture("100");JsonNode row=prepare(f,"40",null);attempts.requestExecution(f.actor(),f.account(),id(row),1L);
        UUID responsible=createUserWithRole("separate-"+UUID.randomUUID()+"@wok.test","ADMIN");String supervisor=tokenFor(responsible);
        long guard=84042003L;var pool=Executors.newFixedThreadPool(3);
        jdbc.execute("CREATE FUNCTION wok.f04b_resolution_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='"+id(row)+"'::uuid AND NEW.action='PAYMENT_ATTEMPT_RESOLVED_WITHOUT_CAPTURE' THEN PERFORM pg_advisory_xact_lock("+guard+"); END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER f04b_resolution_gate BEFORE INSERT ON wok.audit_logs FOR EACH ROW EXECUTE FUNCTION wok.f04b_resolution_gate()");
        try(Connection gate=databaseConnection();Connection userMutex=databaseConnection();Connection probe=databaseConnection()) {
            userMutex.setAutoCommit(false);
            try(var q=userMutex.prepareStatement("SELECT id FROM wok.users WHERE id=? FOR NO KEY UPDATE")){q.setObject(1,responsible);q.executeQuery();}
            gate.createStatement().execute("SELECT pg_advisory_lock("+guard+")");
            Future<HttpResponse<String>> resolving=pool.submit(()->resolve(f,row,supervisor,2));
            int pid=awaitWaiter("SELECT pid FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%INSERT INTO wok.audit_logs%'",null);
            // UPDATE metadata and its resolved_by FK succeeded while user NO KEY UPDATE is held.
            // A KEY SHARE probe on the attempt also completes: no unintended unique-key upgrade.
            try(var q=probe.prepareStatement("SELECT id FROM wok.payment_attempts WHERE id=? FOR KEY SHARE")){q.setQueryTimeout(2);q.setObject(1,id(row));assertThat(q.executeQuery().next()).isTrue();}
            assertThat(body(get(path(f,row),f.token())).path("status").asText()).isEqualTo("PENDING");
            Future<HttpResponse<String>> late=pool.submit(()->post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":2}"));
            awaitWaiter("SELECT pid FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%FOR NO KEY UPDATE%'",pid);
            Future<HttpResponse<String>> successor=pool.submit(()->post(base(f),f.token(),payload("20",id(row))));
            awaitWaiter("SELECT pid FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%SELECT id FROM wok.order_accounts%'",pid);
            gate.createStatement().execute("SELECT pg_advisory_unlock("+guard+")");
            assertThat(resolving.get(15,TimeUnit.SECONDS).statusCode()).isEqualTo(200);
            assertThat(late.get(15,TimeUnit.SECONDS).statusCode()).isEqualTo(409);
            assertThat(successor.get(15,TimeUnit.SECONDS).statusCode()).isEqualTo(200);
            assertThat(financialCount(f)).isZero();assertThat(audits(id(row))).isEqualTo(1);
            assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE previous_attempt_id=?",id(row))).isEqualTo(1);
            System.out.println("F04B resolution FK/user KEY SHARE and metadata NO KEY UPDATE compatible; committed retirement fences late capture and serializes successor");
            userMutex.rollback();
        } finally {pool.shutdownNow();jdbc.execute("DROP TRIGGER f04b_resolution_gate ON wok.audit_logs");jdbc.execute("DROP FUNCTION wok.f04b_resolution_gate()");}
    }

    @Test void contextLegacyBridgeAndAdministrativeQueueAreReadOnlyAndDoNotExposeKeys() {
        Fixture f=fixture("100");UUID key=UUID.randomUUID();
        UUID attempt=attempts.prepareLegacy(f.actor(),UUID.randomUUID(),f.account(),key,
                new PaymentService.Normalized(PaymentController.PaymentMethod.TRANSFER,new java.math.BigDecimal("25.00"),java.math.BigDecimal.ZERO,null,"MAIN","F04B-fixture-hash"));
        String before=snapshot(f,attempt),base=base(f),supervisor=admin();
        JsonNode context=body(get(base+"/context",f.token()));assertThat(context.path("ownActiveAttempt").path("attemptId").asText()).isEqualTo(attempt.toString());
        assertThat(context.path("canPrepare").asBoolean()).isFalse();
        JsonNode bridge=body(get(base+"/by-legacy-key/"+key,f.token()));assertThat(bridge.path("attemptId").asText()).isEqualTo(attempt.toString());
        assertThat(bridge.toString()).doesNotContain(key.toString(),"request_hash","capture_key");
        String other=tokenForRole("OPERATIONAL");
        assertThat(get(base+"/by-legacy-key/"+key,other).statusCode()).isEqualTo(404);
        JsonNode blocked=body(get(base+"/context",other));assertThat(blocked.path("blockedByAnotherOperator").asBoolean()).isTrue();assertThat(blocked.path("ownActiveAttempt").isMissingNode() || blocked.path("ownActiveAttempt").isNull()).isTrue();
        assertThat(get(base+"/context",tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
        assertThat(get(base+"/by-legacy-key/"+UUID.randomUUID(),f.token()).statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/operational/payment-attempt-resolutions",other).statusCode()).isEqualTo(403);
        JsonNode queue=body(get("/api/v1/operational/payment-attempt-resolutions?accountId="+f.account(),supervisor));assertThat(queue.path("items")).hasSize(1);
        assertThat(queue.toString()).doesNotContain(key.toString(),"reference","registerCode","evidenceSummary");
        assertThat(snapshot(f,attempt)).isEqualTo(before);
        JsonNode row=body(get(base+"/"+attempt,f.token()));body(resolve(f,row,supervisor,1));
        assertThat(post(path(f,row)+"/capture",f.token(),"{\"expectedVersion\":1}").statusCode()).isEqualTo(409);
        JsonNode unblocked=body(get(base+"/context",other));assertThat(unblocked.path("canPrepare").asBoolean()).isTrue();assertThat(unblocked.path("expectedPreviousAttemptId").asText()).isEqualTo(attempt.toString());
        assertThat(post(base,other,payload("20",attempt)).statusCode()).isEqualTo(200);
    }

    @Test void queuePaginatesFiftyPlusSixWithoutForeignScopeOrNormalCursorLeak() {
        UUID actor=createUserWithRole("queue-"+UUID.randomUUID()+"@wok.test","OPERATIONAL");
        List<UUID> ids=new ArrayList<>();String supervisor=admin();
        for(int i=0;i<56;i++) {
            UUID account=UUID.randomUUID();jdbc.update("INSERT INTO wok.order_accounts(id,name,opened_by) VALUES (?,'F04B queue',?)",account,actor);
            UUID id=UUID.randomUUID();ids.add(id);
            jdbc.update("INSERT INTO wok.payment_attempts(id,account_id,created_by,sequence,amount,tip_amount,currency_id,method,register_code,capture_key,request_hash,legacy,request_id) SELECT ?,?,?,1,1,0,id,'TRANSFER','MAIN',?,'queue-fingerprint',false,? FROM wok.currencies WHERE code='GTQ'",id,account,actor,UUID.randomUUID(),UUID.randomUUID());
        }
        // The global queue can include fixtures from other tests; follow every page and check these IDs.
        Set<String> observed=new HashSet<>();String cursor=null;
        do {JsonNode page=body(get("/api/v1/operational/payment-attempt-resolutions"+(cursor==null?"":"?cursor="+cursor),supervisor));
            assertThat(page.path("items").size()).isLessThanOrEqualTo(50);for(JsonNode item:page.path("items"))assertThat(observed.add(item.path("attemptId").asText())).isTrue();
            cursor=page.path("nextCursor").isMissingNode() || page.path("nextCursor").isNull()?null:page.path("nextCursor").asText();
        }while(cursor!=null);
        assertThat(observed).containsAll(ids.stream().map(UUID::toString).toList());
        assertThat(get("/api/v1/operational/payment-attempt-resolutions?cursor="+ids.getFirst(),supervisor).statusCode()).isEqualTo(400);
        UUID account=jdbc.queryForObject("SELECT account_id FROM wok.payment_attempts WHERE id=?",UUID.class,ids.getFirst());
        assertThat(get("/api/v1/operational/payment-attempt-resolutions?accountId="+account+"&cursor=resolution:"+ids.getLast(),supervisor).statusCode()).isEqualTo(404);
    }

    @Test void legacyBridgeNeverBackfillsHistoricalClaimsAndContextRejectsAnomalousBalances() {
        Fixture history=fixture("100");UUID payment=UUID.randomUUID(),key=UUID.randomUUID();
        jdbc.update("INSERT INTO wok.payments(id,account_id,amount,currency_id,method,captured_by) SELECT ?,?,40,id,'TRANSFER',? FROM wok.currencies WHERE code='GTQ'",payment,history.account(),history.actor());
        jdbc.update("INSERT INTO wok.idempotency_keys(principal_scope,operation,key,request_hash,status,resource_id,locked_until,expires_at) VALUES (?,'ACCOUNT_PAYMENT_CAPTURED',?,'fictitious-historical-hash','COMPLETED',?,now(),now()+interval '1 day')",history.actor().toString(),key.toString(),payment);
        String before=protocolSnapshot(history);
        assertThat(get(base(history)+"/by-legacy-key/"+key,history.token()).statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/operational/accounts/"+history.account()+"/payments/by-idempotency-key/"+key,history.token()).statusCode()).isEqualTo(200);
        assertThat(protocolSnapshot(history)).isEqualTo(before);
        assertThat(count("SELECT count(*) FROM wok.payment_attempts WHERE account_id=?",history.account())).isZero();
        Fixture negative=fixture("100");jdbc.update("INSERT INTO wok.payments(account_id,amount,currency_id,method,captured_by) SELECT ?,101,id,'TRANSFER',? FROM wok.currencies WHERE code='GTQ'",negative.account(),negative.actor());
        assertThat(body(get(base(negative)+"/context",negative.token())).path("canPrepare").asBoolean()).isFalse();
        Fixture currencies=fixture("100");jdbc.update("INSERT INTO wok.payments(account_id,amount,currency_id,method,captured_by) SELECT ?,100,id,'TRANSFER',? FROM wok.currencies WHERE code='USD'",currencies.account(),currencies.actor());
        assertThat(body(get(base(currencies)+"/context",currencies.token())).path("canPrepare").asBoolean()).isFalse();
    }
}
