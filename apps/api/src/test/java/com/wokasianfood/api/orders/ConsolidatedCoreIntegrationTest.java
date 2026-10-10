package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.identity.PhoneVerificationProvider;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;

/** HTTP + durable state on an isolated Testcontainers database. No real OTP transport. */
@Import(ConsolidatedCoreIntegrationTest.FakeTransportConfiguration.class)
class ConsolidatedCoreIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json=new ObjectMapper();
    @Autowired OrderCapacityHoldService holds;
    @Autowired FakePhoneTransport transport;
    @BeforeEach void policy(){
        jdbc.update("UPDATE wok.service_policy SET hold_minutes=12,table_last_arrival='21:15',delivery_review_from='20:00',pickup_last_arrival='21:30',pickup_new_preparation_until='21:20' WHERE id=1");
        jdbc.update("INSERT INTO wok.service_capabilities(code,status) VALUES('DELIVERY','ENABLED') ON CONFLICT(code) DO UPDATE SET status='ENABLED',effective_until=NULL");
        jdbc.update("INSERT INTO wok.business_hours(service_type,weekday,opens_at,closes_at,timezone_name) SELECT 'RESTAURANT',day,'00:00'::time,'23:59:59'::time,'America/Guatemala' FROM generate_series(1,7) day");
    }
    @Test void quoteDoesNotHoldAndFormalSubmissionHasExactTwelveMinuteLeaseAndOwnedReplay(){
        String client=tokenForRole("CLIENT");Product p=product("25.00",10);String raw=pickup(p.id());
        String quoted=withCoreQuote(client,raw,"PICKUP");
        assertThat(count("SELECT count(*) FROM wok.order_capacity_hold_inventory WHERE item_id=?",p.component())).isZero();
        UUID key=UUID.randomUUID();JsonNode receipt=body(post("/api/v1/client/order-requests",client,quoted,key(key)));UUID id=id(receipt,"requestId");
        assertThat(jdbc.queryForObject("SELECT extract(epoch FROM expires_at-created_at)::integer FROM wok.order_capacity_holds WHERE order_request_id=?",Integer.class,id)).isEqualTo(720);
        assertThat(count("SELECT count(*) FROM wok.order_capacity_hold_inventory i JOIN wok.order_capacity_holds h ON h.id=i.hold_id WHERE h.order_request_id=?",id)).isEqualTo(1);
        assertThat(body(post("/api/v1/client/order-requests",client,quoted,key(key))).path("idempotentReplay").asBoolean()).isTrue();
        assertThat(get("/api/v1/client/order-requests/"+id,tokenForRole("CLIENT")).statusCode()).isEqualTo(404);
        body(send("DELETE","/api/v1/client/order-requests/"+id,client,null,Map.of()));
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_capacity_holds WHERE order_request_id=?",String.class,id)).isEqualTo("RELEASED");
    }
    @Test void concurrentFormalAcceptancesCannotBothHoldLastStock()throws Exception{
        Product p=product("20.00",1);String a=tokenForRole("CLIENT"),b=tokenForRole("CLIENT");
        String qa=withCoreQuote(a,pickup(p.id()),"PICKUP"),qb=withCoreQuote(b,pickup(p.id()),"PICKUP");
        var gate=new CountDownLatch(1);
        var x=CompletableFuture.supplyAsync(()->gated(gate,"/api/v1/client/order-requests",a,qa));
        var y=CompletableFuture.supplyAsync(()->gated(gate,"/api/v1/client/order-requests",b,qb));gate.countDown();
        assertThat(List.of(x.get(20,TimeUnit.SECONDS).statusCode(),y.get(20,TimeUnit.SECONDS).statusCode())).containsExactlyInAnyOrder(202,409);
        assertThat(jdbc.queryForObject("SELECT coalesce(sum(i.quantity),0) FROM wok.order_capacity_hold_inventory i JOIN wok.order_capacity_holds h ON h.id=i.hold_id WHERE i.item_id=? AND h.status='ACTIVE'",BigDecimal.class,p.component())).isEqualByComparingTo("1");
    }
    @Test void expiryReclaimsDurablyAndCannotBeAcceptedOrBypassedByReplay(){
        String client=tokenForRole("CLIENT"),operator=tokenForRole("OPERATIONAL");Product p=product("20.00",1);String payload=withCoreQuote(client,pickup(p.id()),"PICKUP");UUID key=UUID.randomUUID();
        UUID request=id(body(post("/api/v1/client/order-requests",client,payload,key(key))),"requestId");
        jdbc.update("UPDATE wok.order_capacity_holds SET created_at=now()-interval '13 minutes',expires_at=now()-interval '1 minute' WHERE order_request_id=?",request);holds.expireDue();
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_capacity_holds WHERE order_request_id=?",String.class,request)).isEqualTo("EXPIRED");
        assertThat(post("/api/v1/operational/order-requests/"+request+"/decision",operator,"{\"action\":\"ACCEPT\"}").statusCode()).isEqualTo(409);
        assertThat(body(post("/api/v1/client/order-requests",client,payload,key(key))).path("requestId").asText()).isEqualTo(request.toString());
        String other=tokenForRole("CLIENT");body(post("/api/v1/client/order-requests",other,withCoreQuote(other,pickup(p.id()),"PICKUP"),key()));
    }
    @Test void priceChangeBeforeSubmissionRequiresFreshQuoteWithoutCreatingRequest(){
        String client=tokenForRole("CLIENT");Product p=product("20.00",2);String payload=withCoreQuote(client,pickup(p.id()),"PICKUP");
        jdbc.update("UPDATE wok.menu_items SET price=21 WHERE id=?",p.id());
        assertThat(post("/api/v1/client/order-requests",client,payload,key()).statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.order_requests WHERE customer_user_id=?",fixturePrincipal(client))).isZero();
    }
    @Test void fakeOtpNeverVerifiesPossessionAndNumberChangeInvalidatesEvenSeededVerification(){
        String client=tokenForRole("CLIENT");UUID user=fixturePrincipal(client);jdbc.update("UPDATE wok.users SET phone='+50255550101' WHERE id=?",user);
        JsonNode started=body(post("/api/v1/client/phone-verification",client,"{\"phone\":\"+50255550101\"}"));UUID challenge=id(started,"challengeId");
        String digest=jdbc.queryForObject("SELECT code_digest FROM wok.phone_verification_challenges WHERE id=?",String.class,challenge);
        assertThat(digest).doesNotContain(transport.codes.get(challenge));
        assertThat(post("/api/v1/client/phone-verification",client,"{\"phone\":\"+50255550101\"}").statusCode()).isEqualTo(429);
        JsonNode confirmed=body(post("/api/v1/client/phone-verification/confirm",client,"{\"challengeId\":\""+challenge+"\",\"code\":\""+transport.codes.get(challenge)+"\"}"));
        assertThat(confirmed.path("verified").asBoolean()).isFalse();
        Product p=product("20.00",2);String raw=delivery(p.id());String quoted=withCoreQuote(client,raw,"DELIVERY");
        assertThat(post("/api/v1/client/delivery-requests",client,quoted,key()).statusCode()).isEqualTo(422);
        verifiedPhoneFixture(client,"+50255550101");jdbc.update("UPDATE wok.users SET phone='+50255550102' WHERE id=?",user);
        assertThat(count("SELECT count(*) FROM wok.phone_verifications WHERE user_id=?",user)).isZero();
    }
    @Test void otpAttemptsExpiryAndOwnershipAreDurable(){
        String client=tokenForRole("CLIENT");UUID user=fixturePrincipal(client);jdbc.update("UPDATE wok.users SET phone='+50255550101' WHERE id=?",user);
        UUID challenge=id(body(post("/api/v1/client/phone-verification",client,"{\"phone\":\"+50255550101\"}")),"challengeId");
        String code=transport.codes.get(challenge).equals("000000")?"999999":"000000";
        for(int i=0;i<5;i++)assertThat(post("/api/v1/client/phone-verification/confirm",client,"{\"challengeId\":\""+challenge+"\",\"code\":\""+code+"\"}").statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT attempts FROM wok.phone_verification_challenges WHERE id=?",Integer.class,challenge)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.phone_verification_challenges WHERE id=?",String.class,challenge)).isEqualTo("FAILED");
        jdbc.update("UPDATE wok.phone_verification_challenges SET created_at=now()-interval '2 minutes' WHERE id=?",challenge);
        UUID exp=id(body(post("/api/v1/client/phone-verification",client,"{\"phone\":\"+50255550101\"}")),"challengeId");
        jdbc.update("UPDATE wok.phone_verification_challenges SET expires_at=now()-interval '1 second' WHERE id=?",exp);
        assertThat(post("/api/v1/client/phone-verification/confirm",client,"{\"challengeId\":\""+exp+"\",\"code\":\"000000\"}").statusCode()).isEqualTo(410);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.phone_verification_challenges WHERE id=?",String.class,exp)).isEqualTo("EXPIRED");
    }
    @Test void deliveryAtTwentyRequiresAdminReviewAndOperationalLogisticsAndReplay(){
        Product p=product("20.00",2);String client=tokenForRole("CLIENT"),operator=tokenForRole("OPERATIONAL"),admin=tokenForRole("ADMIN");verifiedPhoneFixture(client,"+50255550101");
        UUID request=id(body(post("/api/v1/client/delivery-requests",client,withCoreQuote(client,delivery(p.id()),"DELIVERY"),key())),"requestId");
        jdbc.update("UPDATE wok.order_requests SET created_at=?,policy_review_required=true WHERE id=?",Timestamp.from(LocalDate.now(com.wokasianfood.api.service.ServiceHoursPolicy.ZONE).atTime(20,0).atZone(com.wokasianfood.api.service.ServiceHoursPolicy.ZONE).toInstant()),request);
        String prefix="/api/v1/operational/order-requests/"+request;
        assertThat(post(prefix+"/decision",operator,"{\"action\":\"ACCEPT\"}").statusCode()).isEqualTo(409);
        assertThat(post(prefix+"/override",operator,"{\"reason\":\"Revisado\"}",key()).statusCode()).isEqualTo(403);
        UUID review=UUID.randomUUID();body(post(prefix+"/override",admin,"{\"reason\":\"Revisado\"}",key(review)));
        assertThat(post(prefix+"/decision",operator,"{\"action\":\"ACCEPT\"}").statusCode()).isEqualTo(409);
        UUID logistics=UUID.randomUUID();body(post(prefix+"/logistics-confirmation",operator,"{\"reason\":\"Ruta confirmada\"}",key(logistics)));
        body(post(prefix+"/decision",operator,"{\"action\":\"ACCEPT\"}"));
        body(post(prefix+"/logistics-confirmation",operator,"{\"reason\":\"Ruta confirmada\"}",key(logistics)));
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id=? AND action='DELIVERY_LOGISTICS_CONFIRMED'",request)).isEqualTo(1);
    }
    @Test void lastArrivalNeedsPreorderAndCheckinConversionIsExplicitAndIdempotent(){
        String client=tokenForRole("CLIENT"),operator=tokenForRole("OPERATIONAL");UUID actor=fixturePrincipal(operator);jdbc.update("INSERT INTO wok.customer_profiles(user_id,full_name) VALUES(?,'Cliente sintético') ON CONFLICT DO NOTHING",fixturePrincipal(client));Product p=product("20.00",3);table();
        String at=LocalDate.now(com.wokasianfood.api.service.ServiceHoursPolicy.ZONE).plusDays(2).atTime(21,15).atZone(com.wokasianfood.api.service.ServiceHoursPolicy.ZONE).toInstant().toString();
        String missing="{\"guests\":2,\"requestedAt\":\""+at+"\",\"preorder\":false,\"items\":[]}";
        assertThat(post("/api/v1/client/reservation-quotes",client,missing,key()).statusCode()).isEqualTo(422);
        String raw="{\"guests\":2,\"requestedAt\":\""+at+"\",\"preorder\":true,\"items\":[{\"menuItemId\":\""+p.id()+"\",\"quantity\":1}]}";
        UUID reservation=id(body(post("/api/v1/client/reservations",client,withCoreQuote(client,raw,"RESERVATION"),key())),"reservationId");
        assertThat(jdbc.queryForObject("SELECT preorder_order_id FROM wok.reservations WHERE id=?",UUID.class,reservation)).isNull();
        int version=jdbc.queryForObject("SELECT row_version FROM wok.reservations WHERE id=?",Integer.class,reservation);
        body(send("PUT","/api/v1/operational/reservations/"+reservation+"/decision",operator,"{\"decision\":\"CONFIRM\",\"reason\":\"Cupo revisado\",\"expectedVersion\":"+version+"}",Map.of("X-Request-Id",UUID.randomUUID().toString())));
        assertThat(jdbc.queryForObject("SELECT preorder_order_id FROM wok.reservations WHERE id=?",UUID.class,reservation)).isNull();
        Product alternative=product("22.00",3);
        UUID preorderLine=jdbc.queryForObject("SELECT i.id FROM wok.reservation_request_items i JOIN wok.reservation_evaluations e ON e.request_id=i.request_id WHERE e.reservation_id=?",UUID.class,reservation);
        int confirmedVersion=jdbc.queryForObject("SELECT row_version FROM wok.reservations WHERE id=?",Integer.class,reservation);
        String proposalPayload="{\"orderItemId\":\""+preorderLine+"\",\"replacementMenuItemId\":\""+alternative.id()+"\",\"expectedOrderVersion\":"+confirmedVersion+",\"reason\":\"Alternativa de preorden agotada\"}";
        UUID proposal=id(body(post("/api/v1/operational/reservations/"+reservation+"/preorder-substitutions",operator,proposalPayload,key())),"id");
        assertThat(post("/api/v1/operational/preorder-substitutions/"+proposal+"/decision",operator,"{\"apply\":true,\"expectedVersion\":1,\"override\":false,\"reason\":\"Revisión manual\"}",key()).statusCode()).isEqualTo(409);
        String consent="{\"accept\":true,\"expectedVersion\":1}";UUID consentKey=UUID.randomUUID();
        assertThat(post("/api/v1/client/preorder-substitutions/"+proposal+"/decision",tokenForRole("CLIENT"),consent,key()).statusCode()).isEqualTo(404);
        body(post("/api/v1/client/preorder-substitutions/"+proposal+"/decision",client,consent,key(consentKey)));
        body(post("/api/v1/client/preorder-substitutions/"+proposal+"/decision",client,consent,key(consentKey)));
        UUID applyKey=UUID.randomUUID();String apply="{\"apply\":true,\"expectedVersion\":2,\"override\":false,\"reason\":\"Aplicar consentimiento sin cocina\"}";
        body(post("/api/v1/operational/preorder-substitutions/"+proposal+"/decision",operator,apply,key(applyKey)));
        body(post("/api/v1/operational/preorder-substitutions/"+proposal+"/decision",operator,apply,key(applyKey)));
        assertThat(jdbc.queryForObject("SELECT menu_item_id FROM wok.reservation_request_items WHERE id=?",UUID.class,preorderLine)).isEqualTo(alternative.id());
        assertThat(jdbc.queryForObject("SELECT preorder_order_id FROM wok.reservations WHERE id=?",UUID.class,reservation)).isNull();
        UUID assigned=jdbc.queryForObject("SELECT table_id FROM wok.reservation_table_assignments WHERE reservation_id=?",UUID.class,reservation);
        UUID account=jdbc.queryForObject("INSERT INTO wok.order_accounts(dining_table_id,name,opened_by) VALUES(?, ?,?) RETURNING id",UUID.class,assigned,"Preorden prueba",actor);
        version=jdbc.queryForObject("SELECT row_version FROM wok.reservations WHERE id=?",Integer.class,reservation);UUID key=UUID.randomUUID();String payload="{\"accountId\":\""+account+"\",\"expectedVersion\":"+version+"}";
        JsonNode converted=body(post("/api/v1/operational/reservations/"+reservation+"/preorder-conversion",operator,payload,key(key)));
        assertThat(body(post("/api/v1/operational/reservations/"+reservation+"/preorder-conversion",operator,payload,key(key))).path("orderId")).isEqualTo(converted.path("orderId"));
        assertThat(count("SELECT count(*) FROM wok.kitchen_tickets WHERE order_id=?",id(converted,"orderId"))).isEqualTo(1);
        UUID convertedOrder=id(converted,"orderId"),convertedItem=jdbc.queryForObject("SELECT id FROM wok.order_items WHERE order_id=?",UUID.class,convertedOrder);
        int orderVersion=jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id=?",Integer.class,convertedOrder);
        UUID convertedProposal=id(body(post("/api/v1/operational/reservations/"+reservation+"/order-substitutions",operator,"{\"orderItemId\":\""+convertedItem+"\",\"replacementMenuItemId\":\""+p.id()+"\",\"expectedOrderVersion\":"+orderVersion+",\"reason\":\"Alternativa tras checkin\"}",key())),"id");
        body(post("/api/v1/client/substitutions/"+convertedProposal+"/decision",client,"{\"accept\":true,\"expectedVersion\":1}",key()));
        body(post("/api/v1/operational/substitutions/"+convertedProposal+"/decision",operator,"{\"apply\":true,\"expectedVersion\":2,\"override\":false,\"reason\":\"Aplicar decisión del cliente\"}",key()));
        assertThat(jdbc.queryForObject("SELECT menu_item_id FROM wok.order_items WHERE id=?",UUID.class,convertedItem)).isEqualTo(p.id());
    }
    @Test void substitutionNeedsOwnedConsentAndPaidDifferenceHasNoFictionalFinancialEffect(){
        Accepted f=accepted();Product replacement=product("23.00",2);
        jdbc.update("INSERT INTO wok.payments(account_id,amount,currency_id,method,captured_by,request_id) SELECT ?,20,currency_id,'TRANSFER',?,? FROM wok.orders WHERE id=?",f.account(),fixturePrincipal(f.operator()),UUID.randomUUID(),f.order());
        int payments=count("SELECT count(*) FROM wok.payments WHERE account_id=?",f.account());
        UUID proposal=propose(f,replacement.id());String consent="{\"accept\":true,\"expectedVersion\":1}";
        assertThat(post("/api/v1/client/substitutions/"+proposal+"/decision",tokenForRole("CLIENT"),consent,key()).statusCode()).isEqualTo(404);
        assertThat(body(post("/api/v1/client/substitutions/"+proposal+"/decision",f.client(),consent,key())).path("status").asText()).isEqualTo("FINANCIAL_REVIEW_REQUIRED");
        assertThat(post("/api/v1/operational/substitutions/"+proposal+"/decision",f.operator(),"{\"apply\":true,\"expectedVersion\":2,\"override\":false,\"reason\":\"Aplicar cambio\"}",key()).statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id=?",f.account())).isEqualTo(payments);
        assertThat(jdbc.queryForObject("SELECT total FROM wok.orders WHERE id=?",BigDecimal.class,f.order())).isEqualByComparingTo("20");
    }
    @Test void samePriceSubstitutionAppliesOnceAndDocumentsAreOwnedAndNonFiscal(){
        Accepted f=accepted();Product replacement=product("20.00",2);UUID proposal=propose(f,replacement.id());
        body(post("/api/v1/client/substitutions/"+proposal+"/decision",f.client(),"{\"accept\":true,\"expectedVersion\":1}",key()));
        String payload="{\"apply\":true,\"expectedVersion\":2,\"override\":false,\"reason\":\"Aplicar cambio\"}";UUID key=UUID.randomUUID();
        assertThat(body(post("/api/v1/operational/substitutions/"+proposal+"/decision",f.operator(),payload,key(key))).path("status").asText()).isEqualTo("APPLIED");body(post("/api/v1/operational/substitutions/"+proposal+"/decision",f.operator(),payload,key(key)));
        String path="/api/v1/client/order-requests/"+f.request()+"/documents/PREBILL";JsonNode document=body(get(path,f.client()));
        assertThat(document.path("notice").asText()).isEqualTo("COMPROBANTE / PRECUENTA — NO ES DTE — NO FEL CERTIFICADO");assertThat(document.path("html").asText()).doesNotContain("<script");
        assertThat(get(path,tokenForRole("CLIENT")).statusCode()).isEqualTo(404);
        body(get("/api/v1/operational/orders/"+f.order()+"/documents/COMMAND",f.operator()));
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id=?",f.account())).isZero();
    }
    @Test void lastTableCapacityIsExclusiveAndExpiredLeaseCannotConfirm()throws Exception {
        var active=jdbc.query("SELECT id FROM wok.dining_tables WHERE active=true",(rs,n)->rs.getObject(1,UUID.class));
        jdbc.update("UPDATE wok.dining_tables SET active=false");UUID table=table();
        try {
            String a=tokenForRole("CLIENT"),b=tokenForRole("CLIENT");for(String token:List.of(a,b))jdbc.update("INSERT INTO wok.customer_profiles(user_id,full_name) VALUES(?,'Cliente de cupo')",fixturePrincipal(token));
            String raw="{\"guests\":2,\"requestedAt\":\""+nextServiceSlot()+"\",\"preorder\":false,\"items\":[]}";
            String qa=withCoreQuote(a,raw,"RESERVATION"),qb=withCoreQuote(b,raw,"RESERVATION");var gate=new CountDownLatch(1);
            var x=CompletableFuture.supplyAsync(()->gated(gate,"/api/v1/client/reservations",a,qa));var y=CompletableFuture.supplyAsync(()->gated(gate,"/api/v1/client/reservations",b,qb));gate.countDown();
            var responses=List.of(x.get(20,TimeUnit.SECONDS),y.get(20,TimeUnit.SECONDS));assertThat(responses.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(202,409);
            UUID reservation=id(body(responses.stream().filter(r->r.statusCode()==202).findFirst().orElseThrow()),"reservationId");
            int heldVersion=jdbc.queryForObject("SELECT row_version FROM wok.reservations WHERE id=?",Integer.class,reservation);
            jdbc.update("UPDATE wok.dining_tables SET capacity=1 WHERE id=?",table);
            assertThat(send("PUT","/api/v1/operational/reservations/"+reservation+"/decision",tokenForRole("OPERATIONAL"),"{\"decision\":\"CONFIRM\",\"reason\":\"Cupo revisado\",\"expectedVersion\":"+heldVersion+"}",Map.of("X-Request-Id",UUID.randomUUID().toString())).statusCode()).isEqualTo(409);
            jdbc.update("UPDATE wok.dining_tables SET capacity=4 WHERE id=?",table);
            jdbc.update("UPDATE wok.reservation_capacity_holds SET created_at=now()-interval '13 minutes',expires_at=now()-interval '1 second' WHERE reservation_id=?",reservation);
            int version=jdbc.queryForObject("SELECT row_version FROM wok.reservations WHERE id=?",Integer.class,reservation);
            assertThat(send("PUT","/api/v1/operational/reservations/"+reservation+"/decision",tokenForRole("OPERATIONAL"),"{\"decision\":\"CONFIRM\",\"reason\":\"Cupo revisado\",\"expectedVersion\":"+version+"}",Map.of("X-Request-Id",UUID.randomUUID().toString())).statusCode()).isEqualTo(409);
        } finally {jdbc.update("UPDATE wok.dining_tables SET active=false WHERE id=?",table);for(UUID id:active)jdbc.update("UPDATE wok.dining_tables SET active=true WHERE id=?",id);}
    }
    @Test void preparingCancellationIsDeniedUnlessExplicitAuthorizedOverride(){
        Accepted f=accepted();int initial=jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id=?",Integer.class,f.order());body(patch("/api/v1/operational/orders/"+f.order()+"/status",f.operator(),"{\"status\":\"PREPARING\",\"expectedVersion\":"+initial+"}",Map.of("X-Request-Id",UUID.randomUUID().toString())));
        int current=jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id=?",Integer.class,f.order());String raw="{\"status\":\"CANCELLED\",\"expectedVersion\":"+current+",\"reason\":\"Revisión manual\"}";
        assertThat(patch("/api/v1/operational/orders/"+f.order()+"/status",f.operator(),raw,Map.of("X-Request-Id",UUID.randomUUID().toString())).statusCode()).isEqualTo(409);
        String override=raw.substring(0,raw.length()-1)+",\"override\":true}";
        assertThat(patch("/api/v1/operational/orders/"+f.order()+"/status",f.operator(),override,Map.of("X-Request-Id",UUID.randomUUID().toString())).statusCode()).isEqualTo(403);
        body(patch("/api/v1/operational/orders/"+f.order()+"/status",tokenForRole("ADMIN"),override,Map.of("X-Request-Id",UUID.randomUUID().toString())));
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id=?",String.class,f.order())).isEqualTo("CANCELLED");
    }
    @Test void noticeFormulaIsExactlyApproved(){assertThat(com.wokasianfood.api.service.ServiceHoursPolicy.minimumReservationMinutes(4)).isEqualTo(120);assertThat(com.wokasianfood.api.service.ServiceHoursPolicy.minimumReservationMinutes(5)).isEqualTo(135);assertThat(com.wokasianfood.api.service.ServiceHoursPolicy.minimumReservationMinutes(6)).isEqualTo(135);assertThat(com.wokasianfood.api.service.ServiceHoursPolicy.minimumReservationMinutes(7)).isEqualTo(150);}
    private UUID propose(Accepted f,UUID replacement){UUID item=jdbc.queryForObject("SELECT id FROM wok.order_items WHERE order_id=?",UUID.class,f.order());int version=jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id=?",Integer.class,f.order());return id(body(post("/api/v1/operational/order-requests/"+f.request()+"/substitutions",f.operator(),"{\"orderItemId\":\""+item+"\",\"replacementMenuItemId\":\""+replacement+"\",\"expectedOrderVersion\":"+version+",\"reason\":\"Agotado; alternativa\"}",key())),"id");}
    private Accepted accepted(){Product p=product("20.00",2);String client=tokenForRole("CLIENT"),operator=tokenForRole("OPERATIONAL");UUID request=id(body(post("/api/v1/client/order-requests",client,withCoreQuote(client,pickup(p.id()),"PICKUP"),key())),"requestId");UUID order=id(body(post("/api/v1/operational/order-requests/"+request+"/decision",operator,"{\"action\":\"ACCEPT\"}")),"orderId");return new Accepted(request,order,jdbc.queryForObject("SELECT account_id FROM wok.orders WHERE id=?",UUID.class,order),client,operator);}
    private HttpResponse<String> gated(CountDownLatch gate,String path,String token,String payload){try{gate.await();return post(path,token,payload,key());}catch(Exception e){throw new IllegalStateException(e);}}
    private String pickup(UUID item){return "{\"requestedFor\":\""+nextServiceSlot()+"\",\"items\":[{\"menuItemId\":\""+item+"\",\"quantity\":1}]}";}
    private String delivery(UUID item){return "{\"requestedFor\":\""+nextServiceSlot()+"\",\"address\":\"Dirección sintética\",\"contactPhone\":\"+50255550101\",\"paymentPreference\":\"CASH_ON_DELIVERY\",\"items\":[{\"menuItemId\":\""+item+"\",\"quantity\":1}]}";}
    private Map<String,String> key(){return key(UUID.randomUUID());}private Map<String,String> key(UUID key){return Map.of("Idempotency-Key",key.toString());}
    private UUID id(JsonNode body,String field){return UUID.fromString(body.path(field).asText());}
    private JsonNode body(HttpResponse<String> result){assertThat(result.statusCode()).as(result.body()).isBetween(200,299);try{return json.readTree(result.body());}catch(Exception e){throw new IllegalStateException(e);}}
    private int count(String sql,Object...args){return jdbc.queryForObject(sql,Integer.class,args);}
    private UUID table(){return jdbc.queryForObject("INSERT INTO wok.dining_tables(name,capacity,zone) VALUES(?,4,'TEST') RETURNING id",UUID.class,"CORE "+UUID.randomUUID());}
    private Product product(String price,int stock){
        String name="CORE_"+UUID.randomUUID().toString().replace("-","").substring(0,12).toUpperCase();jdbc.update("INSERT INTO wok.item_types(code,name) VALUES('DISH','Plato') ON CONFLICT DO NOTHING");jdbc.update("INSERT INTO wok.units(code,name,dimension,factor_to_base) VALUES('UNIT','Unidad','COUNT',1) ON CONFLICT DO NOTHING");
        UUID type=jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code='DISH'",UUID.class),unit=jdbc.queryForObject("SELECT id FROM wok.units WHERE code='UNIT'",UUID.class),currency=jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code='GTQ'",UUID.class);
        UUID station=jdbc.queryForObject("INSERT INTO wok.preparation_areas(code,name) VALUES(?,?) RETURNING id",UUID.class,name,name);
        UUID category=jdbc.queryForObject("INSERT INTO wok.menu_categories(name) VALUES(?) RETURNING id",UUID.class,name);
        UUID item=jdbc.queryForObject("INSERT INTO wok.items(sku,name,item_type_id,base_unit_id) VALUES(?,?,?,?) RETURNING id",UUID.class,name,name,type,unit);
        UUID component=jdbc.queryForObject("INSERT INTO wok.items(sku,name,item_type_id,base_unit_id) VALUES(?,?,?,?) RETURNING id",UUID.class,name+"_RESOURCE",name+" RESOURCE",type,unit);
        jdbc.update("INSERT INTO wok.inventory_balances(item_id,quantity_on_hand) VALUES(?,?)",component,stock);jdbc.update("INSERT INTO wok.item_recipe_components(parent_item_id,component_item_id,quantity) VALUES(?,?,1)",item,component);
        UUID menu=jdbc.queryForObject("INSERT INTO wok.menu_items(item_id,category_id,preparation_area_id,name,price,currency_id,visibility,status,estimated_preparation_seconds) VALUES(?,?,?,?,?,?,'PUBLIC','ACTIVE',60) RETURNING id",UUID.class,item,category,station,name,new BigDecimal(price),currency);return new Product(menu,component);
    }
    private record Product(UUID id,UUID component){}private record Accepted(UUID request,UUID order,UUID account,String client,String operator){}
    @TestConfiguration static class FakeTransportConfiguration{@Bean @Primary FakePhoneTransport fakePhoneTransport(){return new FakePhoneTransport();}}
    static class FakePhoneTransport implements PhoneVerificationProvider{final Map<UUID,String> codes=new ConcurrentHashMap<>();public boolean available(){return true;}public boolean provesRealPossession(){return false;}public void send(UUID id,String phone,String code,Instant expiry){codes.put(id,code);}}
}
