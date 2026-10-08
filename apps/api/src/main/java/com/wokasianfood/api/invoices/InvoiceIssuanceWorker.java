package com.wokasianfood.api.invoices;

import com.wokasianfood.api.fiscal.FiscalProvider;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Claims issuance work transactionally, calls the fiscal provider without a DB transaction, then persists the result. */
@Component
public class InvoiceIssuanceWorker {
    private static final int MAX_ATTEMPTS = 5;
    private static final int MAX_BATCH = 25;

    private final JdbcTemplate jdbc;
    private final ObjectProvider<FiscalProvider> providers;
    private final TransactionTemplate transactions;

    public InvoiceIssuanceWorker(JdbcTemplate jdbc, ObjectProvider<FiscalProvider> providers,
                                 PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.providers = providers;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    @Scheduled(fixedDelayString = "${wok.fiscal.poll-ms:5000}", initialDelayString = "${wok.fiscal.poll-ms:5000}")
    public void issueNext() {
        FiscalProvider provider = providers.getIfAvailable();
        if (provider == null) return;
        for (int processed = 0; processed < MAX_BATCH; processed++) {
            if (!processOne(provider)) return;
        }
    }

    private boolean processOne(FiscalProvider provider) {
        QueuedEvent event = transactions.execute(status -> claimNext());
        if (event == null) return false;

        Invoice invoice = transactions.execute(status -> loadInvoice(event.invoiceId()));
        if (invoice == null || "ISSUED".equals(invoice.status())) {
            transactions.executeWithoutResult(status -> publish(event.eventId()));
            return true;
        }

        try {
            // Deliberately outside a database transaction: provider latency must not hold SQL locks/connections.
            FiscalProvider.Certification certification = provider.certify(new FiscalProvider.CertificationRequest(
                    invoice.id(), invoice.accountName(), invoice.total(), invoice.taxTotal(),
                    invoice.customerName(), invoice.customerTaxId(), invoice.lines()));
            transactions.executeWithoutResult(status -> complete(event, invoice, certification));
        } catch (FiscalProvider.RetryableException error) {
            transactions.executeWithoutResult(status -> recordFailure(event, error));
        } catch (FiscalProvider.FiscalException error) {
            transactions.executeWithoutResult(status -> recordDefinitiveFailure(event, invoice, error));
        } catch (RuntimeException error) {
            // A timeout/connection loss can happen after the provider certified the DTE.
            // Stop automatic retries and require reconciliation to avoid duplicate fiscal documents.
            transactions.executeWithoutResult(status -> recordUnknown(event, invoice, error));
        }
        return true;
    }

    private QueuedEvent claimNext() {
        List<QueuedEvent> claimed = jdbc.query("""
            UPDATE wok.outbox_events
            SET attempt_count = attempt_count + 1,
                next_attempt_at = now() + interval '5 minutes',
                claimed_until = now() + interval '5 minutes',
                claimed_by = 'invoice-issuance-worker'
            WHERE id = (
              SELECT id FROM wok.outbox_events
              WHERE event_type = 'INVOICE_ISSUANCE_REQUESTED' AND published_at IS NULL AND next_attempt_at <= now()
              ORDER BY occurred_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
            )
            RETURNING id, aggregate_id, attempt_count
            """, (rs, row) -> new QueuedEvent(rs.getObject("id", UUID.class),
                rs.getObject("aggregate_id", UUID.class), rs.getInt("attempt_count")));
        return claimed.isEmpty() ? null : claimed.getFirst();
    }

    private void complete(QueuedEvent event, Invoice invoice, FiscalProvider.Certification certification) {
        int issued = jdbc.update("""
            UPDATE wok.invoices
            SET status = 'ISSUED', authorization_number = ?, dte_uuid = ?, provider_ref = ?,
                issued_at = now(), error = NULL, updated_at = now(), issued_by = created_by,
                row_version = row_version + 1
            WHERE id = ? AND status = 'QUEUED'
            """, certification.authorizationNumber(), certification.dteUuid(),
                certification.providerRef(), invoice.id());
        if (issued == 0) {
            List<String> statuses = jdbc.query("SELECT status FROM wok.invoices WHERE id = ?",
                    (rs, row) -> rs.getString(1), invoice.id());
            if (!statuses.contains("ISSUED"))
                throw new IllegalStateException("Invoice left QUEUED without a persisted certification result");
            publish(event.eventId());
            return;
        }
        publish(event.eventId());
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'INVOICE_ISSUED', 'INVOICE', ?,
                    jsonb_build_object('authorizationNumber', ?, 'total', ?), 'SUCCESS', ?)
            """, invoice.createdBy(), invoice.id(), certification.authorizationNumber(), invoice.total(),
                invoice.requestId());
    }

    private void recordFailure(QueuedEvent event, RuntimeException error) {
        boolean dead = event.attemptCount() >= MAX_ATTEMPTS;
        jdbc.update("""
            UPDATE wok.outbox_events
            SET last_error = ?, next_attempt_at = now() + interval '1 minute' * attempt_count,
                claimed_until = NULL, claimed_by = NULL,
                published_at = CASE WHEN ? THEN now() ELSE NULL END
            WHERE id = ?
            """, error.getClass().getSimpleName(), dead, event.eventId());
        if (dead) {
            jdbc.update("""
                UPDATE wok.invoices
                SET status = 'FAILED', error = ?, updated_at = now(), row_version = row_version + 1
                WHERE id = ? AND status = 'QUEUED'
                """, "No se pudo emitir: " + error.getClass().getSimpleName(), event.invoiceId());
        }
    }

    private void recordDefinitiveFailure(QueuedEvent event, Invoice invoice, FiscalProvider.FiscalException error) {
        jdbc.update("""
            UPDATE wok.invoices
            SET status = 'FAILED', error = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND status = 'QUEUED'
            """, "Certificación rechazada: " + error.getClass().getSimpleName(), event.invoiceId());
        jdbc.update("""
            UPDATE wok.outbox_events SET last_error = ?, published_at = now(),
                claimed_until = NULL, claimed_by = NULL
            WHERE id = ?
            """, error.getClass().getSimpleName(), event.eventId());
        jdbc.update("""
            INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'INVOICE_CERTIFICATION_REJECTED', 'INVOICE', ?,
                    jsonb_build_object('status', 'FAILED', 'errorType', ?), 'SUCCESS', ?)
            """, invoice.createdBy(), event.invoiceId(), error.getClass().getSimpleName(), invoice.requestId());
    }

    private void recordUnknown(QueuedEvent event, Invoice invoice, RuntimeException error) {
        jdbc.update("""
            UPDATE wok.invoices
            SET status = 'UNKNOWN', error = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND status = 'QUEUED'
            """, "Resultado fiscal incierto: " + error.getClass().getSimpleName(), event.invoiceId());
        jdbc.update("""
            UPDATE wok.outbox_events SET last_error = ?, published_at = now(),
                claimed_until = NULL, claimed_by = NULL
            WHERE id = ?
            """, error.getClass().getSimpleName(), event.eventId());
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'INVOICE_OUTCOME_UNKNOWN', 'INVOICE', ?,
                    jsonb_build_object('status', 'UNKNOWN', 'errorType', ?), 'SUCCESS', ?)
            """, invoice.createdBy(), event.invoiceId(), error.getClass().getSimpleName(), invoice.requestId());
    }

    private void publish(UUID eventId) {
        jdbc.update("""
            UPDATE wok.outbox_events SET published_at = now(), last_error = NULL,
                claimed_until = NULL, claimed_by = NULL
            WHERE id = ?
            """, eventId);
    }

    private Invoice loadInvoice(UUID invoiceId) {
        List<Invoice> rows = jdbc.query("""
            SELECT i.id, i.status, i.total, i.tax_total, i.customer_name, i.customer_tax_id,
                   i.created_by, i.request_id, a.name AS account_name
            FROM wok.invoices i JOIN wok.order_accounts a ON a.id = i.account_id WHERE i.id = ?
            """, (rs, row) -> new Invoice(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getBigDecimal("total"), rs.getBigDecimal("tax_total"), rs.getString("customer_name"),
                rs.getString("customer_tax_id"), rs.getObject("created_by", UUID.class),
                rs.getObject("request_id", UUID.class), rs.getString("account_name"), List.of()), invoiceId);
        if (rows.isEmpty()) return null;
        Invoice invoice = rows.getFirst();
        List<FiscalProvider.CertificationLine> lines = jdbc.query("""
            SELECT description, quantity, unit_price FROM wok.invoice_items
            WHERE invoice_id = ? ORDER BY created_at, id
            """, (rs, row) -> new FiscalProvider.CertificationLine(rs.getString("description"),
                rs.getInt("quantity"), rs.getBigDecimal("unit_price")), invoiceId);
        return new Invoice(invoice.id(), invoice.status(), invoice.total(), invoice.taxTotal(),
                invoice.customerName(), invoice.customerTaxId(), invoice.createdBy(), invoice.requestId(),
                invoice.accountName(), lines);
    }

    private record QueuedEvent(UUID eventId, UUID invoiceId, int attemptCount) {}

    private record Invoice(UUID id, String status, BigDecimal total, BigDecimal taxTotal, String customerName,
                           String customerTaxId, UUID createdBy, UUID requestId, String accountName,
                           List<FiscalProvider.CertificationLine> lines) {}
}
