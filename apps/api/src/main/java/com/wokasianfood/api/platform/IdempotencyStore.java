package com.wokasianfood.api.platform;

import com.wokasianfood.api.identity.AuthException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Idempotencia común sobre {@code wok.idempotency_keys}. El "claim" y el trabajo se ejecutan en la
 * misma transacción: si el caso de uso falla, el claim se revierte con el resto.
 */
@Service
public class IdempotencyStore {
    private static final String IN_PROGRESS = "IN_PROGRESS";
    private static final String COMPLETED = "COMPLETED";

    private final JdbcTemplate jdbc;

    public IdempotencyStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public Result claim(String principal, String operation, UUID key, String requestHash) {
        int inserted = jdbc.update("""
            INSERT INTO wok.idempotency_keys
                (principal_scope, operation, key, request_hash, status, locked_until, expires_at)
            VALUES (?, ?, ?, ?, 'IN_PROGRESS', now() + interval '30 seconds', now() + interval '1 day')
            ON CONFLICT (principal_scope, operation, key) DO NOTHING
            """, principal, operation, key.toString(), requestHash);
        if (inserted == 1) return new Result(null, false);

        List<Row> existing = jdbc.query("""
            SELECT request_hash, status, resource_id, response_code, response_snapshot::text AS response_snapshot,
                   expires_at > now() AS active, locked_until <= now() AS lease_expired
            FROM wok.idempotency_keys
            WHERE principal_scope = ? AND operation = ? AND key = ? FOR UPDATE
            """, (rs, row) -> new Row(rs.getString("request_hash"), rs.getString("status"),
                rs.getObject("resource_id", UUID.class), (Integer) rs.getObject("response_code"),
                rs.getString("response_snapshot"), rs.getBoolean("active"), rs.getBoolean("lease_expired")),
                principal, operation, key.toString());
        if (existing.isEmpty())
            throw new AuthException(409, "No se pudo resolver la operación idempotente.");
        Row row = existing.getFirst();
        if (!row.active()) {
            int reset = jdbc.update("""
                UPDATE wok.idempotency_keys
                SET request_hash = ?, status = 'IN_PROGRESS', resource_type = NULL, resource_id = NULL,
                    response_code = NULL, response_snapshot = NULL, locked_until = now() + interval '30 seconds',
                    expires_at = now() + interval '1 day', completed_at = NULL, request_id = NULL, created_at = now()
                WHERE principal_scope = ? AND operation = ? AND key = ?
                """, requestHash, principal, operation, key.toString());
            if (reset == 1) return new Result(null, false);
            throw new AuthException(409, "No se pudo reclamar la clave idempotente vencida.");
        }
        if (!requestHash.equals(row.hash()))
            throw new AuthException(409, "La clave ya se usó con otros datos.");
        if (COMPLETED.equals(row.status()))
            return new Result(row.resourceId(), true, row.responseCode(), row.responseSnapshot());
        if (IN_PROGRESS.equals(row.status()) && row.leaseExpired()) {
            int reclaimed = jdbc.update("""
                UPDATE wok.idempotency_keys SET locked_until = now() + interval '30 seconds'
                WHERE principal_scope = ? AND operation = ? AND key = ? AND status = 'IN_PROGRESS'
                  AND expires_at > now() AND locked_until <= now()
                """, principal, operation, key.toString());
            if (reclaimed == 1) return new Result(null, false);
        }
        if (IN_PROGRESS.equals(row.status()))
            throw new AuthException(409, "La operación todavía se está procesando.");
        throw new AuthException(409, "La operación no se pudo completar; inténtalo de nuevo.");
    }

    public void complete(String principal, String operation, UUID key, UUID resourceId) {
        jdbc.update("""
            UPDATE wok.idempotency_keys
            SET status = 'COMPLETED', resource_id = ?, completed_at = now()
            WHERE principal_scope = ? AND operation = ? AND key = ?
            """, resourceId, principal, operation, key.toString());
    }

    public void completeWithSnapshot(String principal, String operation, UUID key, UUID resourceId,
                                     int responseCode, String responseSnapshot) {
        if (responseSnapshot == null || responseSnapshot.isBlank())
            throw new IllegalArgumentException("A response snapshot is required for idempotent replay.");
        int updated = jdbc.update("""
            UPDATE wok.idempotency_keys
            SET status = 'COMPLETED', resource_id = ?, response_code = ?, response_snapshot = ?::jsonb,
                completed_at = now()
            WHERE principal_scope = ? AND operation = ? AND key = ? AND status = 'IN_PROGRESS'
            """, resourceId, responseCode, responseSnapshot, principal, operation, key.toString());
        if (updated != 1)
            throw new AuthException(409, "No se pudo guardar la respuesta de la operación idempotente.");
    }

    public record Result(UUID resourceId, boolean replay, Integer responseCode, String responseSnapshot) {
        public Result(UUID resourceId, boolean replay) { this(resourceId, replay, null, null); }
    }

    private record Row(String hash, String status, UUID resourceId, Integer responseCode,
                       String responseSnapshot, boolean active, boolean leaseExpired) {}
}
