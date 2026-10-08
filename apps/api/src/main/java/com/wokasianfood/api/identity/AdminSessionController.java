package com.wokasianfood.api.identity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/users/{userId}/sessions")
@PreAuthorize("hasRole('ADMIN')")
public class AdminSessionController {
    private final AdminSessionService sessions;

    public AdminSessionController(AdminSessionService sessions) {
        this.sessions = sessions;
    }

    @GetMapping
    public List<AdminSession> list(@PathVariable UUID userId,
                                   @RequestParam(defaultValue = "50") int limit,
                                   @RequestParam(defaultValue = "0") int offset) {
        return sessions.list(userId, limit, offset);
    }

    @PostMapping("/{sessionId}/revoke")
    public AdminSession revoke(@PathVariable UUID userId, @PathVariable UUID sessionId,
                               @AuthenticationPrincipal Jwt jwt,
                               @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
                               @Valid @RequestBody RevokeRequest request) {
        return sessions.revoke(UUID.fromString(jwt.getSubject()), userId, sessionId,
                request.reason().trim(), requestId == null ? UUID.randomUUID() : requestId);
    }

    public record RevokeRequest(@NotBlank @Size(min = 3, max = 500) String reason) {}
    public record AdminSession(UUID sessionId, String clientType, String deviceName,
                               Instant createdAt, Instant lastActivityAt, Instant expiresAt,
                               Instant revokedAt, String revocationReason, boolean active) {}
}

@Service
class AdminSessionService {
    private final JdbcTemplate jdbc;

    AdminSessionService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<AdminSessionController.AdminSession> list(UUID userId, int limit, int offset) {
        if (limit < 1 || limit > 100 || offset < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Paginación inválida.");
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM wok.users WHERE id = ?)",
                Boolean.class, userId)))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No se encontró la cuenta.");
        return jdbc.query("""
            SELECT s.id, s.client_type, s.device_name, s.created_at, s.last_activity_at, s.expires_at,
                   s.revoked_at, s.revocation_reason,
                   (s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'ACTIVE'
                       AND s.created_at >= u.sessions_valid_after) AS active
            FROM wok.auth_sessions s JOIN wok.users u ON u.id = s.user_id
            WHERE s.user_id = ?
            ORDER BY s.created_at DESC, s.id
            LIMIT ? OFFSET ?
            """, (rs, row) -> new AdminSessionController.AdminSession(
                rs.getObject("id", UUID.class), rs.getString("client_type"), rs.getString("device_name"),
                instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("last_activity_at")),
                instant(rs.getTimestamp("expires_at")), instant(rs.getTimestamp("revoked_at")),
                rs.getString("revocation_reason"), rs.getBoolean("active")), userId, limit, offset);
    }

    @Transactional
    public AdminSessionController.AdminSession revoke(UUID actor, UUID userId, UUID sessionId,
                                                       String reason, UUID requestId) {
        List<SessionRow> rows = jdbc.query("""
            SELECT id, client_type, device_name, created_at, last_activity_at, expires_at,
                   revoked_at, revocation_reason
            FROM wok.auth_sessions WHERE id = ? AND user_id = ? FOR UPDATE
        """, (rs, row) -> new SessionRow(rs.getObject("id", UUID.class), rs.getString("client_type"),
                rs.getString("device_name"), instant(rs.getTimestamp("created_at")),
                instant(rs.getTimestamp("last_activity_at")), instant(rs.getTimestamp("expires_at")),
                instant(rs.getTimestamp("revoked_at")), rs.getString("revocation_reason")), sessionId, userId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No se encontró la sesión para esta cuenta.");
        SessionRow current = rows.getFirst();
        if (current.revokedAt != null) return current.toDto();

        jdbc.update("""
            UPDATE wok.auth_sessions SET revoked_at = now(), revoked_by = ?, revocation_reason = 'ADMIN_REVOKED'
            WHERE id = ? AND user_id = ? AND revoked_at IS NULL
            """, actor, sessionId, userId);
        jdbc.update("UPDATE wok.refresh_tokens SET revoked_at = now() WHERE session_id = ? AND revoked_at IS NULL", sessionId);
        jdbc.update("""
            INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id,
                before_data, after_data, reason, result, request_id)
            VALUES (?, 'USER_SESSION_REVOKE', 'AUTH_SESSION', ?,
                jsonb_build_object('revoked', false), jsonb_build_object('revoked', true, 'reason', 'ADMIN_REVOKED'),
                ?, 'SUCCESS', ?)
        """, actor, sessionId, reason, requestId);
        Timestamp revokedAt = jdbc.queryForObject("SELECT revoked_at FROM wok.auth_sessions WHERE id = ?",
                Timestamp.class, sessionId);
        return new SessionRow(current.id, current.clientType, current.deviceName, current.createdAt,
                current.lastActivityAt, current.expiresAt, instant(revokedAt), "ADMIN_REVOKED").toDto();
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record SessionRow(UUID id, String clientType, String deviceName, Instant createdAt,
                              Instant lastActivityAt, Instant expiresAt, Instant revokedAt,
                              String revocationReason) {
        AdminSessionController.AdminSession toDto() {
            return new AdminSessionController.AdminSession(id, clientType, deviceName, createdAt,
                    lastActivityAt, expiresAt, revokedAt, revocationReason, false);
        }
    }
}
