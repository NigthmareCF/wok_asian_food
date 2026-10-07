package com.wokasianfood.api.payments;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
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

    @PostMapping("/{accountId}/payments/{paymentId}/refunds")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentService.RefundReceipt refund(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId,
            @PathVariable UUID paymentId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody RefundRequest request) {
        return payments.recordRefund(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, accountId, paymentId, idempotencyKey, request);
    }

    public record PaymentRequest(@NotNull PaymentMethod method,
                                 @DecimalMin(value = "0.01") BigDecimal amount,
                                 @DecimalMin(value = "0.00") BigDecimal tipAmount,
                                 @Size(max = 120) String reference,
                                 @Size(max = 32) String registerCode,
                                 CollectionSource collectionSource,
                                 UUID courierUserId) {}

    public record RefundRequest(@DecimalMin(value = "0.00") BigDecimal amount,
                                @DecimalMin(value = "0.00") BigDecimal tipAmount,
                                @NotNull RefundMethod method,
                                @Size(max = 120) String reference,
                                @Size(max = 32) String registerCode,
                                @NotBlank @Size(min = 3, max = 500) String reason) {}

    public enum PaymentMethod { CASH, CARD_EXTERNAL, TRANSFER }
    public enum CollectionSource { REGISTER, COURIER }
    public enum RefundMethod { CASH, CARD_EXTERNAL, TRANSFER }
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
        PaymentController.CollectionSource collectionSource = request.collectionSource() == null
                ? PaymentController.CollectionSource.REGISTER : request.collectionSource();
        UUID courierUserId = request.courierUserId();
        if ((collectionSource == PaymentController.CollectionSource.COURIER)
                != (request.method() == PaymentController.PaymentMethod.CASH && courierUserId != null))
            throw new AuthException(422, "El cobro por repartidor requiere efectivo y una persona responsable; otros cobros van a caja.");
        String requestedAmount = request.amount() == null
                ? "FULL" : request.amount().stripTrailingZeros().toPlainString();
        BigDecimal tip = request.tipAmount() == null ? BigDecimal.ZERO : request.tipAmount();
        String hash = collectionSource == PaymentController.CollectionSource.COURIER
                ? fingerprint(accountId.toString(), request.method().name(), requestedAmount,
                    tip.stripTrailingZeros().toPlainString(), reference, registerCode, collectionSource.name(),
                    courierUserId.toString())
                : fingerprint(accountId.toString(), request.method().name(), requestedAmount,
                    tip.stripTrailingZeros().toPlainString(), reference, registerCode);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "ACCOUNT_PAYMENT_CAPTURED",
                idempotencyKey, hash);
        if (claim.replay()) return receipt(claim.resourceId(), true);

        Account account = lockAccount(accountId);
        if (collectionSource == PaymentController.CollectionSource.COURIER)
            requireAssignedDeliveryCourier(accountId, courierUserId);
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
        if (request.method() == PaymentController.PaymentMethod.CASH
                && collectionSource == PaymentController.CollectionSource.REGISTER) {
            cashSessionId = currentCashSession(registerCode);
            if (cashSessionId == null)
                throw new AuthException(409, "No hay una caja abierta para registrar el cobro en efectivo.");
        }

        UUID paymentId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.payments
                (id, account_id, cash_session_id, amount, tip_amount, currency_id, method, reference,
                 captured_by, request_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, paymentId, accountId, cashSessionId, amount, tip, billing.currencyId(),
                request.method().name(), reference, actor, requestId);

        if (collectionSource == PaymentController.CollectionSource.COURIER) {
            jdbc.update("""
                INSERT INTO wok.courier_cash_collections (payment_id, courier_user_id, recorded_by)
                VALUES (?, ?, ?)
                """, paymentId, courierUserId, actor);
        }

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
        idempotency.complete(actor.toString(), "ACCOUNT_PAYMENT_CAPTURED", idempotencyKey, paymentId);
        return receipt(paymentId, false);
    }

    private void requireAssignedDeliveryCourier(UUID accountId, UUID courierUserId) {
        List<UUID> deliveries = jdbc.query("""
            SELECT d.id FROM wok.orders o
            JOIN wok.delivery_dispatches d ON d.order_id = o.id
            JOIN wok.users u ON u.id = d.assigned_to_user_id
            JOIN wok.user_roles ur ON ur.user_id = u.id
            JOIN wok.roles r ON r.id = ur.role_id
            WHERE o.account_id = ? AND o.channel = 'DELIVERY'
              AND d.assigned_to_user_id = ? AND d.status IN ('OUT_FOR_DELIVERY', 'DELIVERED')
              AND u.status = 'ACTIVE' AND r.code IN ('OPERATIONAL', 'ADMIN')
            ORDER BY o.id, d.id FOR SHARE OF o, d
            """, (rs, row) -> rs.getObject(1, UUID.class), accountId, courierUserId);
        if (deliveries.isEmpty())
            throw new AuthException(409, "El efectivo sólo puede asignarse al repartidor activo del pedido en curso.");
    }

    @Transactional
    RefundReceipt recordRefund(UUID actor, UUID requestId, UUID accountId, UUID paymentId, UUID idempotencyKey,
                               PaymentController.RefundRequest request) {
        BigDecimal amount = money(request.amount() == null ? BigDecimal.ZERO : request.amount(), "monto devuelto");
        BigDecimal tip = money(request.tipAmount() == null ? BigDecimal.ZERO : request.tipAmount(), "propina devuelta");
        if (amount.signum() < 0 || tip.signum() < 0 || amount.add(tip).signum() <= 0)
            throw new AuthException(422, "Indica un monto de venta o propina mayor a cero.");
        String reason = request.reason().trim();
        String reference = clean(request.reference());
        String register = request.registerCode() == null || request.registerCode().isBlank()
                ? "MAIN" : request.registerCode().trim().toUpperCase(Locale.ROOT);
        String hash = fingerprint(accountId.toString(), paymentId.toString(), amount.toPlainString(), tip.toPlainString(),
                request.method().name(), reference, register, reason);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "PAYMENT_REFUND_RECORDED",
                idempotencyKey, hash);
        if (claim.replay()) return refundReceipt(claim.resourceId(), true);

        Account account = lockAccount(accountId);
        List<RefundablePayment> locked = jdbc.query("""
            SELECT id, account_id, cash_session_id, amount, tip_amount, method, status
            FROM wok.payments WHERE id = ? AND account_id = ? FOR UPDATE
            """, (rs, row) -> new RefundablePayment(rs.getObject("id", UUID.class),
                rs.getObject("account_id", UUID.class), rs.getObject("cash_session_id", UUID.class),
                rs.getBigDecimal("amount"), rs.getBigDecimal("tip_amount"), rs.getString("method"),
                rs.getString("status")), paymentId, accountId);
        if (locked.isEmpty()) throw new AuthException(404, "No encontramos el pago.");
        RefundablePayment payment = locked.getFirst();
        if ("VOIDED".equals(payment.status()) || "REFUNDED".equals(payment.status()))
            throw new AuthException(409, "El pago ya fue anulado o reembolsado completamente.");
        if ("CASH".equals(payment.method()) && request.method() != PaymentController.RefundMethod.CASH)
            throw new AuthException(422, "Un pago en efectivo debe devolverse en efectivo.");
        if ((request.method() == PaymentController.RefundMethod.CARD_EXTERNAL
                || request.method() == PaymentController.RefundMethod.TRANSFER) && reference == null)
            throw new AuthException(422, "Registra la referencia del reembolso procesado manualmente.");
        BigDecimal[] refunded = refundTotals(paymentId);
        BigDecimal refundableAmount = payment.amount().subtract(refunded[0]);
        BigDecimal refundableTip = payment.tipAmount().subtract(refunded[1]);
        if (amount.compareTo(refundableAmount) > 0 || tip.compareTo(refundableTip) > 0)
            throw new AuthException(422, "El reembolso supera el saldo disponible del pago o de la propina.");

        UUID cashSessionId = null;
        if (request.method() == PaymentController.RefundMethod.CASH) {
            cashSessionId = currentRefundCashSession(register);
            if (cashSessionId == null)
                throw new AuthException(409, "Abre la caja antes de registrar una devolución en efectivo.");
        }
        UUID refundId = UUID.randomUUID();
        BigDecimal refundTotal = amount.add(tip);
        jdbc.update("""
            INSERT INTO wok.payment_refunds
                (id, payment_id, cash_session_id, refund_amount, tip_refund_amount, refund_method,
                 reference, reason, recorded_by, request_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, refundId, paymentId, cashSessionId, amount, tip, request.method().name(), reference,
                reason, actor, requestId);
        UUID cashMovementId = null;
        if (cashSessionId != null) {
            cashMovementId = jdbc.queryForObject("""
                INSERT INTO wok.cash_movements
                    (cash_session_id, movement_type, amount_delta, refund_id, reason, responsible_user_id, request_id)
                VALUES (?, 'REFUND', ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, cashSessionId, refundTotal.negate(), refundId,
                "Devolución de pago: " + reason, actor, requestId);
        }

        BigDecimal refundedPrincipal = refunded[0].add(amount);
        BigDecimal refundedTip = refunded[1].add(tip);
        String nextPaymentStatus = refundedPrincipal.compareTo(payment.amount()) == 0
                && refundedTip.compareTo(payment.tipAmount()) == 0 ? "REFUNDED" : "PARTIALLY_REFUNDED";
        jdbc.update("UPDATE wok.payments SET status = ? WHERE id = ?", nextPaymentStatus, paymentId);
        Billing billing = billing(accountId);
        BigDecimal previouslyPaid = previouslyPaid(accountId);
        BigDecimal remaining = billing.total().subtract(previouslyPaid);
        if (remaining.signum() > 0 && "PAID".equals(account.status())) {
            jdbc.update("""
                UPDATE wok.order_accounts SET status = 'OPEN', updated_at = now(), updated_by = ?,
                    row_version = row_version + 1 WHERE id = ? AND status = 'PAID'
                """, actor, accountId);
        }
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, reason, result, request_id)
            VALUES (?, 'PAYMENT_REFUND_RECORDED', 'PAYMENT_REFUND', ?,
                    jsonb_build_object('paymentId', ?, 'amount', ?, 'tipAmount', ?, 'method', ?,
                                       'status', 'RECORDED_MANUALLY', 'remainingBalance', ?),
                    ?, 'SUCCESS', ?)
            """, actor, refundId, paymentId, amount, tip, request.method().name(), remaining, reason, requestId);
        idempotency.complete(actor.toString(), "PAYMENT_REFUND_RECORDED", idempotencyKey, refundId);
        return refundReceipt(refundId, false);
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
            SELECT COALESCE(SUM(p.amount - COALESCE(refunds.amount, 0)), 0)
            FROM wok.payments p
            LEFT JOIN LATERAL (
                SELECT SUM(refund_amount) AS amount FROM wok.payment_refunds
                WHERE payment_id = p.id AND status = 'RECORDED_MANUALLY'
            ) refunds ON true
            WHERE p.account_id = ? AND p.status <> 'VOIDED'
            """, BigDecimal.class, accountId);
        return paid == null ? BigDecimal.ZERO : paid;
    }

    private UUID currentCashSession(String registerCode) {
        List<UUID> ids = jdbc.query("""
            SELECT s.id FROM wok.cash_sessions s
            JOIN wok.cash_registers r ON r.id = s.cash_register_id
            WHERE r.code = ? AND s.status IN ('OPEN', 'CLOSING')
            ORDER BY s.opened_at DESC LIMIT 1
            FOR UPDATE OF s
            """, (rs, row) -> rs.getObject(1, UUID.class), registerCode);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private PaymentReceipt receipt(UUID paymentId, boolean replay) {
        List<PaymentReceipt> rows = jdbc.query("""
            SELECT p.id, p.account_id, p.amount, p.tip_amount, p.method, p.status, p.reference, p.cash_session_id,
                   c.code AS currency_code, a.status AS account_status, m.id AS cash_movement_id,
                   (SELECT COALESCE(SUM(o.total), 0) FROM wok.orders o
                     WHERE o.account_id = p.account_id AND o.status <> 'CANCELLED')
                   - (SELECT COALESCE(SUM(pay.amount - COALESCE(refunds.amount, 0)), 0)
                      FROM wok.payments pay LEFT JOIN LATERAL (
                        SELECT SUM(refund_amount) AS amount FROM wok.payment_refunds
                        WHERE payment_id = pay.id AND status = 'RECORDED_MANUALLY'
                      ) refunds ON true
                      WHERE pay.account_id = p.account_id AND pay.status <> 'VOIDED') AS balance,
                   COALESCE((SELECT SUM(refund_amount) FROM wok.payment_refunds
                             WHERE payment_id = p.id AND status = 'RECORDED_MANUALLY'), 0) AS refunded_amount,
                   COALESCE((SELECT SUM(tip_refund_amount) FROM wok.payment_refunds
                             WHERE payment_id = p.id AND status = 'RECORDED_MANUALLY'), 0) AS refunded_tip_amount
            FROM wok.payments p
            JOIN wok.currencies c ON c.id = p.currency_id
            JOIN wok.order_accounts a ON a.id = p.account_id
            LEFT JOIN wok.cash_movements m ON m.payment_id = p.id
            WHERE p.id = ?
            """, (rs, row) -> new PaymentReceipt(rs.getObject("id", UUID.class),
                rs.getObject("account_id", UUID.class), rs.getString("account_status"),
                rs.getBigDecimal("amount"), rs.getBigDecimal("tip_amount"), rs.getString("currency_code"),
                rs.getString("method"), rs.getString("status"), rs.getString("reference"), rs.getBigDecimal("balance"),
                rs.getObject("cash_session_id", UUID.class), rs.getObject("cash_movement_id", UUID.class),
                rs.getBigDecimal("refunded_amount"), rs.getBigDecimal("refunded_tip_amount"), replay),
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

    private UUID currentRefundCashSession(String registerCode) {
        List<UUID> ids = jdbc.query("""
            SELECT s.id FROM wok.cash_sessions s
            JOIN wok.cash_registers r ON r.id = s.cash_register_id
            WHERE r.code = ? AND r.active = true AND s.status = 'OPEN'
            ORDER BY s.opened_at DESC LIMIT 1 FOR UPDATE OF s
            """, (rs, row) -> rs.getObject(1, UUID.class), registerCode);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private BigDecimal[] refundTotals(UUID paymentId) {
        return jdbc.queryForObject("""
            SELECT COALESCE(SUM(refund_amount), 0), COALESCE(SUM(tip_refund_amount), 0)
            FROM wok.payment_refunds WHERE payment_id = ? AND status = 'RECORDED_MANUALLY'
            """, (rs, row) -> new BigDecimal[] {rs.getBigDecimal(1), rs.getBigDecimal(2)}, paymentId);
    }

    private RefundReceipt refundReceipt(UUID refundId, boolean replay) {
        List<RefundReceipt> rows = jdbc.query("""
            SELECT r.id, r.payment_id, r.refund_amount, r.tip_refund_amount, r.refund_method, r.status,
                   r.reference, r.cash_session_id, p.account_id, a.status AS account_status,
                   (SELECT id FROM wok.cash_movements WHERE refund_id = r.id) AS cash_movement_id,
                   (SELECT COALESCE(SUM(o.total), 0) FROM wok.orders o
                    WHERE o.account_id = p.account_id AND o.status <> 'CANCELLED')
                   - (SELECT COALESCE(SUM(pay.amount - COALESCE(refunds.amount, 0)), 0)
                      FROM wok.payments pay LEFT JOIN LATERAL (
                        SELECT SUM(refund_amount) AS amount FROM wok.payment_refunds
                        WHERE payment_id = pay.id AND status = 'RECORDED_MANUALLY'
                      ) refunds ON true
                      WHERE pay.account_id = p.account_id AND pay.status <> 'VOIDED') AS balance
            FROM wok.payment_refunds r JOIN wok.payments p ON p.id = r.payment_id
            JOIN wok.order_accounts a ON a.id = p.account_id
            WHERE r.id = ?
            """, (rs, row) -> new RefundReceipt(rs.getObject("id", UUID.class),
                rs.getObject("payment_id", UUID.class), rs.getObject("account_id", UUID.class),
                rs.getString("account_status"), rs.getBigDecimal("refund_amount"),
                rs.getBigDecimal("tip_refund_amount"), rs.getString("refund_method"), rs.getString("status"),
                rs.getString("reference"), rs.getBigDecimal("balance"), rs.getObject("cash_session_id", UUID.class),
                rs.getObject("cash_movement_id", UUID.class), replay), refundId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el reembolso registrado.");
        return rows.getFirst();
    }

    private BigDecimal money(BigDecimal value, String label) {
        try { return value.setScale(2, java.math.RoundingMode.UNNECESSARY); }
        catch (ArithmeticException invalidScale) { throw new AuthException(422, "El " + label + " admite hasta dos decimales."); }
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private record Account(UUID id, String name, String status) {}

    private record RefundablePayment(UUID id, UUID accountId, UUID cashSessionId, BigDecimal amount,
                                     BigDecimal tipAmount, String method, String status) {}

    private record Billing(BigDecimal total, int orderCount, int openCount, int currencyCount,
                           UUID currencyId) {}

    public record PaymentReceipt(UUID paymentId, UUID accountId, String accountStatus, BigDecimal amount,
                                 BigDecimal tipAmount, String currency, String method, String status, String reference,
                                 BigDecimal balance, UUID cashSessionId, UUID cashMovementId,
                                 BigDecimal refundedAmount, BigDecimal refundedTipAmount, boolean idempotentReplay) {}
    public record RefundReceipt(UUID refundId, UUID paymentId, UUID accountId, String accountStatus,
                                BigDecimal amount, BigDecimal tipAmount, String method, String status,
                                String reference, BigDecimal balance, UUID cashSessionId,
                                UUID cashMovementId, boolean idempotentReplay) {}
}
