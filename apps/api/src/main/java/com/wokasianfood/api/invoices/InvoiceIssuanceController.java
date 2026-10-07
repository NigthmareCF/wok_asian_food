package com.wokasianfood.api.invoices;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Emision individual de un borrador: encola el trabajo en outbox dentro de la misma transaccion. */
@RestController
@RequestMapping("/api/v1/operational")
@PreAuthorize("hasAuthority('invoices:manage')")
public class InvoiceIssuanceController {
    private final InvoiceIssuanceService issuance;
    private final InvoiceBatchIssuanceService batchIssuance;

    public InvoiceIssuanceController(InvoiceIssuanceService issuance, InvoiceBatchIssuanceService batchIssuance) {
        this.issuance = issuance;
        this.batchIssuance = batchIssuance;
    }

    @PostMapping("/invoices/{invoiceId}/issue")
    public InvoiceService.InvoiceDetails issue(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID invoiceId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId) {
        return issuance.issue(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, invoiceId, idempotencyKey);
    }

    @PostMapping("/accounts/{accountId}/invoices/issue-drafts")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public InvoiceBatchIssuanceService.BatchReceipt issueDrafts(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId) {
        return batchIssuance.issueDrafts(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, accountId, idempotencyKey);
    }
}

@Service
class InvoiceBatchIssuanceService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;
    private final InvoiceService invoices;

    InvoiceBatchIssuanceService(JdbcTemplate jdbc, IdempotencyStore idempotency, InvoiceService invoices) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
        this.invoices = invoices;
    }

    @Transactional
    public BatchReceipt issueDrafts(UUID actor, UUID requestId, UUID accountId, UUID idempotencyKey) {
        String hash = fingerprint(accountId.toString());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "INVOICE_DRAFTS_BATCH_ISSUANCE_REQUESTED",
                idempotencyKey, hash);
        if (claim.replay()) return receipt(accountId, 0, true);

        List<UUID> accounts = jdbc.query("SELECT id FROM wok.order_accounts WHERE id = ? FOR UPDATE",
                (rs, row) -> rs.getObject("id", UUID.class), accountId);
        if (accounts.isEmpty()) throw new AuthException(404, "No encontramos la atención.");

        List<InvoiceRow> drafts = jdbc.query("""
                SELECT id FROM wok.invoices
                WHERE account_id = ? AND status = 'DRAFT'
                ORDER BY created_at, id
                FOR UPDATE
                """, (rs, row) -> new InvoiceRow(rs.getObject("id", UUID.class)), accountId);
        for (InvoiceRow draft : drafts) {
            jdbc.update("""
                UPDATE wok.invoices SET status = 'QUEUED', updated_at = now(), updated_by = ?,
                    row_version = row_version + 1
                WHERE id = ? AND status = 'DRAFT'
                """, actor, draft.id());
            jdbc.update("""
                INSERT INTO wok.outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type, payload, request_id)
                VALUES ('INVOICE', ?, 1, 'INVOICE_ISSUANCE_REQUESTED', jsonb_build_object('invoiceId', ?), ?)
                """, draft.id(), draft.id(), requestId);
            jdbc.update("""
                INSERT INTO wok.audit_logs
                    (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
                VALUES (?, 'INVOICE_QUEUED', 'INVOICE', ?, jsonb_build_object('status', 'QUEUED', 'batch', true), 'SUCCESS', ?)
                """, actor, draft.id(), requestId);
        }
        idempotency.complete(actor.toString(), "INVOICE_DRAFTS_BATCH_ISSUANCE_REQUESTED", idempotencyKey, accountId);
        return receipt(accountId, drafts.size(), false);
    }

    private BatchReceipt receipt(UUID accountId, int queuedCount, boolean replay) {
        List<UUID> invoiceIds = jdbc.query("""
            SELECT id FROM wok.invoices WHERE account_id = ? ORDER BY created_at, id
            """, (rs, row) -> rs.getObject("id", UUID.class), accountId);
        List<InvoiceService.InvoiceDetails> details = new ArrayList<>();
        for (UUID invoiceId : invoiceIds) details.add(invoices.details(invoiceId));
        return new BatchReceipt(accountId, queuedCount, replay, details);
    }

    private String fingerprint(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private record InvoiceRow(UUID id) {}
    public record BatchReceipt(UUID accountId, int queuedCount, boolean replay, List<InvoiceService.InvoiceDetails> invoices) {}
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

        List<UUID> invoiceAccounts = jdbc.query("SELECT account_id FROM wok.invoices WHERE id = ?",
                (rs, row) -> rs.getObject("account_id", UUID.class), invoiceId);
        if (invoiceAccounts.isEmpty()) throw new AuthException(404, "No encontramos la factura.");
        UUID accountId = invoiceAccounts.getFirst();
        List<UUID> accounts = jdbc.query("SELECT id FROM wok.order_accounts WHERE id = ? FOR UPDATE",
                (rs, row) -> rs.getObject("id", UUID.class), accountId);
        if (accounts.isEmpty()) throw new AuthException(404, "No encontramos la factura.");

        List<InvoiceRow> rows = jdbc.query("SELECT status FROM wok.invoices WHERE id = ? FOR UPDATE",
                (rs, row) -> new InvoiceRow(rs.getString("status")), invoiceId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la factura.");
        InvoiceRow invoice = rows.getFirst();
        if (!"DRAFT".equals(invoice.status())) throw new AuthException(409, "La factura no esta en borrador.");

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

    private record InvoiceRow(String status) {}
}
