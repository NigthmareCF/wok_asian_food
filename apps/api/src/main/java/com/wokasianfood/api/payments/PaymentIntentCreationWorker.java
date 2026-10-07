package com.wokasianfood.api.payments;

import com.wokasianfood.api.integration.PaymentGateway;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Creates provider intents from the outbox without holding a SQL transaction during provider I/O. */
@Component
public class PaymentIntentCreationWorker {
    private static final int MAX_ATTEMPTS = 5;
    private final JdbcTemplate jdbc;
    private final ObjectProvider<PaymentGateway> gateways;
    private final TransactionTemplate transactions;

    public PaymentIntentCreationWorker(JdbcTemplate jdbc, ObjectProvider<PaymentGateway> gateways,
                                       PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.gateways = gateways;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    @Scheduled(fixedDelayString = "${wok.payments.poll-ms:3000}", initialDelayString = "${wok.payments.poll-ms:3000}")
    public void createNext() {
        PaymentGateway gateway = gateways.getIfAvailable();
        if (gateway == null) return;
        for (int processed = 0; processed < 25; processed++) {
            if (!processOne(gateway)) return;
        }
    }

    private boolean processOne(PaymentGateway gateway) {
        QueuedIntent claim = transactions.execute(status -> claimNext());
        if (claim == null) return false;
        Intent intent = transactions.execute(status -> load(claim.intentId()));
        if (intent == null || !"CREATED".equals(intent.status())) {
            transactions.executeWithoutResult(status -> publish(claim.eventId()));
            return true;
        }

        try {
            PaymentGateway.PaymentIntent created = gateway.createIntent(intent.orderId(), intent.amount(),
                    intent.currency(), "wok-payment-intent:" + intent.id());
            if (created.state() == PaymentGateway.State.CAPTURED)
                throw new IllegalStateException("Payment intent providers must not capture funds during intent creation");
            transactions.executeWithoutResult(status -> persist(claim, intent, created));
        } catch (RuntimeException error) {
            transactions.executeWithoutResult(status -> retryOrMarkUnknown(claim, error));
        }
        return true;
    }

    private QueuedIntent claimNext() {
        List<QueuedIntent> rows = jdbc.query("""
            UPDATE wok.outbox_events
            SET attempt_count = attempt_count + 1,
                next_attempt_at = now() + interval '5 minutes',
                claimed_until = now() + interval '5 minutes',
                claimed_by = 'payment-intent-worker'
            WHERE id = (
              SELECT id FROM wok.outbox_events
              WHERE event_type = 'PAYMENT_INTENT_CREATION_REQUESTED' AND published_at IS NULL AND next_attempt_at <= now()
              ORDER BY occurred_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
            )
            RETURNING id, aggregate_id, attempt_count
            """, (rs, row) -> new QueuedIntent(rs.getObject("id", UUID.class),
                rs.getObject("aggregate_id", UUID.class), rs.getInt("attempt_count")));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private Intent load(UUID id) {
        List<Intent> rows = jdbc.query("""
            SELECT i.id, i.order_id, i.amount, c.code AS currency, i.status
            FROM wok.payment_intents i
            JOIN wok.currencies c ON c.id = i.currency_id
            WHERE i.id = ?
            """, (rs, row) -> new Intent(rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getBigDecimal("amount"), rs.getString("currency"), rs.getString("status")), id);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private void persist(QueuedIntent claim, Intent intent, PaymentGateway.PaymentIntent created) {
        int changed = jdbc.update("""
            UPDATE wok.payment_intents SET provider_reference = ?, status = ?, updated_at = now()
            WHERE id = ? AND status = 'CREATED'
            """, created.providerReference(), created.state().name(), intent.id());
        if (changed == 0) {
            List<String> statuses = jdbc.query("SELECT status FROM wok.payment_intents WHERE id = ?",
                    (rs, row) -> rs.getString(1), intent.id());
            if (statuses.contains("CREATED"))
                throw new IllegalStateException("Payment intent could not persist its provider response");
        }
        publish(claim.eventId());
    }

    private void retryOrMarkUnknown(QueuedIntent claim, RuntimeException error) {
        boolean exhausted = claim.attemptCount() >= MAX_ATTEMPTS;
        jdbc.update("""
            UPDATE wok.outbox_events
            SET last_error = ?, next_attempt_at = now() + interval '1 minute' * attempt_count,
                claimed_until = NULL, claimed_by = NULL,
                published_at = CASE WHEN ? THEN now() ELSE NULL END
            WHERE id = ?
            """, error.getClass().getSimpleName(), exhausted, claim.eventId());
        if (exhausted) {
            jdbc.update("""
                UPDATE wok.payment_intents SET status = 'UNKNOWN', updated_at = now()
                WHERE id = ? AND status = 'CREATED'
                """, claim.intentId());
        }
    }

    private void publish(UUID eventId) {
        jdbc.update("""
            UPDATE wok.outbox_events SET published_at = now(), last_error = NULL,
                claimed_until = NULL, claimed_by = NULL WHERE id = ?
            """, eventId);
    }

    private record QueuedIntent(UUID eventId, UUID intentId, int attemptCount) {}
    private record Intent(UUID id, UUID orderId, BigDecimal amount, String currency, String status) {}
}
