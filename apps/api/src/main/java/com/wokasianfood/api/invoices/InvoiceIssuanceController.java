package com.wokasianfood.api.invoices;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
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
import org.springframework.web.bind.annotation.RequestBody;
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
    private final InvoiceReconciliationService reconciliation;

    public InvoiceIssuanceController(InvoiceIssuanceService issuance, InvoiceBatchIssuanceService batchIssuance,
                                    InvoiceReconciliationService reconciliation) {
        this.issuance = issuance;
        this.batchIssuance = batchIssuance;
        this.reconciliation = reconciliation;
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

    @PostMapping("/invoices/{invoiceId}/reconcile")
    public InvoiceService.InvoiceDetails reconcile(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID invoiceId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody ReconcileRequest request) {
        return reconciliation.reconcile(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, invoiceId, idempotencyKey, request);
    }

    public record ReconcileRequest(@NotNull ReconciliationDecision decision,
                                   @NotBlank @Size(min = 3, max = 500) String reason,
                                   @NotBlank @Size(min = 1, max = 200) String providerCheckReference,
                                   @Size(max = 120) String authorizationNumber,
                                   UUID dteUuid,
                                   @Size(max = 160) String providerReference) {}

    public enum ReconciliationDecision { CONFIRMED_CERTIFIED, CONFIRMED_NOT_CERTIFIED }
}

@Service
class InvoiceReconciliationService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;
    private final InvoiceService invoices;

    InvoiceReconciliationService(JdbcTemplate jdbc, IdempotencyStore idempotency, InvoiceService invoices) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
        this.invoices = invoices;
    }

    @Transactional
    InvoiceService.InvoiceDetails reconcile(UUID actor, UUID requestId, UUID invoiceId, UUID idempotencyKey,
                                            InvoiceIssuanceController.ReconcileRequest request) {
        String reason = request.reason().trim();
        String checkReference = request.providerCheckReference().trim();
        String authorizationNumber = clean(request.authorizationNumber());
        String providerReference = clean(request.providerReference());
        if (request.decision() == InvoiceIssuanceController.ReconciliationDecision.CONFIRMED_CERTIFIED
                && (authorizationNumber == null || request.dteUuid() == null))
            throw new AuthException(422, "Confirma el número de autorización y el UUID del DTE certificado.");
        if (request.decision() == InvoiceIssuanceController.ReconciliationDecision.CONFIRMED_NOT_CERTIFIED
                && (authorizationNumber != null || request.dteUuid() != null || providerReference != null))
            throw new AuthException(422, "Una factura no certificada no puede incluir datos de DTE.");

        String hash = fingerprint(invoiceId.toString(), request.decision().name(), reason, checkReference,
                authorizationNumber == null ? "" : authorizationNumber,
                request.dteUuid() == null ? "" : request.dteUuid().toString(),
                providerReference == null ? "" : providerReference);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "INVOICE_RECONCILED", idempotencyKey, hash);
        if (claim.replay()) return invoices.details(claim.resourceId());

        List<UUID> accountIds = jdbc.query("SELECT account_id FROM wok.invoices WHERE id = ?",
                (rs, row) -> rs.getObject("account_id", UUID.class), invoiceId);
        if (accountIds.isEmpty()) throw new AuthException(404, "No encontramos la factura.");
        UUID accountId = accountIds.getFirst();
        List<UUID> accounts = jdbc.query("SELECT id FROM wok.order_accounts WHERE id = ? FOR UPDATE",
                (rs, row) -> rs.getObject("id", UUID.class), accountId);
        if (accounts.isEmpty()) throw new AuthException(404, "No encontramos la atención.");
        List<InvoiceState> locked = jdbc.query("""
            SELECT status, total FROM wok.invoices
            WHERE id = ? AND account_id = ? FOR UPDATE
            """, (rs, row) -> new InvoiceState(rs.getString("status"), rs.getBigDecimal("total")),
                invoiceId, accountId);
        if (locked.isEmpty()) throw new AuthException(404, "No encontramos la factura.");
        InvoiceState invoice = locked.getFirst();
        if (!"UNKNOWN".equals(invoice.status()))
            throw new AuthException(409, "Sólo se concilian facturas con resultado fiscal incierto.");

        if (request.decision() == InvoiceIssuanceController.ReconciliationDecision.CONFIRMED_CERTIFIED) {
            jdbc.update("""
                UPDATE wok.invoices SET status = 'ISSUED', authorization_number = ?, dte_uuid = ?,
                    provider_ref = ?, issued_at = now(), issued_by = ?, error = NULL,
                    updated_at = now(), updated_by = ?, row_version = row_version + 1
                WHERE id = ? AND status = 'UNKNOWN'
                """, authorizationNumber, request.dteUuid(), providerReference, actor, actor, invoiceId);
            audit(actor, requestId, invoiceId, "INVOICE_RECONCILIATION_CERTIFIED", invoice,
                    request.decision(), reason, checkReference, authorizationNumber, request.dteUuid());
        } else {
            jdbc.update("""
                UPDATE wok.invoices SET status = 'QUEUED', error = NULL, request_id = ?,
                    updated_at = now(), updated_by = ?, row_version = row_version + 1
                WHERE id = ? AND status = 'UNKNOWN'
                """, requestId, actor, invoiceId);
            jdbc.update("""
                INSERT INTO wok.outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type,
                                               payload, request_id)
                VALUES ('INVOICE', ?, 1, 'INVOICE_ISSUANCE_REQUESTED', jsonb_build_object('invoiceId', ?), ?)
                """, invoiceId, invoiceId, requestId);
            audit(actor, requestId, invoiceId, "INVOICE_RECONCILIATION_REQUEUED", invoice,
                    request.decision(), reason, checkReference, null, null);
        }
        idempotency.complete(actor.toString(), "INVOICE_RECONCILED", idempotencyKey, invoiceId);
        return invoices.details(invoiceId);
    }

    private void audit(UUID actor, UUID requestId, UUID invoiceId, String action, InvoiceState before,
                       InvoiceIssuanceController.ReconciliationDecision decision, String reason,
                       String checkReference, String authorizationNumber, UUID dteUuid) {
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, ?, 'INVOICE', ?, jsonb_build_object('status', 'UNKNOWN', 'total', ?),
                    jsonb_build_object('decision', ?, 'authorizationNumber', CAST(? AS text),
                        'dteUuid', CAST(? AS text), 'providerCheckReference', ?), ?, 'SUCCESS', ?)
            """, actor, action, invoiceId, before.total(), decision.name(), authorizationNumber,
                dteUuid == null ? null : dteUuid.toString(), checkReference, reason, requestId);
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String fingerprint(String... values) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(String.join("\n", values).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private record InvoiceState(String status, BigDecimal total) {}
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
