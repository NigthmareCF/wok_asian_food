package com.wokasianfood.api.payments;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.integration.PaymentGateway;
import com.wokasianfood.api.platform.IdempotencyStore;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Creates a pending provider intent for an accepted delivery; this endpoint never records a captured payment. */
@RestController
@RequestMapping("/api/v1/client/delivery-requests")
@PreAuthorize("hasRole('CLIENT')")
public class ClientPaymentIntentController {
    private static final String OPERATION = "CLIENT_DELIVERY_PAYMENT_INTENT";

    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;
    private final PaymentGateway gateway;

    public ClientPaymentIntentController(JdbcTemplate jdbc, IdempotencyStore idempotency, PaymentGateway gateway) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
        this.gateway = gateway;
    }

    @PostMapping("/{requestId}/payment-intents")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    public Receipt create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId,
            @RequestHeader("Idempotency-Key") UUID key) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        String fingerprint = fingerprint(requestId);
        IdempotencyStore.Result claim = idempotency.claim(customerId.toString(), OPERATION, key, fingerprint);
        if (claim.replay()) return receipt(claim.resourceId(), true);

        List<OrderForPayment> orders = jdbc.query("""
                SELECT r.status AS request_status, r.fulfillment_type, r.payment_preference,
                       o.id AS order_id, o.account_id, o.status AS order_status, o.total, o.currency_id,
                       c.code AS currency_code, a.status AS account_status
                FROM wok.order_requests r
                JOIN wok.orders o ON o.id = r.order_id
                JOIN wok.order_accounts a ON a.id = o.account_id
                JOIN wok.currencies c ON c.id = o.currency_id
                WHERE r.id = ? AND r.customer_user_id = ?
                FOR UPDATE OF r, o, a
                """, (rs, row) -> new OrderForPayment(rs.getString("request_status"),
                rs.getString("fulfillment_type"), rs.getString("payment_preference"),
                rs.getObject("order_id", UUID.class), rs.getObject("account_id", UUID.class),
                rs.getString("order_status"), rs.getBigDecimal("total"),
                rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
                rs.getString("account_status")), requestId, customerId);
        if (orders.isEmpty()) throw new AuthException(404, "No encontramos la solicitud.");
        OrderForPayment order = orders.getFirst();
        if (!"ACCEPTED".equals(order.requestStatus()) || !"DELIVERY".equals(order.fulfillmentType())
                || !"ONLINE_PAYMENT_REQUESTED".equals(order.paymentPreference()))
            throw new AuthException(409, "Esta solicitud no tiene un cobro online habilitado.");
        if ("CANCELLED".equals(order.orderStatus()) || "CLOSED".equals(order.orderStatus())
                || "CLOSED".equals(order.accountStatus()) || "PAID".equals(order.accountStatus()))
            throw new AuthException(409, "El pedido ya no admite un cobro online.");

        Integer accountOrderCount = jdbc.queryForObject(
                "SELECT count(*) FROM wok.orders WHERE account_id = ? AND status <> 'CANCELLED'",
                Integer.class, order.accountId());
        if (accountOrderCount == null || accountOrderCount != 1)
            throw new AuthException(409, "No se puede calcular un cobro exclusivo para esta solicitud.");

        BigDecimal alreadyPaid = jdbc.queryForObject("""
                SELECT COALESCE(SUM(p.amount - COALESCE(refunds.amount, 0)), 0)
                FROM wok.payments p
                LEFT JOIN LATERAL (
                    SELECT SUM(refund_amount) AS amount FROM wok.payment_refunds
                    WHERE payment_id = p.id AND status = 'RECORDED_MANUALLY'
                ) refunds ON true
                WHERE p.account_id = ? AND p.status <> 'VOIDED'
                """, BigDecimal.class, order.accountId());
        BigDecimal outstanding = order.total().subtract(alreadyPaid == null ? BigDecimal.ZERO : alreadyPaid);
        if (outstanding.signum() <= 0) throw new AuthException(409, "El pedido no tiene saldo pendiente.");

        List<UUID> pendingIds = jdbc.query("""
                SELECT id FROM wok.payment_intents
                WHERE order_id = ? AND status IN ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'UNKNOWN')
                ORDER BY created_at DESC, id DESC LIMIT 1
                """, (rs, row) -> rs.getObject(1, UUID.class), order.orderId());
        if (!pendingIds.isEmpty()) {
            UUID existingId = pendingIds.getFirst();
            idempotency.complete(customerId.toString(), OPERATION, key, existingId);
            return receipt(existingId, true);
        }

        String providerKey = customerId + ":" + requestId + ":" + key;
        PaymentGateway.PaymentIntent created = gateway.createIntent(
                order.orderId(), outstanding, order.currencyCode(), providerKey);
        if (created.state() == PaymentGateway.State.CAPTURED)
            throw new IllegalStateException("Payment intent providers must not capture funds during intent creation");

        UUID intentId = jdbc.queryForObject("""
                INSERT INTO wok.payment_intents
                    (order_id, account_id, customer_user_id, provider, provider_reference, amount, currency_id, status)
                VALUES (?, ?, ?, 'MOCK', ?, ?, ?, ?)
                RETURNING id
                """, UUID.class, order.orderId(), order.accountId(), customerId,
                created.providerReference(), outstanding, order.currencyId(), created.state().name());
        jdbc.update("""
                INSERT INTO wok.audit_logs
                    (actor_user_id, action, entity_type, entity_id, after_data, result)
                VALUES (?, 'CLIENT_PAYMENT_INTENT_CREATED', 'PAYMENT_INTENT', ?,
                        jsonb_build_object('orderId', ?, 'provider', 'MOCK', 'status', ?, 'amount', ?), 'SUCCESS')
                """, customerId, intentId, order.orderId(), created.state().name(), outstanding);
        idempotency.complete(customerId.toString(), OPERATION, key, intentId);
        return receipt(intentId, false);
    }

    @GetMapping("/{requestId}/payment-intents/current")
    @Transactional(readOnly = true)
    public ResponseEntity<PaymentIntentStatus> current(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        List<UUID> ownedRequests = jdbc.query("""
                SELECT order_id FROM wok.order_requests
                WHERE id = ? AND customer_user_id = ?
                """, (rs, row) -> rs.getObject("order_id", UUID.class), requestId, customerId);
        if (ownedRequests.isEmpty()) throw new AuthException(404, "No encontramos la solicitud.");
        UUID orderId = ownedRequests.getFirst();
        if (orderId == null) return ResponseEntity.noContent().build();

        List<PaymentIntentStatus> intents = jdbc.query("""
                SELECT i.id, i.order_id, i.provider, i.provider_reference, i.amount, i.status, i.created_at,
                       c.code AS currency_code
                FROM wok.order_requests r
                JOIN wok.payment_intents i ON i.order_id = r.order_id
                    AND i.customer_user_id = r.customer_user_id
                JOIN wok.currencies c ON c.id = i.currency_id
                WHERE r.id = ? AND r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY'
                  AND r.payment_preference = 'ONLINE_PAYMENT_REQUESTED'
                ORDER BY i.created_at DESC, i.id DESC LIMIT 1
                """, (rs, row) -> new PaymentIntentStatus(rs.getObject("id", UUID.class),
                rs.getObject("order_id", UUID.class), rs.getString("provider"),
                rs.getString("provider_reference"), rs.getBigDecimal("amount"),
                rs.getString("currency_code"), rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(),
                "Solicitud de cobro en modo de prueba. No se ha procesado ni confirmado ningún pago."),
                requestId, customerId);
        return intents.isEmpty() ? ResponseEntity.noContent().build() : ResponseEntity.ok(intents.getFirst());
    }

    private Receipt receipt(UUID intentId, boolean replay) {
        List<Receipt> rows = jdbc.query("""
                SELECT i.id, i.order_id, i.provider, i.provider_reference, i.amount, i.status, i.created_at,
                       c.code AS currency_code
                FROM wok.payment_intents i JOIN wok.currencies c ON c.id = i.currency_id
                WHERE i.id = ?
                """, (rs, row) -> new Receipt(rs.getObject("id", UUID.class),
                rs.getObject("order_id", UUID.class), rs.getString("provider"),
                rs.getString("provider_reference"), rs.getBigDecimal("amount"),
                rs.getString("currency_code"), rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(), replay,
                "Solicitud de cobro en modo de prueba. No se ha procesado ni confirmado ningún pago."), intentId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el intento de cobro.");
        return rows.getFirst();
    }

    private String fingerprint(UUID requestId) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(requestId.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    public record Receipt(UUID intentId, UUID orderId, String provider, String providerReference,
                          BigDecimal amount, String currency, String status, java.time.Instant createdAt,
                          boolean idempotentReplay, String message) {}

    public record PaymentIntentStatus(UUID intentId, UUID orderId, String provider, String providerReference,
                                      BigDecimal amount, String currency, String status,
                                      java.time.Instant createdAt, String message) {}

    private record OrderForPayment(String requestStatus, String fulfillmentType, String paymentPreference,
                                   UUID orderId, UUID accountId, String orderStatus, BigDecimal total,
                                   UUID currencyId, String currencyCode, String accountStatus) {}
}
