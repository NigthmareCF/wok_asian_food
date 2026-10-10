package com.wokasianfood.api.payments;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.accounts.AccountFinancialTotalsService;
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
import org.springframework.web.bind.annotation.GetMapping;
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
    private final PaymentAttemptService attempts;

    public PaymentController(PaymentService payments, PaymentAttemptService attempts) {
        this.payments = payments;
        this.attempts = attempts;
    }

    @GetMapping("/{accountId}/payments/by-idempotency-key/{key}")
    public PaymentService.PaymentReceipt confirmed(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @PathVariable UUID key) {
        return payments.confirmed(UUID.fromString(jwt.getSubject()), accountId, key);
    }

    @PostMapping("/{accountId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentService.PaymentReceipt capture(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody PaymentRequest request) {
        return attempts.legacyCapture(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, accountId, idempotencyKey, request);
    }

    public record PaymentRequest(@NotNull PaymentMethod method,
                                 @DecimalMin(value = "0.01") BigDecimal amount,
                                 @DecimalMin(value = "0.00") BigDecimal tipAmount,
                                 @Size(max = 120) String reference,
                                 @Size(max = 32) String registerCode) {}

    public enum PaymentMethod { CASH, CARD_EXTERNAL, TRANSFER }
}

@Service
class PaymentService {
    private final JdbcTemplate jdbc;
    private final AccountFinancialTotalsService financialTotals;
    private final IdempotencyStore idempotency;

