package com.wokasianfood.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PaymentIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void rejectsPaymentAndTipAmountsThatPostgresWouldRoundOrCannotRepresent() {
        UUID actor = createUserWithRole("cajero-precision-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, null, "Validación de montos exactos");
        closedOrder(accountId, actor, "20.00");

        var overScaleAmount = post("/api/v1/operational/accounts/" + accountId + "/payments", token,
                "{\"method\":\"CASH\",\"amount\":1.005}", Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        var overScaleTip = post("/api/v1/operational/accounts/" + accountId + "/payments", token,
                "{\"method\":\"CASH\",\"tipAmount\":0.001}", Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        var oversized = post("/api/v1/operational/accounts/" + accountId + "/payments", token,
                "{\"method\":\"CASH\",\"amount\":1000000000000.00}", Map.of("Idempotency-Key", UUID.randomUUID().toString()));

        assertThat(overScaleAmount.statusCode()).isEqualTo(422);
        assertThat(overScaleTip.statusCode()).isEqualTo(422);
        assertThat(oversized.statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", accountId)).isZero();
    }

    @Test
    void capturesCashPaymentLinksCashMovementAndRejectsDoubleCharge() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        String code = openRegister("CAJA");
        UUID sessionId = openCash(token, code, "100.00");
        UUID accountId = createAccount(actor, null, "Cuenta efectivo");
        closedOrder(accountId, actor, "45.00");

        String key = UUID.randomUUID().toString();
        JsonNode payment = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","registerCode":"%s"}
                """.formatted(code), Map.of("Idempotency-Key", key)));
        UUID paymentId = UUID.fromString(payment.path("paymentId").asText());
        assertThat(payment.path("amount").decimalValue()).isEqualByComparingTo("45.00");
        assertThat(payment.path("currency").asText()).isEqualTo("GTQ");
        assertThat(payment.path("method").asText()).isEqualTo("CASH");
        assertThat(payment.path("status").asText()).isEqualTo("CAPTURED");
        assertThat(payment.path("accountStatus").asText()).isEqualTo("PAID");
        assertThat(payment.path("cashSessionId").asText()).isEqualTo(sessionId.toString());
        assertThat(payment.path("cashMovementId").isMissingNode()).isFalse();
        assertThat(payment.path("idempotentReplay").asBoolean()).isFalse();

        assertThat(jdbc.queryForObject("""
                SELECT status FROM wok.order_accounts WHERE id = ?
                """, String.class, accountId)).isEqualTo("PAID");
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.cash_movements WHERE payment_id = ? AND movement_type = 'SALE'
                """, Integer.class, paymentId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT amount_delta FROM wok.cash_movements WHERE payment_id = ?
                """, BigDecimal.class, paymentId)).isEqualByComparingTo("45.00");
        assertThat(jdbc.queryForObject("""
                SELECT SUM(amount_delta) FROM wok.cash_movements WHERE cash_session_id = ?
                """, BigDecimal.class, sessionId)).isEqualByComparingTo("145.00");
        assertThat(jdbc.queryForObject("""
                SELECT status FROM wok.order_accounts WHERE id = ?
                """, String.class, accountId)).isEqualTo("PAID");

        JsonNode replay = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","registerCode":"%s"}
                """.formatted(code), Map.of("Idempotency-Key", key)));
        assertThat(replay.path("paymentId").asText()).isEqualTo(paymentId.toString());
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", accountId)).isEqualTo(1);

        var conflicting = post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"TRANSFER","reference":"otra"}
                """, Map.of("Idempotency-Key", key));
        assertThat(conflicting.statusCode()).isEqualTo(409);

        var secondCharge = post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","registerCode":"%s"}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(secondCharge.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", accountId)).isEqualTo(1);
    }

    @Test
    void rejectsCashCaptureWhenRegisterCurrencyDoesNotMatchAccountCurrency() {
        UUID actor = createUserWithRole("cajero-moneda-captura-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        String code = openRegister("MONEDA");
        UUID sessionId = openCash(token, code, "0.00");
        UUID accountId = createAccount(actor, null, "Cuenta USD efectivo");
        ensureUsdCurrency();
        insertOrder(accountId, actor, "10.00", "USD", "CLOSED");

        var response = post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","registerCode":"%s"}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString()));

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", accountId)).isZero();
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id = ? AND movement_type = 'SALE'",
                sessionId)).isZero();
    }

    @Test
    void rejectsCashRefundWhenRegisterCurrencyDoesNotMatchPaymentCurrency() {
        UUID actor = createUserWithRole("cajero-moneda-reembolso-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        String code = openRegister("MONEDA");
        UUID sessionId = openCash(token, code, "0.00");
        UUID accountId = createAccount(actor, null, "Cuenta USD devolución");
        ensureUsdCurrency();
        insertOrder(accountId, actor, "10.00", "USD", "CLOSED");
        JsonNode captured = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CARD_EXTERNAL","reference":"CAP-USD"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID paymentId = UUID.fromString(captured.path("paymentId").asText());

        var response = post("/api/v1/operational/accounts/" + accountId + "/payments/" + paymentId + "/refunds",
                token, """
                {"amount":5.00,"method":"CASH","registerCode":"%s","reason":"Prueba de moneda"}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString()));

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.payment_refunds WHERE payment_id = ?", paymentId)).isZero();
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id = ? AND movement_type = 'REFUND'",
                sessionId)).isZero();
    }

    @Test
    void rejectsCourierCashSettlementWhenRegisterCurrencyDoesNotMatchPaymentCurrency() {
        UUID actor = createUserWithRole("cajero-moneda-repartidor-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID courier = createUserWithRole("repartidor-moneda-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        String code = openRegister("MONEDA");
        UUID sessionId = openCash(token, code, "0.00");
        UUID accountId = createAccount(actor, null, "Delivery USD contra entrega");
        ensureUsdCurrency();
        UUID orderId = closedDeliveryOrder(accountId, actor, "10.00", "USD");
        jdbc.update("""
            INSERT INTO wok.delivery_dispatches (order_id, status, assigned_to_user_id, assigned_at, dispatched_at)
            VALUES (?, 'OUT_FOR_DELIVERY', ?, now(), now())
            """, orderId, courier);
        JsonNode captured = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","collectionSource":"COURIER","courierUserId":"%s"}
                """.formatted(courier), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID paymentId = UUID.fromString(captured.path("paymentId").asText());
        UUID collectionId = jdbc.queryForObject("""
                SELECT id FROM wok.courier_cash_collections WHERE payment_id = ?
                """, UUID.class, paymentId);

        var response = post("/api/v1/operational/courier-cash/" + collectionId + "/settle", token,
                "{\"cashSessionId\":\"" + sessionId + "\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.courier_cash_collections WHERE id = ? AND status = 'PENDING_SETTLEMENT'",
                collectionId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id = ? AND movement_type = 'SALE'",
                sessionId)).isZero();
    }

    @Test
    void capturesExternalPaymentWithoutCashMovement() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, null, "Cuenta tarjeta externa");
        closedOrder(accountId, actor, "20.00");

        JsonNode payment = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CARD_EXTERNAL","reference":"AUTH-123"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID paymentId = UUID.fromString(payment.path("paymentId").asText());
        assertThat(payment.path("cashSessionId").isMissingNode()).isTrue();
        assertThat(payment.path("cashMovementId").isMissingNode()).isTrue();
        assertThat(payment.path("accountStatus").asText()).isEqualTo("PAID");

        assertThat(count("""
                SELECT count(*) FROM wok.payments WHERE id = ? AND cash_session_id IS NULL
                """, paymentId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE payment_id = ?", paymentId)).isZero();
    }

    @Test
    void courierCashIsReceivableUntilIdempotentlySettledIntoRegister() {
        UUID actor = createUserWithRole("cajero-delivery-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID courier = createUserWithRole("repartidor-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        String code = openRegister("DELIVERY");
        UUID sessionId = openCash(token, code, "80.00");
        UUID accountId = createAccount(actor, null, "Cobro delivery contra entrega");
        UUID orderId = closedDeliveryOrder(accountId, actor, "50.00");
        jdbc.update("""
            INSERT INTO wok.delivery_dispatches (order_id, status, assigned_to_user_id, assigned_at, dispatched_at)
            VALUES (?, 'OUT_FOR_DELIVERY', ?, now(), now())
            """, orderId, courier);

        UUID otherCourier = createUserWithRole("repartidor-otro-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        var unassignedCourier = post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","collectionSource":"COURIER","courierUserId":"%s"}
                """.formatted(otherCourier), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(unassignedCourier.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", accountId)).isZero();

        JsonNode payment = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","collectionSource":"COURIER","courierUserId":"%s","tipAmount":5.00}
                """.formatted(courier), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID paymentId = UUID.fromString(payment.path("paymentId").asText());
        assertThat(payment.path("accountStatus").asText()).isEqualTo("PAID");
        assertThat(payment.path("cashSessionId").isMissingNode()).isTrue();
        assertThat(payment.path("cashMovementId").isMissingNode()).isTrue();
        assertThat(count("SELECT count(*) FROM wok.courier_cash_collections WHERE payment_id = ? AND status = 'PENDING_SETTLEMENT'", paymentId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT SUM(amount_delta) FROM wok.cash_movements WHERE cash_session_id = ?", BigDecimal.class, sessionId))
                .isEqualByComparingTo("80.00");

        JsonNode pending = body(get("/api/v1/operational/courier-cash/pending", token));
        UUID collectionId = UUID.fromString(pending.get(0).path("collectionId").asText());
        assertThat(pending.get(0).path("amount").decimalValue()).isEqualByComparingTo("50.00");
        assertThat(pending.get(0).path("tip").decimalValue()).isEqualByComparingTo("5.00");

        String settleKey = UUID.randomUUID().toString();
        UUID settleRequestId = UUID.randomUUID();
        String settlePath = "/api/v1/operational/courier-cash/" + collectionId + "/settle";
        JsonNode settled = body(post(settlePath, token,
                "{\"cashSessionId\":\"" + sessionId + "\"}", Map.of("Idempotency-Key", settleKey,
                        "X-Request-Id", settleRequestId.toString())));
        assertThat(settled.path("amount").decimalValue()).isEqualByComparingTo("50.00");
        assertThat(settled.path("tip").decimalValue()).isEqualByComparingTo("5.00");
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE payment_id = ? AND movement_type = 'SALE'", paymentId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT SUM(amount_delta) FROM wok.cash_movements WHERE cash_session_id = ?", BigDecimal.class, sessionId))
                .isEqualByComparingTo("135.00");
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id = ? AND reason = 'Propina entregada por repartidor'", sessionId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id = ? "
                + "AND request_id = ? AND payment_id = ? AND movement_type = 'SALE'",
                sessionId, settleRequestId, paymentId)).isEqualTo(1);
        UUID tipMovementRequestId = UUID.nameUUIDFromBytes((settleRequestId + ":courier-tip")
                .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE cash_session_id = ? "
                + "AND request_id = ? AND reason = 'Propina entregada por repartidor'",
                sessionId, tipMovementRequestId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE action = 'COURIER_CASH_SETTLED' "
                + "AND entity_id = ? AND request_id = ?", collectionId, settleRequestId)).isEqualTo(1);
        JsonNode settledCash = body(get("/api/v1/operational/cash-sessions/" + sessionId, token));
        assertThat(settledCash.path("breakdown").path("tips").decimalValue()).isEqualByComparingTo("5.00");
        assertThat(settledCash.path("breakdown").path("otherIncome").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(settledCash.path("breakdown").path("expectedCash").decimalValue()).isEqualByComparingTo("135.00");

        JsonNode replay = body(post(settlePath, token,
                "{\"cashSessionId\":\"" + sessionId + "\"}", Map.of("Idempotency-Key", settleKey)));
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE payment_id = ?", paymentId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.courier_cash_collections WHERE id = ? AND status = 'SETTLED'", collectionId)).isEqualTo(1);
    }

    @Test
    void rejectsAccountsWithOpenOrdersAndWithoutConsumption() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);

        UUID openAccount = createAccount(actor, null, "Cuenta con pedido abierto");
        closedOrder(openAccount, actor, "30.00", "SENT");
        var active = post("/api/v1/operational/accounts/" + openAccount + "/payments", token, """
                {"method":"TRANSFER"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(active.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", openAccount)).isZero();

        UUID emptyAccount = createAccount(actor, null, "Cuenta sin consumo");
        var empty = post("/api/v1/operational/accounts/" + emptyAccount + "/payments", token, """
                {"method":"TRANSFER"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(empty.statusCode()).isEqualTo(422);
    }

    @Test
    void requiresOpenCashSessionForCashAndPaymentsPermission() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, null, "Cuenta sin caja");
        closedOrder(accountId, actor, "15.00");

        var withoutSession = post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","registerCode":"%s"}
                """.formatted(uniqueCode("SINCAJA")), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(withoutSession.statusCode()).isEqualTo(409);

        var forbidden = post("/api/v1/operational/accounts/" + accountId + "/payments",
                tokenForRole("CLIENT"), """
                {"method":"TRANSFER"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(forbidden.statusCode()).isEqualTo(403);
    }

    @Test
    void closesTableAfterAccountIsPaid() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID tableId = createTable(token);
        UUID accountId = UUID.fromString(body(post("/api/v1/operational/tables/" + tableId + "/open", token, null))
                .path("accountId").asText());
        closedOrder(accountId, actor, "60.00");
        String code = openRegister("CAJA");
        openCash(token, code, "0.00");

        body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","registerCode":"%s"}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        JsonNode closed = body(post("/api/v1/operational/tables/" + tableId + "/close", token, null));
        assertThat(closed.path("status").asText()).isEqualTo("CLEANING");
        assertThat(jdbc.queryForObject("""
                SELECT status FROM wok.order_accounts WHERE id = ?
                """, String.class, accountId)).isEqualTo("CLOSED");
    }

    @Test
    void showsPaidBalanceAndPaymentsInAccountDetails() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, null, "Cuenta detalle pago");
        closedOrder(accountId, actor, "80.00");

        JsonNode before = body(get("/api/v1/operational/accounts/" + accountId, token));
        assertThat(before.path("total").decimalValue()).isEqualByComparingTo("80.00");
        assertThat(before.path("paid").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(before.path("balance").decimalValue()).isEqualByComparingTo("80.00");
        assertThat(before.path("payments")).isEmpty();

        body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CARD_EXTERNAL","reference":"REF-1"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        JsonNode after = body(get("/api/v1/operational/accounts/" + accountId, token));
        assertThat(after.path("account").path("status").asText()).isEqualTo("PAID");
        assertThat(after.path("paid").decimalValue()).isEqualByComparingTo("80.00");
        assertThat(after.path("balance").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(after.path("payments")).hasSize(1);
        assertThat(after.path("payments").get(0).path("method").asText()).isEqualTo("CARD_EXTERNAL");
        assertThat(after.path("payments").get(0).path("status").asText()).isEqualTo("CAPTURED");
        assertThat(after.path("payments").get(0).path("reference").asText()).isEqualTo("REF-1");
    }

    @Test
    void accountBalancesAreListedPerTableAndNeverNetDifferentCurrenciesTogether() {
        UUID actor = createUserWithRole("cajero-multimoneda-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID tableId = createTable(token);
        UUID accountId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.order_accounts (id, dining_table_id, name, status, opened_by)
                VALUES (?, ?, 'Cuenta multimoneda', 'OPEN', ?)
                """, accountId, tableId, actor);
        UUID emptyAccountId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.order_accounts (id, dining_table_id, name, status, opened_by)
                VALUES (?, ?, 'Cuenta sin consumos', 'OPEN', ?)
                """, emptyAccountId, tableId, actor);
        jdbc.update("INSERT INTO wok.currencies (code, name) VALUES ('USD', 'Dólar') ON CONFLICT (code) DO NOTHING");
        insertOrder(accountId, actor, "10.10", "GTQ", "SERVED");
        insertOrder(accountId, actor, "5.20", "USD", "SERVED");
        insertOrder(accountId, actor, "999.00", "GTQ", "CANCELLED");

        JsonNode details = body(get("/api/v1/operational/accounts/" + accountId, token));
        assertThat(details.path("total").isMissingNode()).isTrue();
        assertThat(details.path("balance").isMissingNode()).isTrue();
        assertThat(details.path("currencyTotals")).hasSize(2);
        assertThat(details.path("currencyTotals").get(0).path("currency").asText()).isEqualTo("GTQ");
        assertThat(details.path("currencyTotals").get(0).path("total").decimalValue()).isEqualByComparingTo("10.10");
        assertThat(details.path("currencyTotals").get(1).path("currency").asText()).isEqualTo("USD");
        assertThat(details.path("currencyTotals").get(1).path("total").decimalValue()).isEqualByComparingTo("5.20");

        JsonNode listed = body(get("/api/v1/operational/accounts?tableId=" + tableId, token));
        assertThat(listed).hasSize(2);
        JsonNode listedAccount = java.util.stream.StreamSupport.stream(listed.spliterator(), false)
                .filter(row -> row.path("account").path("id").asText().equals(accountId.toString()))
                .findFirst().orElseThrow();
        JsonNode listedEmpty = java.util.stream.StreamSupport.stream(listed.spliterator(), false)
                .filter(row -> row.path("account").path("id").asText().equals(emptyAccountId.toString()))
                .findFirst().orElseThrow();
        assertThat(listedAccount.path("orderCount").asInt()).isEqualTo(3);
        assertThat(listedAccount.path("currencyTotals")).hasSize(2);
        assertThat(listedEmpty.path("total").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(get("/api/v1/operational/accounts?tableId=" + UUID.randomUUID(), token).statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/operational/accounts?tableId=" + tableId, tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
    }

    @Test
    void paymentAndRefundReceiptsDoNotReportACombinedBalanceAfterAccountBecomesMultiCurrency() {
        UUID actor = createUserWithRole("cajero-recibo-multimoneda-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, null, "Cuenta con monedas posteriores");
        closedOrder(accountId, actor, "25.00");

        String captureKey = UUID.randomUUID().toString();
        String captureBody = """
                {"method":"CARD_EXTERNAL","reference":"CAP-MULTI"}
                """;
        JsonNode captured = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token,
                captureBody, Map.of("Idempotency-Key", captureKey)));
        UUID paymentId = UUID.fromString(captured.path("paymentId").asText());
        assertThat(captured.path("balance").decimalValue()).isEqualByComparingTo("0.00");

        jdbc.update("INSERT INTO wok.currencies (code, name) VALUES ('USD', 'Dólar') ON CONFLICT (code) DO NOTHING");
        insertOrder(accountId, actor, "10.00", "USD", "SERVED");
        JsonNode captureReplay = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token,
                captureBody, Map.of("Idempotency-Key", captureKey)));
        assertThat(captureReplay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(captureReplay.path("balance").isMissingNode()).isTrue();

        JsonNode refund = body(post("/api/v1/operational/accounts/" + accountId + "/payments/" + paymentId
                + "/refunds", token, """
                {"amount":5.00,"method":"CARD_EXTERNAL","reference":"REF-MULTI","reason":"Ajuste de prueba"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(refund.path("currency").asText()).isEqualTo("GTQ");
        assertThat(refund.path("balance").isMissingNode()).isTrue();

        JsonNode account = body(get("/api/v1/operational/accounts/" + accountId, token));
        assertThat(account.path("balance").isMissingNode()).isTrue();
        assertThat(account.path("currencyTotals")).hasSize(2);
        assertThat(account.path("currencyTotals").get(0).path("balance").decimalValue())
                .isEqualByComparingTo("5.00");
        assertThat(account.path("currencyTotals").get(1).path("balance").decimalValue())
                .isEqualByComparingTo("10.00");
    }

    @Test
    void capturesPartialAndMixedPaymentsUntilBalanceIsSettled() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        String code = openRegister("CAJA");
        UUID sessionId = openCash(token, code, "0.00");
        UUID accountId = createAccount(actor, null, "Cuenta mixta");
        closedOrder(accountId, actor, "100.00");

        JsonNode cash = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","registerCode":"%s","amount":40.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(cash.path("amount").decimalValue()).isEqualByComparingTo("40.00");
        assertThat(cash.path("accountStatus").asText()).isEqualTo("OPEN");
        assertThat(cash.path("balance").decimalValue()).isEqualByComparingTo("60.00");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_accounts WHERE id = ?", String.class, accountId))
                .isEqualTo("OPEN");

        var overpay = post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"TRANSFER","amount":80.00}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(overpay.statusCode()).isEqualTo(422);

        JsonNode transfer = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"TRANSFER","amount":25.00}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(transfer.path("amount").decimalValue()).isEqualByComparingTo("25.00");
        assertThat(transfer.path("balance").decimalValue()).isEqualByComparingTo("35.00");
        assertThat(transfer.path("accountStatus").asText()).isEqualTo("OPEN");

        JsonNode card = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CARD_EXTERNAL","reference":"T-1","amount":35.00}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(card.path("balance").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(card.path("accountStatus").asText()).isEqualTo("PAID");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_accounts WHERE id = ?", String.class, accountId))
                .isEqualTo("PAID");
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", accountId)).isEqualTo(3);
        assertThat(jdbc.queryForObject("""
                SELECT SUM(amount_delta) FROM wok.cash_movements WHERE cash_session_id = ?
                """, BigDecimal.class, sessionId)).isEqualByComparingTo("40.00");

        JsonNode details = body(get("/api/v1/operational/accounts/" + accountId, token));
        assertThat(details.path("paid").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(details.path("balance").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(details.path("payments")).hasSize(3);
    }

    @Test
    void recordsCashTipAsIncomeWithoutReducingBalance() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        String code = openRegister("CAJA");
        UUID sessionId = openCash(token, code, "0.00");
        UUID accountId = createAccount(actor, null, "Cuenta propina efectivo");
        closedOrder(accountId, actor, "50.00");

        JsonNode payment = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","registerCode":"%s","amount":50.00,"tipAmount":5.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(payment.path("amount").decimalValue()).isEqualByComparingTo("50.00");
        assertThat(payment.path("tipAmount").decimalValue()).isEqualByComparingTo("5.00");
        assertThat(payment.path("balance").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(payment.path("accountStatus").asText()).isEqualTo("PAID");
        assertThat(jdbc.queryForObject("""
                SELECT SUM(amount_delta) FROM wok.cash_movements WHERE cash_session_id = ?
                """, BigDecimal.class, sessionId)).isEqualByComparingTo("55.00");
        assertThat(count("""
                SELECT count(*) FROM wok.cash_movements
                WHERE cash_session_id = ? AND movement_type = 'INCOME' AND reason = 'Propina de cuenta'
                """, sessionId)).isEqualTo(1);

        JsonNode session = body(get("/api/v1/operational/cash-sessions/" + sessionId, token));
        assertThat(session.path("breakdown").path("sales").decimalValue()).isEqualByComparingTo("50.00");
        assertThat(session.path("breakdown").path("tips").decimalValue()).isEqualByComparingTo("5.00");
        assertThat(session.path("breakdown").path("otherIncome").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(session.path("breakdown").path("expectedCash").decimalValue()).isEqualByComparingTo("55.00");

        JsonNode details = body(get("/api/v1/operational/accounts/" + accountId, token));
        assertThat(details.path("paid").decimalValue()).isEqualByComparingTo("50.00");
        assertThat(details.path("tips").decimalValue()).isEqualByComparingTo("5.00");
        assertThat(details.path("balance").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(details.path("payments").get(0).path("tipAmount").decimalValue()).isEqualByComparingTo("5.00");
    }

    @Test
    void recordsCardTipWithoutCashMovement() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, null, "Cuenta propina tarjeta");
        closedOrder(accountId, actor, "20.00");

        JsonNode payment = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CARD_EXTERNAL","reference":"T-9","amount":20.00,"tipAmount":3.00}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(payment.path("tipAmount").decimalValue()).isEqualByComparingTo("3.00");
        assertThat(payment.path("cashSessionId").isMissingNode()).isTrue();
        assertThat(payment.path("cashMovementId").isMissingNode()).isTrue();
        assertThat(count("SELECT count(*) FROM wok.payments WHERE id = ? AND tip_amount = 3.00",
                UUID.fromString(payment.path("paymentId").asText()))).isEqualTo(1);
    }

    @Test
    void recordsIdempotentPartialCashRefundAndReopensAccountBalance() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        String code = openRegister("DEV");
        UUID sessionId = openCash(token, code, "100.00");
        UUID accountId = createAccount(actor, null, "Cuenta devolución parcial");
        closedOrder(accountId, actor, "50.00");
        JsonNode captured = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CASH","registerCode":"%s","tipAmount":5.00}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID paymentId = UUID.fromString(captured.path("paymentId").asText());

        String key = UUID.randomUUID().toString();
        String refundPath = "/api/v1/operational/accounts/" + accountId + "/payments/" + paymentId + "/refunds";
        String refundBody = """
                {"amount":15.00,"tipAmount":2.00,"method":"CASH","registerCode":"%s","reason":"Producto devuelto"}
                """.formatted(code);
        JsonNode refund = body(post(refundPath, token, refundBody, Map.of("Idempotency-Key", key)));
        assertThat(refund.path("status").asText()).isEqualTo("RECORDED_MANUALLY");
        assertThat(refund.path("amount").decimalValue()).isEqualByComparingTo("15.00");
        assertThat(refund.path("tipAmount").decimalValue()).isEqualByComparingTo("2.00");
        assertThat(refund.path("balance").decimalValue()).isEqualByComparingTo("15.00");
        assertThat(refund.path("accountStatus").asText()).isEqualTo("OPEN");
        assertThat(refund.path("cashSessionId").asText()).isEqualTo(sessionId.toString());
        assertThat(refund.path("cashMovementId").isMissingNode()).isFalse();

        JsonNode replay = body(post(refundPath, token, refundBody, Map.of("Idempotency-Key", key)));
        assertThat(replay.path("refundId").asText()).isEqualTo(refund.path("refundId").asText());
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(count("SELECT count(*) FROM wok.payment_refunds WHERE payment_id = ?", paymentId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE refund_id = ?",
                UUID.fromString(refund.path("refundId").asText()))).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.payments WHERE id = ?", String.class, paymentId))
                .isEqualTo("PARTIALLY_REFUNDED");

        JsonNode details = body(get("/api/v1/operational/accounts/" + accountId, token));
        assertThat(details.path("paid").decimalValue()).isEqualByComparingTo("35.00");
        assertThat(details.path("tips").decimalValue()).isEqualByComparingTo("3.00");
        assertThat(details.path("balance").decimalValue()).isEqualByComparingTo("15.00");
        assertThat(details.path("payments").get(0).path("refundedAmount").decimalValue())
                .isEqualByComparingTo("15.00");

        JsonNode cash = body(get("/api/v1/operational/cash-sessions/" + sessionId, token));
        assertThat(cash.path("expectedCash").decimalValue()).isEqualByComparingTo("138.00");
        assertThat(cash.path("breakdown").path("refunds").decimalValue()).isEqualByComparingTo("17.00");
        assertThat(cash.path("movements").findValuesAsText("type")).contains("REFUND");

        var overRefund = post(refundPath, token, """
                {"amount":36.00,"method":"CASH","registerCode":"%s","reason":"Excede el saldo"}
                """.formatted(code), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(overRefund.statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.payment_refunds WHERE payment_id = ?", paymentId)).isEqualTo(1);
    }

    @Test
    void recordsExternalRefundAsManualAndDoesNotInventCashMovement() {
        UUID actor = createUserWithRole("cajero-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, null, "Cuenta devolución tarjeta");
        closedOrder(accountId, actor, "20.00");
        JsonNode captured = body(post("/api/v1/operational/accounts/" + accountId + "/payments", token, """
                {"method":"CARD_EXTERNAL","reference":"CAP-123"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID paymentId = UUID.fromString(captured.path("paymentId").asText());

        JsonNode refund = body(post("/api/v1/operational/accounts/" + accountId + "/payments/"
                + paymentId + "/refunds", token, """
                {"amount":20.00,"method":"CARD_EXTERNAL","reference":"REF-456","reason":"Cobro duplicado"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        assertThat(refund.path("status").asText()).isEqualTo("RECORDED_MANUALLY");
        assertThat(refund.path("accountStatus").asText()).isEqualTo("OPEN");
        assertThat(refund.path("balance").decimalValue()).isEqualByComparingTo("20.00");
        assertThat(refund.path("cashMovementId").isMissingNode()).isTrue();
        assertThat(jdbc.queryForObject("SELECT status FROM wok.payments WHERE id = ?", String.class, paymentId))
                .isEqualTo("REFUNDED");
        assertThat(count("SELECT count(*) FROM wok.cash_movements WHERE refund_id = ?",
                UUID.fromString(refund.path("refundId").asText()))).isZero();
    }

    private UUID createAccount(UUID actor, UUID tableId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.order_accounts
                    (id, dining_table_id, name, status, opened_by, created_by, updated_by)
                VALUES (?, ?, ?, 'OPEN', ?, ?, ?)
                """, id, tableId, name, actor, actor, actor);
        return id;
    }

    private UUID closedOrder(UUID accountId, UUID actor, String total) {
        return closedOrder(accountId, actor, total, "CLOSED");
    }

    private UUID closedOrder(UUID accountId, UUID actor, String total, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.orders
                    (id, code, account_id, dining_table_id, channel, status, subtotal, discount, total,
                     currency_id, guest_count, opened_by, closed_at)
                SELECT ?, ?, ?, NULL, 'PICKUP', ?, ?::numeric, 0, ?::numeric, id, 1, ?,
                       CASE WHEN ? IN ('CLOSED', 'CANCELLED') THEN now() ELSE NULL END
                FROM wok.currencies WHERE code = 'GTQ'
                """, id, uniqueCode("ORD-PAY"), accountId, status, total, total, actor, status);
        return id;
    }

    private UUID insertOrder(UUID accountId, UUID actor, String total, String currency, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.orders
                    (id, code, account_id, dining_table_id, channel, status, subtotal, discount, total,
                     currency_id, guest_count, opened_by, closed_at)
                SELECT ?, ?, ?, NULL, 'DINE_IN', ?, ?::numeric, 0, ?::numeric, id, 1, ?,
                       CASE WHEN ? IN ('CLOSED', 'CANCELLED') THEN now() ELSE NULL END
                FROM wok.currencies WHERE code = ?
                """, id, uniqueCode("ORD-FX"), accountId, status, total, total, actor, status, currency);
        return id;
    }

    private UUID closedDeliveryOrder(UUID accountId, UUID actor, String total) {
        return closedDeliveryOrder(accountId, actor, total, "GTQ");
    }

    private UUID closedDeliveryOrder(UUID accountId, UUID actor, String total, String currency) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.orders
                (id, code, account_id, dining_table_id, channel, status, subtotal, discount, total,
                 currency_id, guest_count, opened_by, closed_at)
            SELECT ?, ?, ?, NULL, 'DELIVERY', 'CLOSED', ?::numeric, 0, ?::numeric, id, 1, ?, now()
            FROM wok.currencies WHERE code = ?
            """, id, uniqueCode("ORD-DELIVERY-PAY"), accountId, total, total, actor, currency);
        return id;
    }

    private void ensureUsdCurrency() {
        jdbc.update("INSERT INTO wok.currencies (code, name) VALUES ('USD', 'Dólar') ON CONFLICT (code) DO NOTHING");
    }

    private String openRegister(String prefix) {
        String code = uniqueCode(prefix);
        jdbc.update("""
                INSERT INTO wok.cash_registers (code, name, currency_id)
                SELECT ?, ?, id FROM wok.currencies WHERE code = 'GTQ'
                """, code, "Caja de prueba " + code);
        return code;
    }

    private UUID openCash(String token, String code, String openingFloat) {
        return UUID.fromString(body(post("/api/v1/operational/cash-sessions", token, """
                {"registerCode":"%s","openingFloat":%s}
                """.formatted(code, openingFloat), Map.of("Idempotency-Key", UUID.randomUUID().toString())))
                .path("id").asText());
    }

    private UUID createTable(String token) {
        var response = post("/api/v1/operational/tables", token, """
                {"name":"Mesa Pago %s","capacity":2,"zone":"SALON"}
                """.formatted(UUID.randomUUID().toString().substring(0, 8)));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return UUID.fromString(body(response).path("id").asText());
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
