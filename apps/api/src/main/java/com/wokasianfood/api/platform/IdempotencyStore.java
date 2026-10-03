package com.wokasianfood.api.platform;

import com.wokasianfood.api.identity.AuthException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

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

    public Result claim(String principal, String operation, UUID key, String requestHash) {
        int inserted = jdbc.update("""
            INSERT INTO wok.idempotency_keys
                (principal_scope, operation, key, request_hash, status, locked_until, expires_at)
            VALUES (?, ?, ?, ?, 'IN_PROGRESS', now() + interval '30 seconds', now() + interval '1 day')
            ON CONFLICT (principal_scope, operation, key) DO NOTHING
            """, principal, operation, key.toString(), requestHash);
        if (inserted == 1) return new Result(null, false);

        List<Row> existing = jdbc.query("""
            SELECT request_hash, status, resource_id FROM wok.idempotency_keys
            WHERE principal_scope = ? AND operation = ? AND key = ? FOR UPDATE
            """, (rs, row) -> new Row(rs.getString("request_hash"), rs.getString("status"),
                rs.getObject("resource_id", UUID.class)), principal, operation, key.toString());
        if (existing.isEmpty())
            throw new AuthException(409, "No se pudo resolver la operación idempotente.");
        Row row = existing.getFirst();
        if (!requestHash.equals(row.hash()))
            throw new AuthException(409, "La clave ya se usó con otros datos.");
        if (COMPLETED.equals(row.status())) return new Result(row.resourceId(), true);
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

    public record Result(UUID resourceId, boolean replay) {}

    private record Row(String hash, String status, UUID resourceId) {}
}
