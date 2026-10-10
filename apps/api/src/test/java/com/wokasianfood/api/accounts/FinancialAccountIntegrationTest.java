package com.wokasianfood.api.accounts;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

class FinancialAccountIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void listsEveryOpenPartialAndPaidAccountWithoutDependingOnTwoHundredOrders() {
        Fixture f = fixture();
        UUID second = account(f.actor(), f.table());
        UUID third = account(f.actor(), f.table());
        UUID empty = account(f.actor(), f.table());
        for (int i = 0; i < 205; i++) order(f.account(), f, "SERVED", "1.00", "GTQ");
        order(second, f, "SERVED", "40.00", "GTQ");
        order(third, f, "SERVED", "20.00", "GTQ");
        assertThat(pay(f, second, "TRANSFER", "10", "MAIN", key()).statusCode()).isEqualTo(201);
        assertThat(pay(f, third, "TRANSFER", "20", "MAIN", key()).statusCode()).isEqualTo(201);
        JsonNode listed = body(get("/api/v1/operational/accounts?tableId=" + f.table(), f.token()));
        assertThat(listed).hasSize(4);
        assertThat(ids(listed)).containsExactlyInAnyOrder(f.account().toString(), second.toString(), third.toString(), empty.toString());
        JsonNode original = find(listed, f.account());
        assertThat(original.path("orderCount").asInt()).isEqualTo(205);
        assertThat(original.path("total").decimalValue()).isEqualByComparingTo("205");
        assertThat(find(listed, second).path("balance").decimalValue()).isEqualByComparingTo("30");
        assertThat(find(listed, third).path("account").path("status").asText()).isEqualTo("PAID");
        assertThat(post("/api/v1/operational/tables/" + f.table() + "/close", f.token(), null).statusCode()).isEqualTo(409);
    }

    @Test
    void financialPermissionReadsFrozenProductsWithoutOperationalOrderPermission() {
        Fixture f = fixture();
        UUID order = order(f.account(), f, "SERVED", "24.50", "GTQ");
        jdbc.update("INSERT INTO wok.preparation_areas(code,name) VALUES ('FIN_TEST','Financial test') ON CONFLICT DO NOTHING");
        jdbc.update("INSERT INTO wok.item_types(code,name) VALUES ('DISH','Plato') ON CONFLICT DO NOTHING");
        jdbc.update("INSERT INTO wok.units(code,name,dimension,factor_to_base) VALUES ('UNIT','Unidad','COUNT',1) ON CONFLICT DO NOTHING");
        jdbc.update("INSERT INTO wok.menu_categories(name) VALUES ('Financial test') ON CONFLICT DO NOTHING");
        UUID inventoryItem = jdbc.queryForObject("""
            INSERT INTO wok.items(sku,name,item_type_id,base_unit_id)
            SELECT ?, 'Financial item', t.id,u.id FROM wok.item_types t CROSS JOIN wok.units u
            WHERE t.code='DISH' AND u.code='UNIT' RETURNING id
            """, UUID.class, ("FIN-"+UUID.randomUUID()).toUpperCase(java.util.Locale.ROOT));
        UUID menu = jdbc.queryForObject("""
            INSERT INTO wok.menu_items(item_id,category_id,preparation_area_id,name,price,currency_id,visibility,status)
            SELECT ?,c.id,a.id,'Producto congelado',12.25,m.id,'PUBLIC','ACTIVE'
            FROM wok.menu_categories c CROSS JOIN wok.preparation_areas a CROSS JOIN wok.currencies m
            WHERE c.name='Financial test' AND a.code='FIN_TEST' AND m.code='GTQ' RETURNING id
            """, UUID.class,inventoryItem);
        jdbc.update("""
            INSERT INTO wok.order_items(order_id,menu_item_id,name_snapshot,quantity,unit_price,preparation_area_id)
            SELECT ?, ?, 'Producto congelado', 2, 12.25, id FROM wok.preparation_areas WHERE code='FIN_TEST'
            """, order,menu);
        jdbc.update("UPDATE wok.menu_items SET price=99,name='Precio nuevo' WHERE id=?",menu);
        String reader = financialToken();
        JsonNode details = body(get("/api/v1/operational/accounts/" + f.account(), reader));
        JsonNode item = details.path("orders").get(0).path("items").get(0);
        assertThat(item.path("name").asText()).isEqualTo("Producto congelado");
        assertThat(item.path("quantity").asInt()).isEqualTo(2);
        assertThat(item.path("unitPrice").decimalValue()).isEqualByComparingTo("12.25");
        assertThat(item.path("lineTotal").decimalValue()).isEqualByComparingTo("24.50");
        assertThat(get("/api/v1/operational/accounts?tableId=" + f.table(), reader).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/operational/orders/" + order, reader).statusCode()).isEqualTo(403);
        assertThat(patch("/api/v1/operational/orders/" + order + "/status", reader,
                "{\"status\":\"CLOSED\",\"expectedVersion\":1}").statusCode()).isEqualTo(403);
        assertThat(post("/api/v1/operational/tables/" + f.table() + "/close", reader, null).statusCode()).isEqualTo(403);
    }

    @Test
    void separatesCurrenciesAndExcludesCancelledConsumption() {
        Fixture f = fixture();
        jdbc.update("INSERT INTO wok.currencies(code,name) VALUES ('USD','Dollar') ON CONFLICT DO NOTHING");
        order(f.account(), f, "SERVED", "10.10", "GTQ");
        order(f.account(), f, "SERVED", "5.20", "USD");
        order(f.account(), f, "CANCELLED", "999", "GTQ");
        JsonNode d = body(get("/api/v1/operational/accounts/" + f.account(), f.token()));
        assertThat(d.path("total").isMissingNode()).isTrue();
        assertThat(d.path("balance").isMissingNode()).isTrue();
        assertThat(d.path("currencyTotals")).hasSize(2);
        for (JsonNode t : d.path("currencyTotals"))
            assertThat(t.path("total").decimalValue()).isEqualByComparingTo(t.path("currency").asText().equals("GTQ") ? "10.10" : "5.20");
        assertThat(pay(f, f.account(), "TRANSFER", "1", "MAIN", key()).statusCode()).isEqualTo(422);
        assertThat(get("/api/v1/operational/accounts/" + f.account(), null).statusCode()).isEqualTo(401);
        assertThat(get("/api/v1/operational/accounts/" + f.account(), tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
    }

    @Test
    void cashPaymentCannotMixAccountCurrencyIntoAnotherCurrencyRegister() {
        Fixture f = fixture();
        jdbc.update("INSERT INTO wok.currencies(code,name) VALUES ('USD','Dollar') ON CONFLICT DO NOTHING");
        order(f.account(), f, "SERVED", "10", "USD");
        String register = "FX_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(java.util.Locale.ROOT);
        jdbc.update("INSERT INTO wok.cash_registers(code,name,currency_id) SELECT ?, 'Currency test', id FROM wok.currencies WHERE code='GTQ'", register);
        JsonNode opened = body(post("/api/v1/operational/cash-sessions", f.token(),
                "{\"registerCode\":\"" + register + "\",\"openingFloat\":100}", key()));
        assertThat(opened.path("currency").asText()).isEqualTo("GTQ");
        assertThat(pay(f, f.account(), "CASH", "10", register, key()).statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wok.payments WHERE account_id=?", Integer.class, f.account())).isZero();
        JsonNode unchanged = body(get("/api/v1/operational/cash-sessions/" + opened.path("id").asText(), f.token()));
        assertThat(unchanged.path("expectedCash").decimalValue()).isEqualByComparingTo("100");
        assertThat(unchanged.path("rowVersion").asInt()).isEqualTo(1);
        assertThat(pay(f, f.account(), "TRANSFER", "10", register, key()).statusCode()).isEqualTo(201);
    }

    @Test
    void refusesToSubtractLegacyPaymentsInAnotherCurrency() {
        Fixture f = fixture();
        jdbc.update("INSERT INTO wok.currencies(code,name) VALUES ('USD','Dollar') ON CONFLICT DO NOTHING");
        order(f.account(), f, "SERVED", "20", "USD");
        jdbc.update("""
                INSERT INTO wok.payments(account_id,amount,currency_id,method,captured_by,request_id)
                SELECT ?, 5, id, 'TRANSFER', ?, ? FROM wok.currencies WHERE code='GTQ'
                """, f.account(), f.actor(), UUID.randomUUID());
        assertThat(pay(f, f.account(), "TRANSFER", "1", "MAIN", key()).statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wok.payments WHERE account_id=?", Integer.class, f.account())).isEqualTo(1);
        JsonNode detail = body(get("/api/v1/operational/accounts/" + f.account(), f.token()));
        assertThat(detail.path("currencyTotals")).hasSize(2);
        assertThat(detail.path("balance").isMissingNode()).isTrue();
    }

    @Test
    void confirmationRequiresOriginalOperatorPermissionAndAccountAndDoesNotWrite() {
        Fixture f = fixture();
        order(f.account(), f, "SERVED", "30", "GTQ");
        Map<String,String> key = key();
        String lookup = "/api/v1/operational/accounts/" + f.account() + "/payments/by-idempotency-key/" + key.get("Idempotency-Key");
        assertThat(get(lookup, f.token()).statusCode()).isEqualTo(404);
        JsonNode captured = body(pay(f, f.account(), "TRANSFER", "10", "MAIN", key));
        assertThat(body(get(lookup, f.token())).path("paymentId").asText()).isEqualTo(captured.path("paymentId").asText());
        assertThat(get(lookup, tokenForRole("OPERATIONAL")).statusCode()).isEqualTo(404);
        assertThat(get(lookup.replace(f.account().toString(), account(f.actor(), f.table()).toString()), f.token()).statusCode()).isEqualTo(404);
        assertThat(get(lookup, tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
        assertThat(get(lookup, null).statusCode()).isEqualTo(401);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id=?", f.account())).isEqualTo(1);
        assertThat(body(pay(f, f.account(), "TRANSFER", "10", "MAIN", key)).path("idempotentReplay").asBoolean()).isTrue();
    }

    @Test
    void cashCaptureInvalidatesTheOriginalCountAndReplayDoesNotChangeVersionAgain() {
        Fixture f = fixture();
        order(f.account(), f, "SERVED", "30", "GTQ");
        Cash cash = cash(f);
        Map<String,String> key = key();
        assertThat(pay(f, f.account(), "CASH", "10", cash.code(), key).statusCode()).isEqualTo(201);
        JsonNode after = body(get("/api/v1/operational/cash-sessions/" + cash.id(), f.token()));
        assertThat(after.path("rowVersion").asInt()).isEqualTo(2);
        assertThat(after.path("expectedCash").decimalValue()).isEqualByComparingTo("110");
        assertThat(close(f, cash, 1, "100").statusCode()).isEqualTo(409);
        assertThat(pay(f, f.account(), "CASH", "10", cash.code(), key).statusCode()).isEqualTo(201);
        assertThat(body(get("/api/v1/operational/cash-sessions/" + cash.id(), f.token())).path("rowVersion").asInt()).isEqualTo(2);
        assertThat(close(f, cash, 2, "110").statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/operational/accounts/" + f.account() + "/payments/by-idempotency-key/" + key.get("Idempotency-Key"), f.token()).statusCode()).isEqualTo(200);
    }

    @Test
    void closingSessionDoesNotAcceptNewCashCaptures() {
        Fixture f = fixture();
        order(f.account(), f, "SERVED", "30", "GTQ");
        Cash cash = cash(f);
        jdbc.update("UPDATE wok.cash_sessions SET status='CLOSING' WHERE id=?", cash.id());
        assertThat(pay(f, f.account(), "CASH", "10", cash.code(), key()).statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id=?", f.account())).isZero();
    }

    @RepeatedTest(5)
    void concurrentCaptureAndCloseEitherInvalidatesCountOrRejectsCaptureAtomically() throws Exception {
        Fixture f = fixture();
        order(f.account(), f, "SERVED", "30", "GTQ");
        Cash cash = cash(f);
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var payment = pool.submit(() -> {ready.countDown(); start.await(); return pay(f, f.account(), "CASH", "30", cash.code(), key());});
            var closing = pool.submit(() -> {ready.countDown(); start.await(); return close(f, cash, 1, "100");});
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue(); start.countDown();
            int p = payment.get(15, TimeUnit.SECONDS).statusCode(), c = closing.get(15, TimeUnit.SECONDS).statusCode();
            assertThat(List.of(p,c)).isIn(List.of(201,409), List.of(409,200));
            JsonNode d = body(get("/api/v1/operational/cash-sessions/" + cash.id(), f.token()));
            assertThat(d.path("expectedCash").decimalValue()).isEqualByComparingTo(p == 201 ? "130" : "100");
            assertThat(d.path("status").asText()).isEqualTo(c == 200 ? "CLOSED" : "OPEN");
            assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id=?", f.account())).isEqualTo(p == 201 ? 1 : 0);
            assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id=? AND movement_type='SALE'", cash.id())).isEqualTo(p == 201 ? 1 : 0);
        }
    }

    private Fixture fixture() {
        UUID actor = createUserWithRole("financial-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID table = UUID.fromString(body(post("/api/v1/operational/tables", token,
                "{\"name\":\"Financial " + UUID.randomUUID().toString().substring(0,8) + "\",\"capacity\":4,\"zone\":\"SALON\"}")).path("id").asText());
        return new Fixture(actor, token, table, account(actor,table));
    }
    private UUID account(UUID actor, UUID table) {
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO wok.order_accounts(id,dining_table_id,name,opened_by) VALUES (?,?,?,?)", id,table,"F " + id,actor);
        jdbc.update("UPDATE wok.dining_tables SET current_status='OCCUPIED' WHERE id=?",table);
        return id;
    }
    private UUID order(UUID account, Fixture f, String status, String total, String currency) {
        UUID id=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.orders(id,code,account_id,dining_table_id,channel,status,subtotal,total,currency_id,opened_by)
            SELECT ?,?,?,?,'DINE_IN',?,?::numeric,?::numeric,id,? FROM wok.currencies WHERE code=?
            """,id,"FIN-"+id,account,f.table(),status,total,total,f.actor(),currency);
        return id;
    }
    private String financialToken() {
        String role="FIN_"+UUID.randomUUID().toString().substring(0,8).toUpperCase();
        jdbc.update("INSERT INTO wok.roles(code,name) VALUES (?, 'Financial test')",role);
        jdbc.update("INSERT INTO wok.role_permissions(role_id,permission_id) SELECT r.id,p.id FROM wok.roles r CROSS JOIN wok.permissions p WHERE r.code=? AND p.code='payments:manage'",role);
        return tokenForRole(role);
    }
    private Cash cash(Fixture f) {
        String code=("FIN_"+UUID.randomUUID().toString().substring(0,8)).toUpperCase();
        jdbc.update("INSERT INTO wok.cash_registers(code,name,currency_id) SELECT ?,'Financial test',id FROM wok.currencies WHERE code='GTQ'",code);
        UUID id=UUID.fromString(body(post("/api/v1/operational/cash-sessions",f.token(),"{\"registerCode\":\""+code+"\",\"openingFloat\":100}",key())).path("id").asText());
        return new Cash(code,id);
    }
    private HttpResponse<String> pay(Fixture f,UUID account,String method,String amount,String register,Map<String,String> key) {
        return post("/api/v1/operational/accounts/"+account+"/payments",f.token(),"{\"method\":\""+method+"\",\"amount\":"+amount+",\"registerCode\":\""+register+"\"}",key);
    }
    private HttpResponse<String> close(Fixture f,Cash cash,int version,String amount) {
        return post("/api/v1/operational/cash-sessions/"+cash.id()+"/close",f.token(),"{\"countedCash\":"+amount+",\"expectedVersion\":"+version+"}");
    }
    private Map<String,String> key(){return Map.of("Idempotency-Key",UUID.randomUUID().toString());}
    private int count(String sql,Object... args){return jdbc.queryForObject(sql,Integer.class,args);}
    private JsonNode body(HttpResponse<String> response){assertThat(response.statusCode()).as(response.body()).isBetween(200,299);try{return json.readTree(response.body());}catch(Exception e){throw new IllegalStateException(e);}}
    private List<String> ids(JsonNode list){return java.util.stream.StreamSupport.stream(list.spliterator(),false).map(n->n.path("account").path("id").asText()).toList();}
    private JsonNode find(JsonNode list,UUID id){return java.util.stream.StreamSupport.stream(list.spliterator(),false).filter(n->n.path("account").path("id").asText().equals(id.toString())).findFirst().orElseThrow();}
    private record Fixture(UUID actor,String token,UUID table,UUID account){}
    private record Cash(String code,UUID id){}

    @Test
    void confirmedPaymentWithLaterIncompatibleDataNeverRecapturesOrLosesEvidence() throws Exception {
        Fixture f=fixture(); order(f.account(),f,"SERVED","100","GTQ");
        Map<String,String> key=key(); JsonNode original=body(pay(f,f.account(),"TRANSFER","30","MAIN",key));
        UUID payment=UUID.fromString(original.path("paymentId").asText());
        jdbc.update("INSERT INTO wok.currencies(code,name) VALUES ('USD','Dollar') ON CONFLICT DO NOTHING");
        order(f.account(),f,"SERVED","20","USD");
        int audit=count("SELECT count(*) FROM wok.audit_logs WHERE entity_id=?",payment);
        String lookup="/api/v1/operational/accounts/"+f.account()+"/payments/by-idempotency-key/"+key.get("Idempotency-Key");
        for (HttpResponse<String> response: List.of(get(lookup,f.token()),pay(f,f.account(),"TRANSFER","30","MAIN",key))) {
            assertThat(response.statusCode()).isEqualTo(409);
            String message=json.readTree(response.body()).path("message").asText();
            assertThat(message).contains(payment.toString(),"registrado","conciliación");
        }
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id=?",f.account())).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id=?",payment)).isEqualTo(audit);
        assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE key=? AND status='COMPLETED' AND resource_id=?",key.get("Idempotency-Key"),payment)).isEqualTo(1);
        assertThat(body(get("/api/v1/operational/accounts/"+f.account(),f.token())).path("payments")).hasSize(1);
        assertThat(get(lookup,tokenForRole("OPERATIONAL")).statusCode()).isEqualTo(404);
        assertThat(get(lookup,tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
        assertThat(get(lookup,null).statusCode()).isEqualTo(401);
    }

}
