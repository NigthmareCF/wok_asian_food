package com.wokasianfood.api.payments;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Reconciles old local files left behind by process crashes after checking database ownership. */
@Component
public class PaymentEvidenceOrphanCleanupWorker {
    private static final Duration ORPHAN_AGE = Duration.ofHours(24);
    private static final int BATCH_SIZE = 100;

    private final JdbcTemplate jdbc;
    private final PaymentEvidenceStorage storage;
    private String lastProcessedId;

    public PaymentEvidenceOrphanCleanupWorker(JdbcTemplate jdbc, PaymentEvidenceStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    @Scheduled(fixedDelayString = "${wok.payments.evidence-cleanup-ms:3600000}",
            initialDelayString = "${wok.payments.evidence-cleanup-ms:3600000}")
    public void removeUnreferencedFiles() {
        Instant cutoff = Instant.now().minus(ORPHAN_AGE);
        var candidates = storage.filesOlderThan(cutoff, lastProcessedId, BATCH_SIZE);
        if (candidates.isEmpty() && lastProcessedId != null) {
            lastProcessedId = null;
            candidates = storage.filesOlderThan(cutoff, null, BATCH_SIZE);
        }
        for (UUID id : candidates) {
            Boolean referenced = jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM wok.payment_evidence WHERE id = ?)", Boolean.class, id);
            if (Boolean.FALSE.equals(referenced)) storage.delete(id);
            lastProcessedId = id.toString();
        }
    }
}
