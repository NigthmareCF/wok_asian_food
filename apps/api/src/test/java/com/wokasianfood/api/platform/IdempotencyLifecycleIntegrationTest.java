package com.wokasianfood.api.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class IdempotencyLifecycleIntegrationTest extends PostgresIntegrationTest {
    @Autowired private IdempotencyStore idempotency;
    @Autowired private IdempotencyKeyCleanupWorker cleanup;

    @Test
    void expiredKeyCanBeReusedForANewRequestWithoutReplayingOldResource() {
        String scope = UUID.randomUUID().toString();
        String operation = "TEST_IDEMPOTENCY_TTL";
        UUID key = UUID.randomUUID();
        UUID oldResource = UUID.randomUUID();
        UUID newResource = UUID.randomUUID();

        assertThat(idempotency.claim(scope, operation, key, "first-body").replay()).isFalse();
        idempotency.complete(scope, operation, key, oldResource);
        var replay = idempotency.claim(scope, operation, key, "first-body");
        assertThat(replay.replay()).isTrue();
        assertThat(replay.resourceId()).isEqualTo(oldResource);

        jdbc.update("UPDATE wok.idempotency_keys SET created_at = now() - interval '1 day', "
                + "expires_at = now() - interval '1 second' "
                + "WHERE principal_scope = ? AND operation = ? AND key = ?", scope, operation, key.toString());
        var reclaimed = idempotency.claim(scope, operation, key, "second-body");
        assertThat(reclaimed.replay()).isFalse();
        assertThat(reclaimed.resourceId()).isNull();

        idempotency.complete(scope, operation, key, newResource);
        var newReplay = idempotency.claim(scope, operation, key, "second-body");
        assertThat(newReplay.replay()).isTrue();
        assertThat(newReplay.resourceId()).isEqualTo(newResource);
    }

    @Test
    void cleanupDeletesOnlyExpiredAndUnlockedRowsInBoundedBatches() {
        String scope = UUID.randomUUID().toString();
        UUID expiredCompleted = insert(scope, "EXPIRED_COMPLETED", "COMPLETED", false);
        UUID expiredUnlocked = insert(scope, "EXPIRED_UNLOCKED", "IN_PROGRESS", false);
        UUID expiredLocked = insert(scope, "EXPIRED_LOCKED", "IN_PROGRESS", true);
        UUID activeCompleted = insert(scope, "ACTIVE_COMPLETED", "COMPLETED", true);

        assertThat(cleanup.cleanupBatch(1)).isEqualTo(1);
        assertThat(cleanup.cleanupBatch(10)).isEqualTo(1);
        assertThat(count(expiredCompleted, expiredUnlocked, expiredLocked, activeCompleted)).isEqualTo(2);
        assertThat(exists(expiredLocked)).isTrue();
        assertThat(exists(activeCompleted)).isTrue();
    }

    @Test
    void abandonedInProgressClaimCanBeReclaimedAfterItsLeaseExpires() {
        String scope = UUID.randomUUID().toString();
        String operation = "TEST_IDEMPOTENCY_LEASE";
        UUID key = UUID.randomUUID();

        assertThat(idempotency.claim(scope, operation, key, "same-body").replay()).isFalse();
        assertThatThrownBy(() -> idempotency.claim(scope, operation, key, "same-body"))
                .isInstanceOf(AuthException.class)
                .hasMessageContaining("todavía se está procesando");
        jdbc.update("UPDATE wok.idempotency_keys SET locked_until = now() - interval '1 second' "
                + "WHERE principal_scope = ? AND operation = ? AND key = ?", scope, operation, key.toString());

        var reclaimed = idempotency.claim(scope, operation, key, "same-body");

        assertThat(reclaimed.replay()).isFalse();
        assertThat(jdbc.queryForObject("SELECT locked_until > now() FROM wok.idempotency_keys "
                + "WHERE principal_scope = ? AND operation = ? AND key = ?", Boolean.class,
                scope, operation, key.toString())).isTrue();
    }

    private UUID insert(String scope, String operation, String status, boolean active) {
        return jdbc.queryForObject("""
            INSERT INTO wok.idempotency_keys
                (principal_scope, operation, key, request_hash, status, locked_until, expires_at, completed_at, created_at)
            VALUES (?, ?, ?, ?, ?, CASE WHEN ? THEN now() + interval '1 hour' ELSE now() - interval '1 hour' END,
                    CASE WHEN ? THEN now() + interval '1 day' ELSE now() - interval '1 second' END,
                    CASE WHEN ? THEN now() ELSE NULL END, now() - interval '2 days')
            RETURNING id
            """, UUID.class, scope, operation, UUID.randomUUID().toString(), "a".repeat(64), status,
                active, active, "COMPLETED".equals(status));
    }

    private long count(UUID... ids) {
        return jdbc.queryForObject("SELECT count(*) FROM wok.idempotency_keys WHERE id IN (?, ?, ?, ?)",
                Long.class, (Object[]) ids);
    }

    private boolean exists(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM wok.idempotency_keys WHERE id = ?)",
                Boolean.class, id));
    }
}
