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
