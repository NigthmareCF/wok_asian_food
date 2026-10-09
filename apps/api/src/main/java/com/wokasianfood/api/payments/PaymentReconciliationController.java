package com.wokasianfood.api.payments;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Read-only queue for payment intents whose provider outcome requires a human reconciliation. */
@RestController
@RequestMapping("/api/v1/operational/payment-intents/reconciliation")
@PreAuthorize("hasAuthority('payments:manage')")
public class PaymentReconciliationController {
    private final JdbcTemplate jdbc;

    public PaymentReconciliationController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public List<UnknownPaymentIntent> listUnknown(
            @RequestParam(defaultValue = "50") @Min(1) @Max(100) int limit,
            @RequestParam(defaultValue = "0") @Min(0) int offset) {
        return jdbc.query("""
                SELECT intent.id, intent.order_id, request.id AS request_id, order_row.code AS order_code,
                       intent.provider, intent.provider_reference, intent.amount, currency.code AS currency,
                       intent.status, intent.created_at, intent.updated_at
                FROM wok.payment_intents intent
                JOIN wok.orders order_row ON order_row.id = intent.order_id
                JOIN wok.order_requests request ON request.order_id = order_row.id
                    AND request.fulfillment_type = 'DELIVERY'
                JOIN wok.currencies currency ON currency.id = intent.currency_id
                WHERE intent.status = 'UNKNOWN'
                ORDER BY intent.updated_at, intent.id
                LIMIT ? OFFSET ?
                """, (rs, row) -> new UnknownPaymentIntent(
                rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getObject("request_id", UUID.class), rs.getString("order_code"), rs.getString("provider"),
                rs.getString("provider_reference"), rs.getBigDecimal("amount"), rs.getString("currency"),
                rs.getString("status"), rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant()), limit, offset);
    }

    public record UnknownPaymentIntent(UUID intentId, UUID orderId, UUID requestId, String orderCode,
            String provider, String providerReference, BigDecimal amount, String currency, String status,
            Instant createdAt, Instant updatedAt) {}
}
