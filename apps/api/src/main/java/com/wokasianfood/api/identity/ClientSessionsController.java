package com.wokasianfood.api.identity;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/client/sessions")
@PreAuthorize("hasRole('CLIENT')")
public class ClientSessionsController {
    private final ClientSessionsService sessions;

    public ClientSessionsController(ClientSessionsService sessions) { this.sessions = sessions; }

    @GetMapping
    public List<ClientSession> list(@AuthenticationPrincipal Jwt jwt) {
        return sessions.list(UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getClaimAsString("sid")));
    }

    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Void> revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID sessionId) {
        sessions.revoke(UUID.fromString(jwt.getSubject()), sessionId);
        return ResponseEntity.noContent().build();
    }

    public record ClientSession(UUID sessionId, String clientType, String deviceName,
                                Instant createdAt, Instant lastActivityAt, boolean current) {}
}

@Service
class ClientSessionsService {
    private final JdbcTemplate jdbc;

    ClientSessionsService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<ClientSessionsController.ClientSession> list(UUID userId, UUID currentSessionId) {
        return jdbc.query("""
            SELECT s.id, s.client_type, s.device_name, s.created_at, s.last_activity_at
            FROM wok.auth_sessions s
            JOIN wok.users u ON u.id = s.user_id
            WHERE s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > now()
              AND s.created_at >= u.sessions_valid_after AND u.status = 'ACTIVE'
            ORDER BY (s.id = ?) DESC, s.last_activity_at DESC
            LIMIT 20
            """, (rs, row) -> new ClientSessionsController.ClientSession(
                rs.getObject("id", UUID.class), rs.getString("client_type"), rs.getString("device_name"),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("last_activity_at").toInstant(),
                currentSessionId.equals(rs.getObject("id", UUID.class))), userId, currentSessionId);
    }

    @Transactional
    public void revoke(UUID userId, UUID sessionId) {
        int changed = jdbc.update("""
            UPDATE wok.auth_sessions
            SET revoked_at = now(), revoked_by = ?, revocation_reason = 'CLIENT_REVOKED'
            WHERE id = ? AND user_id = ? AND revoked_at IS NULL
            """, userId, sessionId, userId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No se encontró la sesión.");
        jdbc.update("UPDATE wok.refresh_tokens SET revoked_at = now() WHERE session_id = ? AND revoked_at IS NULL", sessionId);
        jdbc.update("""
            INSERT INTO wok.security_events (actor_user_id, session_id, event_type, severity, details)
            VALUES (?, ?, 'CLIENT_SESSION_REVOKED', 'INFO', jsonb_build_object('revokedSessionId', ?::text))
            """, userId, sessionId, sessionId);
    }
}
