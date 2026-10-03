package com.wokasianfood.api.payments;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/accounts")
@PreAuthorize("hasAuthority('payments:manage')")
public class PaymentController {
    private final PaymentService payments;

    public PaymentController(PaymentService payments) { this.payments = payments; }

    @PostMapping("/{accountId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentService.PaymentReceipt capture(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody PaymentRequest request) {
        return payments.capture(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, accountId, idempotencyKey, request);
    }

    public record PaymentRequest(@NotNull PaymentMethod method,
                                 @DecimalMin(value = "0.01") BigDecimal amount,
                                 @Size(max = 120) String reference,
                                 @Size(max = 32) String registerCode) {}

    public enum PaymentMethod { CASH, CARD_EXTERNAL, TRANSFER }
}

@Service
class PaymentService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    PaymentService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    @Transactional
    public PaymentReceipt capture(UUID actor, UUID requestId, UUID accountId, UUID idempotencyKey,
                                  PaymentController.PaymentRequest request) {
        String reference = request.reference() == null || request.reference().isBlank()
                ? null : request.reference().trim();
        String registerCode = request.registerCode() == null || request.registerCode().isBlank()
                ? "MAIN" : request.registerCode().trim().toUpperCase(Locale.ROOT);
        String requestedAmount = request.amount() == null
                ? "FULL" : request.amount().stripTrailingZeros().toPlainString();
        String hash = fingerprint(accountId.toString(), request.method().name(), requestedAmount, reference, registerCode);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "ACCOUNT_PAYMENT_CAPTURED",
                idempotencyKey, hash);
        if (claim.replay()) return receipt(claim.resourceId(), true);

        Account account = lockAccount(accountId);
        if (!"OPEN".equals(account.status()) && !"IN_COBRO".equals(account.status()))
            throw new AuthException(409, "La cuenta ya fue cobrada o no admite cobros.");
        Billing billing = billing(accountId);
        if (billing.orderCount() == 0)
            throw new AuthException(422, "La cuenta no tiene consumos por cobrar.");
        if (billing.openCount() > 0)
            throw new AuthException(409, "La cuenta tiene pedidos sin cerrar.");
        if (billing.currencyCount() != 1)
            throw new AuthException(422, "No se pueden cobrar cuentas con varias monedas.");

        BigDecimal previouslyPaid = previouslyPaid(accountId);
        BigDecimal outstanding = billing.total().subtract(previouslyPaid);
        if (outstanding.signum() <= 0)
            throw new AuthException(409, "La cuenta no tiene saldo pendiente.");
        BigDecimal amount = request.amount() == null ? outstanding : request.amount();
        if (amount.compareTo(outstanding) > 0)
            throw new AuthException(422, "El monto excede el saldo pendiente de la cuenta.");
        BigDecimal remaining = outstanding.subtract(amount);

        UUID cashSessionId = null;
        if (request.method() == PaymentController.PaymentMethod.CASH) {
            cashSessionId = currentCashSession(registerCode);
            if (cashSessionId == null)
                throw new AuthException(409, "No hay una caja abierta para registrar el cobro en efectivo.");
        }

        UUID paymentId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.payments
                (id, account_id, cash_session_id, amount, currency_id, method, reference, captured_by, request_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, paymentId, accountId, cashSessionId, amount, billing.currencyId(),
                request.method().name(), reference, actor, requestId);

        UUID cashMovementId = null;
        if (cashSessionId != null) {
            cashMovementId = jdbc.queryForObject("""
                INSERT INTO wok.cash_movements
                    (cash_session_id, movement_type, amount_delta, payment_id, reason, responsible_user_id, request_id)
                VALUES (?, 'SALE', ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, cashSessionId, amount, paymentId, "Cobro de cuenta", actor, requestId);
        }

        if (remaining.signum() == 0) {
            jdbc.update("""
                UPDATE wok.order_accounts
                SET status = 'PAID', updated_at = now(), updated_by = ?, row_version = row_version + 1
                WHERE id = ? AND status IN ('OPEN', 'IN_COBRO')
                """, actor, accountId);
        }
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'PAYMENT_CAPTURED', 'PAYMENT', ?,
                    jsonb_build_object('accountId', ?, 'amount', ?, 'method', ?, 'balance', ?), 'SUCCESS', ?)
            """, actor, paymentId, accountId, amount, request.method().name(), remaining, requestId);
        idempotency.complete(actor.toString(), "ACCOUNT_PAYMENT_CAPTURED", idempotencyKey, paymentId);
        return receipt(paymentId, false);
    }

    private Account lockAccount(UUID accountId) {
        List<Account> rows = jdbc.query("""
            SELECT id, name, status FROM wok.order_accounts WHERE id = ? FOR UPDATE
            """, (rs, row) -> new Account(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getString("status")), accountId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la cuenta.");
        return rows.getFirst();
    }

    private Billing billing(UUID accountId) {
        List<Billing> rows = jdbc.query("""
            SELECT COALESCE(SUM(o.total), 0) AS total,
                   COUNT(*) AS order_count,
                   COUNT(*) FILTER (WHERE o.status NOT IN ('CLOSED', 'CANCELLED')) AS open_count,
                   COUNT(DISTINCT o.currency_id) AS currency_count,
                   (array_agg(DISTINCT o.currency_id))[1] AS currency_id
            FROM wok.orders o
            WHERE o.account_id = ? AND o.status <> 'CANCELLED'
            """, (rs, row) -> new Billing(rs.getBigDecimal("total"), rs.getInt("order_count"),
                rs.getInt("open_count"), rs.getInt("currency_count"),
                rs.getObject("currency_id", UUID.class)), accountId);
        return rows.getFirst();
    }

    private BigDecimal previouslyPaid(UUID accountId) {
        BigDecimal paid = jdbc.queryForObject("""
            SELECT COALESCE(SUM(amount), 0) FROM wok.payments
            WHERE account_id = ? AND status = 'CAPTURED'
            """, BigDecimal.class, accountId);
        return paid == null ? BigDecimal.ZERO : paid;
    }

    private UUID currentCashSession(String registerCode) {
        List<UUID> ids = jdbc.query("""
            SELECT s.id FROM wok.cash_sessions s
            JOIN wok.cash_registers r ON r.id = s.cash_register_id
            WHERE r.code = ? AND s.status IN ('OPEN', 'CLOSING')
            ORDER BY s.opened_at DESC LIMIT 1
            """, (rs, row) -> rs.getObject(1, UUID.class), registerCode);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private PaymentReceipt receipt(UUID paymentId, boolean replay) {
        List<PaymentReceipt> rows = jdbc.query("""
            SELECT p.id, p.account_id, p.amount, p.method, p.status, p.reference, p.cash_session_id,
                   c.code AS currency_code, a.status AS account_status, m.id AS cash_movement_id,
                   (SELECT COALESCE(SUM(o.total), 0) FROM wok.orders o
                     WHERE o.account_id = p.account_id AND o.status <> 'CANCELLED')
                   - (SELECT COALESCE(SUM(pay.amount), 0) FROM wok.payments pay
                       WHERE pay.account_id = p.account_id AND pay.status = 'CAPTURED') AS balance
            FROM wok.payments p
            JOIN wok.currencies c ON c.id = p.currency_id
            JOIN wok.order_accounts a ON a.id = p.account_id
            LEFT JOIN wok.cash_movements m ON m.payment_id = p.id
            WHERE p.id = ?
            """, (rs, row) -> new PaymentReceipt(rs.getObject("id", UUID.class),
                rs.getObject("account_id", UUID.class), rs.getString("account_status"),
                rs.getBigDecimal("amount"), rs.getString("currency_code"), rs.getString("method"),
                rs.getString("status"), rs.getString("reference"), rs.getBigDecimal("balance"),
                rs.getObject("cash_session_id", UUID.class), rs.getObject("cash_movement_id", UUID.class), replay),
            paymentId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el pago.");
        return rows.getFirst();
    }

    private String fingerprint(String... parts) {
        String canonical = String.join("\n", parts);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private record Account(UUID id, String name, String status) {}

    private record Billing(BigDecimal total, int orderCount, int openCount, int currencyCount,
                           UUID currencyId) {}

    public record PaymentReceipt(UUID paymentId, UUID accountId, String accountStatus, BigDecimal amount,
                                 String currency, String method, String status, String reference, BigDecimal balance,
                                 UUID cashSessionId, UUID cashMovementId, boolean idempotentReplay) {}
}
