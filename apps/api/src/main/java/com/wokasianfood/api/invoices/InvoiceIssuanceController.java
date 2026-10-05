package com.wokasianfood.api.invoices;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Emision individual de un borrador: encola el trabajo en outbox dentro de la misma transaccion. */
@RestController
@RequestMapping("/api/v1/operational")
@PreAuthorize("hasAuthority('invoices:manage')")
public class InvoiceIssuanceController {
    private final InvoiceIssuanceService issuance;

    public InvoiceIssuanceController(InvoiceIssuanceService issuance) { this.issuance = issuance; }

    @PostMapping("/invoices/{invoiceId}/issue")
    public InvoiceService.InvoiceDetails issue(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID invoiceId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId) {
        return issuance.issue(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, invoiceId, idempotencyKey);
    }
}

@Service
class InvoiceIssuanceService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;
    private final InvoiceService invoices;

    InvoiceIssuanceService(JdbcTemplate jdbc, IdempotencyStore idempotency, InvoiceService invoices) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
        this.invoices = invoices;
    }

    @Transactional
    public InvoiceService.InvoiceDetails issue(UUID actor, UUID requestId, UUID invoiceId, UUID idempotencyKey) {
        String hash = fingerprint(invoiceId.toString());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "INVOICE_ISSUANCE_REQUESTED",
                idempotencyKey, hash);
        if (claim.replay()) return invoices.details(claim.resourceId());

        List<InvoiceRow> rows = jdbc.query("SELECT status, account_id FROM wok.invoices WHERE id = ? FOR UPDATE",
                (rs, row) -> new InvoiceRow(rs.getString("status"), rs.getObject("account_id", UUID.class)), invoiceId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la factura.");
        InvoiceRow invoice = rows.getFirst();
        if (!"DRAFT".equals(invoice.status())) throw new AuthException(409, "La factura no esta en borrador.");

        jdbc.query("SELECT id FROM wok.order_accounts WHERE id = ? FOR UPDATE",
                (rs, row) -> rs.getObject("id", UUID.class), invoice.accountId());
        jdbc.update("""
            UPDATE wok.invoices SET status = 'QUEUED', updated_at = now(), updated_by = ?,
                row_version = row_version + 1
            WHERE id = ?
            """, actor, invoiceId);
        jdbc.update("""
            INSERT INTO wok.outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type, payload, request_id)
            VALUES ('INVOICE', ?, 1, 'INVOICE_ISSUANCE_REQUESTED', jsonb_build_object('invoiceId', ?), ?)
            """, invoiceId, invoiceId, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'INVOICE_QUEUED', 'INVOICE', ?, jsonb_build_object('status', 'QUEUED'), 'SUCCESS', ?)
            """, actor, invoiceId, requestId);
        idempotency.complete(actor.toString(), "INVOICE_ISSUANCE_REQUESTED", idempotencyKey, invoiceId);
        return invoices.details(invoiceId);
    }

    private String fingerprint(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private record InvoiceRow(String status, UUID accountId) {}
}
