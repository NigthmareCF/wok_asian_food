package com.wokasianfood.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

class FinancialLifecycleIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void servedConsumptionRemainsPayableUntilZeroBalanceThenFinalizesAndReleases() {
        Fixture f = fixture();
        UUID order = order(f, "SERVED", "100.30");
        assertThat(finish(f, order).statusCode()).isEqualTo(409);
        assertThat(release(f).statusCode()).isEqualTo(409);
        assertThat(account(f).path("balance").decimalValue()).isEqualByComparingTo("100.30");

        String code = ("F01_" + UUID.randomUUID().toString().substring(0, 8)).toUpperCase(java.util.Locale.ROOT);
        jdbc.update("""
            INSERT INTO wok.cash_registers (code, name, currency_id)
            SELECT ?, 'F01 isolated register', id FROM wok.currencies WHERE code = 'GTQ'
            """, code);
        UUID cash = UUID.fromString(body(post("/api/v1/operational/cash-sessions", f.token(),
                "{\"registerCode\":\"" + code + "\",\"openingFloat\":10.00}", key())).path("id").asText());
        String partial = "{\"method\":\"CASH\",\"registerCode\":\"" + code + "\",\"amount\":40.10}";
        Map<String, String> sameKey = key();
        JsonNode first = body(pay(f, f.token(), partial, sameKey));
        assertThat(first.path("balance").decimalValue()).isEqualByComparingTo("60.20");
        assertThat(first.path("accountStatus").asText()).isEqualTo("OPEN");
        assertThat(body(pay(f, f.token(), partial, sameKey)).path("paymentId").asText())
                .isEqualTo(first.path("paymentId").asText());
        assertThat(pay(f, f.token(), "{\"method\":\"CASH\",\"amount\":41}", sameKey).statusCode()).isEqualTo(409);
        assertThat(finish(f, order).statusCode()).isEqualTo(409);
        assertThat(release(f).statusCode()).isEqualTo(409);
        assertThat(pay(f, f.token(), "{\"method\":\"TRANSFER\",\"amount\":60.21}", key()).statusCode()).isEqualTo(422);
        assertThat(body(pay(f, f.token(), "{\"method\":\"CASH\",\"registerCode\":\"" + code + "\"}", key()))
                .path("balance").decimalValue()).isZero();
        assertThat(account(f).path("account").path("status").asText()).isEqualTo("PAID");
        assertThat(status(order)).isEqualTo("SERVED");
        assertThat(release(f).statusCode()).isEqualTo(409);
        assertThat(finish(f, order).statusCode()).isEqualTo(200);
        assertThat(release(f).statusCode()).isEqualTo(200);
        assertThat(account(f).path("account").path("status").asText()).isEqualTo("CLOSED");
        assertThat(account(f).path("balance").decimalValue()).isZero();
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", f.account())).isEqualTo(2);
        assertThat(count("""
            SELECT count(*) FROM wok.cash_movements m JOIN wok.payments p ON p.id = m.payment_id
            WHERE p.account_id = ? AND m.movement_type = 'SALE'
            """, f.account())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT SUM(amount_delta) FROM wok.cash_movements WHERE cash_session_id = ?",
                BigDecimal.class, cash)).isEqualByComparingTo("110.30");
        assertThat(count("""
            SELECT count(*) FROM wok.audit_logs a JOIN wok.payments p ON a.entity_id = p.id
            WHERE p.account_id = ? AND a.action = 'PAYMENT_CAPTURED' AND a.result = 'SUCCESS'
              AND a.actor_user_id = ? AND a.created_at IS NOT NULL
            """, f.account(), f.actor())).isEqualTo(2);
        JsonNode cashDetails = body(get("/api/v1/operational/cash-sessions/" + cash, f.token()));
        assertThat(cashDetails.path("expectedCash").decimalValue()).isEqualByComparingTo("110.30");
        JsonNode closedCash = body(post("/api/v1/operational/cash-sessions/" + cash + "/close", f.token(),
                "{\"countedCash\":110.30,\"expectedVersion\":" + cashDetails.path("rowVersion").asInt() + "}"));
        assertThat(closedCash.path("status").asText()).isEqualTo("CLOSED");
        assertThat(closedCash.path("difference").decimalValue()).isZero();
    }

    @Test
    void considersAllOrdersAndRequiresEveryNonCancelledOrderToBeServed() {
        Fixture f = fixture();
        UUID served = order(f, "SERVED", "30.10");
        UUID pending = order(f, "READY", "20.20");
        order(f, "CANCELLED", "999.00");
        assertThat(pay(f).statusCode()).isEqualTo(409);
        assertThat(finish(f, served).statusCode()).isEqualTo(409);
        assertThat(patch("/api/v1/operational/orders/" + pending + "/status", f.token(),
                "{\"status\":\"SERVED\",\"expectedVersion\":1}").statusCode()).isEqualTo(200);
        assertThat(body(pay(f, f.token(), "{\"method\":\"TRANSFER\",\"amount\":30.10}", key()))
                .path("balance").decimalValue()).isEqualByComparingTo("20.20");
        assertThat(finish(f, served).statusCode()).isEqualTo(409);
        assertThat(body(pay(f)).path("balance").decimalValue()).isZero();
        assertThat(finish(f, served).statusCode()).isEqualTo(200);
        assertThat(release(f).statusCode()).isEqualTo(409);
        assertThat(finish(f, pending).statusCode()).isEqualTo(200);
        assertThat(release(f).statusCode()).isEqualTo(200);
    }

    @Test
    void legacyClosedOrdersRemainPayableButTheirDebtPreventsReleasingAnyAccountOnTheTable() {
        Fixture f = fixture();
        order(f, "CLOSED", "25.00");
        UUID secondAccount = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.order_accounts (id, dining_table_id, name, opened_by)
            VALUES (?, ?, 'F01 second account', ?)
            """, secondAccount, f.table(), f.actor());
        Fixture second = new Fixture(f.actor(), f.token(), f.table(), secondAccount);
        order(second, "CLOSED", "15.00");
        assertThat(release(f).statusCode()).isEqualTo(409);
        assertThat(pay(f).statusCode()).isEqualTo(201);
        assertThat(release(f).statusCode()).isEqualTo(409);
        assertThat(account(f).path("account").path("status").asText()).isEqualTo("PAID");
        assertThat(account(second).path("account").path("status").asText()).isEqualTo("OPEN");
        assertThat(pay(second).statusCode()).isEqualTo(201);
        assertThat(release(f).statusCode()).isEqualTo(200);
        assertThat(account(second).path("account").path("status").asText()).isEqualTo("CLOSED");
    }

    @Test
    void anonymousAndClientCannotCaptureOrRelease() {
        Fixture f = fixture();
        order(f, "SERVED", "15.00");
        String client = tokenForRole("CLIENT");
        for (String token : new String[]{null, client}) {
            int expected = token == null ? 401 : 403;
            assertThat(pay(f, token, "{\"method\":\"TRANSFER\"}", key()).statusCode()).isEqualTo(expected);
            assertThat(post("/api/v1/operational/tables/" + f.table() + "/close", token, null).statusCode())
                    .isEqualTo(expected);
        }
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", f.account())).isZero();
    }

    @Test
    void rejectsFractionalCentsInsteadOfRoundingAwayDebt() {
        Fixture f = fixture();
        order(f, "SERVED", "10.01");
        assertThat(pay(f, f.token(), "{\"method\":\"TRANSFER\",\"amount\":10.005}", key()).statusCode()).isEqualTo(422);
        assertThat(pay(f, f.token(), "{\"method\":\"TRANSFER\",\"tipAmount\":0.005}", key()).statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", f.account())).isZero();
        assertThat(account(f).path("balance").decimalValue()).isEqualByComparingTo("10.01");
    }

    @RepeatedTest(5)
    void twoSessionsCannotCaptureTheSameBalanceTwice() throws Exception {
        Fixture f = fixture();
        order(f, "SERVED", "100.00");
        String otherSession = tokenFor(f.actor());
        List<HttpResponse<String>> results = race(() -> pay(f),
                () -> pay(f, otherSession, "{\"method\":\"TRANSFER\"}", key()));
        assertThat(results.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(201, 409);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", f.account())).isEqualTo(1);
        assertThat(account(f).path("paid").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(account(f).path("balance").decimalValue()).isZero();
    }

    @RepeatedTest(5)
    void concurrentSamePaymentKeyProducesOnePaymentAndOneAuditEvent() throws Exception {
        Fixture f = fixture();
        order(f, "SERVED", "100.00");
        Map<String, String> same = key();
        String otherSession = tokenFor(f.actor());
        List<HttpResponse<String>> results = race(
                () -> pay(f, f.token(), "{\"method\":\"TRANSFER\"}", same),
                () -> pay(f, otherSession, "{\"method\":\"TRANSFER\"}", same));
        assertThat(results.stream().map(HttpResponse::statusCode).toList()).containsExactly(201, 201);
        assertThat(body(results.get(0)).path("paymentId").asText()).isEqualTo(body(results.get(1)).path("paymentId").asText());
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", f.account())).isEqualTo(1);
        assertThat(count("""
            SELECT count(*) FROM wok.audit_logs a JOIN wok.payments p ON p.id = a.entity_id
            WHERE p.account_id = ? AND a.action = 'PAYMENT_CAPTURED'
            """, f.account())).isEqualTo(1);
    }

    @RepeatedTest(5)
    void paymentAndOrderFinalizationCannotLeaveClosedConsumptionWithDebt() throws Exception {
        Fixture f = fixture();
        UUID order = order(f, "SERVED", "17.50");
        List<HttpResponse<String>> results = race(() -> pay(f), () -> finish(f, order));
        assertThat(results.get(0).statusCode()).as(results.get(0).body()).isEqualTo(201);
        assertThat(results.get(1).statusCode()).isIn(200, 409);
        assertThat(account(f).path("balance").decimalValue()).isZero();
        if (results.get(1).statusCode() == 409) assertThat(finish(f, order).statusCode()).isEqualTo(200);
        assertThat(status(order)).isEqualTo("CLOSED");
        assertThat(count("SELECT count(*) FROM wok.order_status_history WHERE order_id = ? AND to_status = 'CLOSED'", order))
                .isEqualTo(1);
    }

    @RepeatedTest(5)
    void paymentAndTableClosingSerializeEvenForLegacyClosedOrders() throws Exception {
        Fixture f = fixture();
        order(f, "CLOSED", "17.50");
        List<HttpResponse<String>> results = race(() -> pay(f), () -> release(f));
        assertThat(results.get(0).statusCode()).as(results.get(0).body()).isEqualTo(201);
        assertThat(results.get(1).statusCode()).isIn(200, 409);
        assertThat(account(f).path("balance").decimalValue()).isZero();
        if (results.get(1).statusCode() == 409) assertThat(release(f).statusCode()).isEqualTo(200);
        assertThat(account(f).path("account").path("status").asText()).isEqualTo("CLOSED");
    }

    @RepeatedTest(5)
    void twoFinalizationsAndTwoReleasesDoNotDuplicateEffects() throws Exception {
        Fixture f = fixture();
        UUID order = order(f, "SERVED", "12.00");
        assertThat(pay(f).statusCode()).isEqualTo(201);
        assertThat(race(() -> finish(f, order), () -> finish(f, order)).stream()
                .map(HttpResponse::statusCode).sorted().toList()).containsExactly(200, 409);
        assertThat(count("SELECT count(*) FROM wok.order_status_history WHERE order_id = ? AND to_status = 'CLOSED'", order))
                .isEqualTo(1);
        assertThat(race(() -> release(f), () -> release(f)).stream()
                .map(HttpResponse::statusCode).sorted().toList()).containsExactly(200, 409);
        assertThat(count("SELECT count(*) FROM wok.dining_table_status_history WHERE dining_table_id = ? AND to_status = 'CLEANING'", f.table()))
                .isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'TABLE_CLOSED'", f.table()))
                .isEqualTo(1);
    }

    private Fixture fixture() {
        UUID actor = createUserWithRole("f01-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID table = UUID.fromString(body(post("/api/v1/operational/tables", token,
                "{\"name\":\"F01 " + UUID.randomUUID() + "\",\"capacity\":4,\"zone\":\"SALON\"}")).path("id").asText());
        UUID account = UUID.fromString(body(post("/api/v1/operational/tables/" + table + "/open", token, null))
                .path("accountId").asText());
        return new Fixture(actor, token, table, account);
    }

    private UUID order(Fixture f, String status, String total) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.orders (id, code, account_id, dining_table_id, channel, status,
                subtotal, total, currency_id, guest_count, opened_by, closed_at)
            SELECT ?, ?, ?, ?, 'DINE_IN', ?, ?::numeric, ?::numeric, id, 1, ?,
                CASE WHEN ? IN ('CLOSED', 'CANCELLED') THEN now() ELSE NULL END
            FROM wok.currencies WHERE code = 'GTQ'
            """, id, "F01-" + id, f.account(), f.table(), status, total, total, f.actor(), status);
        return id;
    }

    private HttpResponse<String> pay(Fixture f) {
        return pay(f, f.token(), "{\"method\":\"TRANSFER\"}", key());
    }

    private HttpResponse<String> pay(Fixture f, String token, String payload, Map<String, String> headers) {
        return post("/api/v1/operational/accounts/" + f.account() + "/payments", token, payload, headers);
    }

    private HttpResponse<String> finish(Fixture f, UUID order) {
        int version = jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id = ?", Integer.class, order);
        return patch("/api/v1/operational/orders/" + order + "/status", f.token(),
                "{\"status\":\"CLOSED\",\"expectedVersion\":" + version + "}");
    }

    private HttpResponse<String> release(Fixture f) {
        return post("/api/v1/operational/tables/" + f.table() + "/close", f.token(), null);
    }

    private JsonNode account(Fixture f) {
        return body(get("/api/v1/operational/accounts/" + f.account(), f.token()));
    }

    private String status(UUID order) {
        return jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, order);
    }

    private int count(String sql, Object... args) { return jdbc.queryForObject(sql, Integer.class, args); }
    private Map<String, String> key() { return Map.of("Idempotency-Key", UUID.randomUUID().toString()); }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }

    private List<HttpResponse<String>> race(Callable<HttpResponse<String>> first,
                                             Callable<HttpResponse<String>> second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var tasks = List.of(first, second).stream().map(task -> pool.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Race did not start");
                return task.call();
            })).toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return List.of(tasks.get(0).get(15, TimeUnit.SECONDS), tasks.get(1).get(15, TimeUnit.SECONDS));
        }
    }

    private record Fixture(UUID actor, String token, UUID table, UUID account) {}

    @Test
    void incompatibleHistoricalCurrenciesCannotFinalizeOrReleaseAndRollbackEveryAccount() throws Exception {
        Fixture f=fixture(); UUID served=order(f,"SERVED","100.00");
        jdbc.update("INSERT INTO wok.currencies(code,name) VALUES ('USD','Dollar') ON CONFLICT DO NOTHING");
        jdbc.update("INSERT INTO wok.payments(account_id,amount,currency_id,method,captured_by) SELECT ?,100,id,'TRANSFER',? FROM wok.currencies WHERE code='USD'",f.account(),f.actor());
        HttpResponse<String> rejected=finish(f,served);
        assertThat(rejected.statusCode()).isEqualTo(409);
        assertThat(json.readTree(rejected.body()).path("message").asText()).contains("conciliación");
        assertThat(status(served)).isEqualTo("SERVED");
        assertThat(count("SELECT count(*) FROM wok.order_status_history WHERE order_id=?",served)).isZero();
        jdbc.update("UPDATE wok.orders SET status='CLOSED',closed_at=now() WHERE id=?",served);
        UUID earlier=UUID.fromString("00000000-0000-4000-8000-"+UUID.randomUUID().toString().substring(24));
        jdbc.update("INSERT INTO wok.order_accounts(id,dining_table_id,name,opened_by) VALUES (?,?,'F03 earlier zero balance',?)",earlier,f.table(),f.actor());
        assertThat(release(f).statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_accounts WHERE id=?",String.class,earlier)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT row_version FROM wok.order_accounts WHERE id=?",Integer.class,earlier)).isEqualTo(1);
        assertThat(account(f).path("account").path("status").asText()).isEqualTo("OPEN");
        assertThat(account(f).path("currencyTotals")).hasSize(2);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id=? AND action='TABLE_CLOSED'",f.table())).isZero();
        assertThat(jdbc.queryForObject("SELECT current_status FROM wok.dining_tables WHERE id=?",String.class,f.table())).isEqualTo("OCCUPIED");
    }

    @Test
    void aHistoricalOverpaymentInOneCurrencyRequiresReconciliationBeforeClosing() throws Exception {
        Fixture f=fixture(); UUID served=order(f,"SERVED","10");
        jdbc.update("INSERT INTO wok.payments(account_id,amount,currency_id,method,captured_by) SELECT ?,11,id,'TRANSFER',? FROM wok.currencies WHERE code='GTQ'",f.account(),f.actor());
        assertThat(finish(f,served).statusCode()).isEqualTo(409);
        jdbc.update("UPDATE wok.orders SET status='CLOSED',closed_at=now() WHERE id=?",served);
        HttpResponse<String> rejected=release(f);
        assertThat(rejected.statusCode()).isEqualTo(409);
        assertThat(json.readTree(rejected.body()).path("message").asText()).contains("conciliación");
        assertThat(account(f).path("balance").decimalValue()).isEqualByComparingTo("-1");
    }

}
