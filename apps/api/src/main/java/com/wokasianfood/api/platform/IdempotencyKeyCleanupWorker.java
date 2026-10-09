package com.wokasianfood.api.platform;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Removes expired idempotency results in small, lock-safe batches. */
@Service
public class IdempotencyKeyCleanupWorker {
    private final JdbcTemplate jdbc;

    public IdempotencyKeyCleanupWorker(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Scheduled(fixedDelayString = "${wok.idempotency.cleanup-ms:3600000}",
            initialDelayString = "${wok.idempotency.cleanup-ms:3600000}")
    @Transactional
    public int cleanupExpired() { return cleanupBatch(500); }

    @Transactional
    public int cleanupBatch(int limit) {
        int boundedLimit = Math.max(1, Math.min(limit, 5000));
        return jdbc.update("""
            WITH expired AS (
                SELECT id FROM wok.idempotency_keys
                WHERE expires_at <= now()
                  AND (status <> 'IN_PROGRESS' OR locked_until <= now())
                ORDER BY expires_at, id
                LIMIT ?
                FOR UPDATE SKIP LOCKED
            )
            DELETE FROM wok.idempotency_keys AS key
            USING expired
            WHERE key.id = expired.id
            """, boundedLimit);
    }
}