    PaymentService(JdbcTemplate jdbc, IdempotencyStore idempotency,
                   AccountFinancialTotalsService financialTotals) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
        this.financialTotals = financialTotals;
    }

    Normalized normalize(UUID accountId, PaymentController.PaymentRequest request) {
        if (request.method() == null || (request.amount() != null && request.amount().signum() <= 0)
                || (request.reference() != null && request.reference().length() > 120)
                || (request.registerCode() != null && request.registerCode().length() > 32))
            throw new AuthException(422, "Los datos del cobro no son válidos.");
        String reference = request.reference() == null || request.reference().isBlank()
                ? null : request.reference().trim();
        String registerCode = request.registerCode() == null || request.registerCode().isBlank()
                ? "MAIN" : request.registerCode().trim().toUpperCase(Locale.ROOT);
        String requestedAmount = request.amount() == null
                ? "FULL" : request.amount().stripTrailingZeros().toPlainString();
        BigDecimal requestedPayment = request.amount() == null ? null : money(request.amount());
        BigDecimal tip = request.tipAmount() == null ? BigDecimal.ZERO : money(request.tipAmount());
        String hash = fingerprint(accountId.toString(), request.method().name(), requestedAmount,
                tip.stripTrailingZeros().toPlainString(), reference, registerCode);
        return new Normalized(request.method(), requestedPayment, tip, reference, registerCode, hash);
    }

    // Only SELECTs/locks: a business rejection here proves no financial writes occurred.
    Candidate candidate(UUID accountId, Normalized request, UUID expectedCurrency, boolean lockCash) {
        Account account = lockAccount(accountId);
        if (!"OPEN".equals(account.status()) && !"IN_COBRO".equals(account.status()))
            throw new AuthException(409, "La cuenta ya fue cobrada o no admite cobros.");
        Billing billing = billing(accountId);
        if (billing.orderCount() == 0)
            throw new AuthException(422, "La cuenta no tiene consumos por cobrar.");
        if (billing.openCount() > 0)
            throw new AuthException(409, "La cuenta tiene pedidos todavía no servidos.");
        if (billing.currencyCount() != 1)
            throw new AuthException(422, "No se pueden cobrar cuentas con varias monedas.");
        if (Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM wok.payments
                              WHERE account_id = ? AND status = 'CAPTURED' AND currency_id <> ?)
                """, Boolean.class, accountId, billing.currencyId())))
            throw new AuthException(422, "Los pagos registrados y los consumos tienen monedas distintas; se requiere revisión.");

        BigDecimal previouslyPaid = previouslyPaid(accountId);
        BigDecimal outstanding = billing.total().subtract(previouslyPaid);
        if (outstanding.signum() <= 0)
            throw new AuthException(409, "La cuenta no tiene saldo pendiente.");
        BigDecimal amount = request.amount() == null ? money(outstanding) : request.amount();
        if (amount.compareTo(outstanding) > 0)
            throw new AuthException(422, "El monto excede el saldo pendiente de la cuenta.");
        BigDecimal remaining = outstanding.subtract(amount);

        UUID cashSessionId = null;
        if (expectedCurrency != null && !expectedCurrency.equals(billing.currencyId()))
            throw new AuthException(422, "La moneda preparada no coincide con los consumos; requiere conciliación.");
        if (lockCash && request.method() == PaymentController.PaymentMethod.CASH) {
            cashSessionId = currentCashSession(request.registerCode(), billing.currencyId());
            if (cashSessionId == null)
                throw new AuthException(409, "No hay una caja abierta para registrar el cobro en efectivo.");
        }
        return new Candidate(amount, remaining, billing.currencyId(), cashSessionId);
    }

    UUID writeCapture(UUID actor, UUID requestId, UUID accountId, Normalized request, Candidate candidate) {
        BigDecimal amount = candidate.amount();
        BigDecimal remaining = candidate.remaining();
        BigDecimal tip = request.tip();
        UUID cashSessionId = candidate.cashSessionId();
        UUID paymentId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.payments
                (id, account_id, cash_session_id, amount, tip_amount, currency_id, method, reference,
                 captured_by, request_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, paymentId, accountId, cashSessionId, amount, tip, candidate.currencyId(),
                request.method().name(), request.reference(), actor, requestId);

        UUID cashMovementId = null;
        if (cashSessionId != null) {
            cashMovementId = jdbc.queryForObject("""
                INSERT INTO wok.cash_movements
                    (cash_session_id, movement_type, amount_delta, payment_id, reason, responsible_user_id, request_id)
                VALUES (?, 'SALE', ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, cashSessionId, amount, paymentId, "Cobro de cuenta", actor, requestId);
            if (tip.signum() > 0) {
                jdbc.update("""
                    INSERT INTO wok.cash_movements
                        (cash_session_id, movement_type, amount_delta, reason, responsible_user_id)
                    VALUES (?, 'INCOME', ?, 'Propina de cuenta', ?)
                    """, cashSessionId, tip, actor);
            }
        }

        if (cashSessionId != null) {
            jdbc.update("""
                UPDATE wok.cash_sessions SET row_version = row_version + 1, updated_at = now(), updated_by = ?
                WHERE id = ? AND status = 'OPEN'
                """, actor, cashSessionId);
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
                    jsonb_build_object('accountId', ?, 'amount', ?, 'tip', ?, 'method', ?, 'balance', ?),
                    'SUCCESS', ?)
            """, actor, paymentId, accountId, amount, tip, request.method().name(), remaining, requestId);
        return paymentId;
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public PaymentReceipt confirmed(UUID actor, UUID accountId, UUID key) {
        List<UUID> payments = jdbc.query("""
            SELECT p.id FROM wok.idempotency_keys k
            JOIN wok.payments p ON p.id = k.resource_id
            WHERE k.principal_scope = ? AND k.operation = 'ACCOUNT_PAYMENT_CAPTURED'
              AND k.key = ? AND k.status = 'COMPLETED' AND p.account_id = ? AND p.captured_by = ?
            """, (rs, row) -> rs.getObject(1, UUID.class), actor.toString(), key.toString(), accountId, actor);
        if (payments.isEmpty())
            throw new AuthException(404, "Este intento todavía no tiene una confirmación consultable.");
        return receipt(payments.getFirst(), true);
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
                   COUNT(*) FILTER (WHERE o.status NOT IN ('SERVED', 'CLOSED', 'CANCELLED')) AS open_count,
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

    private UUID currentCashSession(String registerCode, UUID currencyId) {
        List<UUID> ids = jdbc.query("""
            SELECT s.id, r.currency_id FROM wok.cash_sessions s
            JOIN wok.cash_registers r ON r.id = s.cash_register_id
            WHERE r.code = ? AND s.status = 'OPEN'
            ORDER BY s.opened_at DESC LIMIT 1
            FOR UPDATE OF s
            """, (rs, row) -> {
                if (!currencyId.equals(rs.getObject("currency_id", UUID.class)))
                    throw new AuthException(422, "La moneda de la cuenta no coincide con la moneda de la caja.");
                return rs.getObject(1, UUID.class);
            }, registerCode);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    PaymentReceipt receipt(UUID paymentId, boolean replay) {
        List<PaymentReceipt> rows = jdbc.query("""
            SELECT p.id, p.account_id, p.amount, p.tip_amount, p.method, p.status, p.reference, p.cash_session_id,
                   c.code AS currency_code, a.status AS account_status, m.id AS cash_movement_id
            FROM wok.payments p
            JOIN wok.currencies c ON c.id = p.currency_id
            JOIN wok.order_accounts a ON a.id = p.account_id
            LEFT JOIN wok.cash_movements m ON m.payment_id = p.id
            WHERE p.id = ?
            """, (rs, row) -> new PaymentReceipt(rs.getObject("id", UUID.class),
                rs.getObject("account_id", UUID.class), rs.getString("account_status"),
                rs.getBigDecimal("amount"), rs.getBigDecimal("tip_amount"), rs.getString("currency_code"),
                rs.getString("method"), rs.getString("status"), rs.getString("reference"), null,
                rs.getObject("cash_session_id", UUID.class), rs.getObject("cash_movement_id", UUID.class), replay),
            paymentId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el pago.");
        PaymentReceipt receipt = rows.getFirst();
        BigDecimal balance = financialTotals.totals(receipt.accountId()).receiptBalance(paymentId, receipt.currency());
        return new PaymentReceipt(receipt.paymentId(), receipt.accountId(), receipt.accountStatus(), receipt.amount(),
                receipt.tipAmount(), receipt.currency(), receipt.method(), receipt.status(), receipt.reference(), balance,
                receipt.cashSessionId(), receipt.cashMovementId(), receipt.idempotentReplay());
    }

    private BigDecimal money(BigDecimal value) {
        try {
            BigDecimal exact = value.setScale(2, java.math.RoundingMode.UNNECESSARY);
            if (exact.signum() < 0 || exact.compareTo(new BigDecimal("999999999999.99")) > 0)
                throw new AuthException(422, "El monto está fuera del rango permitido.");
            return exact;
        } catch (ArithmeticException invalidPrecision) {
            throw new AuthException(422, "El monto debe expresarse con precisión de centavos.");
        }
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

    record Normalized(PaymentController.PaymentMethod method, BigDecimal amount, BigDecimal tip,
                      String reference, String registerCode, String hash) {
        Normalized withAmount(BigDecimal frozen) {
            return new Normalized(method, frozen, tip, reference, registerCode, hash);
        }
    }
    record Candidate(BigDecimal amount, BigDecimal remaining, UUID currencyId, UUID cashSessionId) {}

    public record PaymentReceipt(UUID paymentId, UUID accountId, String accountStatus, BigDecimal amount,
                                 BigDecimal tipAmount, String currency, String method, String status, String reference,
                                 BigDecimal balance, UUID cashSessionId, UUID cashMovementId, boolean idempotentReplay) {}
}
