package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

class RejectedRefreshIntegrationTest extends PostgresIntegrationTest {
    private static final String PASSWORD = "IntegrationPassword!2026";
    private final ObjectMapper json = new ObjectMapper();
    @Autowired private PasswordEncoder passwords;
    private UUID userId;
    private UUID sessionId;
    private UUID refreshId;
    private String refreshToken;

    @BeforeEach
    void createUnusedRefreshThroughLogin() throws Exception {
        String email = "rejected-refresh-" + UUID.randomUUID() + "@example.test";
        userId = createUserWithRole(email, "CLIENT");
        jdbc.update("INSERT INTO wok.user_credentials (user_id, password_hash) VALUES (?, ?)",
                userId, passwords.encode(PASSWORD));
        var response = post("/api/v1/auth/login", null, """
                {"email":"%s","password":"%s","clientType":"WEB"}
                """.formatted(email, PASSWORD));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        refreshToken = json.readTree(response.body()).path("refreshToken").asText();
        assertThat(refreshToken).isNotBlank();
        var row = jdbc.queryForMap("SELECT id, session_id FROM wok.refresh_tokens WHERE token_hash = ?",
                tokens.hash(refreshToken));
        refreshId = (UUID) row.get("id");
        sessionId = (UUID) row.get("session_id");
        // Make an accidental activity update observable without sleeps.
        jdbc.update("UPDATE wok.auth_sessions SET last_activity_at = now() - interval '1 hour' WHERE id = ?",
                sessionId);
        assertThat(jdbc.queryForObject("""
                SELECT rt.used_at IS NULL AND rt.revoked_at IS NULL AND rt.expires_at > now()
                    AND rt.parent_token_id IS NULL AND s.revoked_at IS NULL AND s.expires_at > now()
                    AND u.status = 'ACTIVE' AND s.created_at >= u.sessions_valid_after
                FROM wok.refresh_tokens rt JOIN wok.auth_sessions s ON s.id = rt.session_id
                JOIN wok.users u ON u.id = s.user_id WHERE rt.id = ?
                """, Boolean.class, refreshId)).isTrue();
    }

    @Test
    void expiredRefreshIsRejectedWithoutRotationOrReuse() throws Exception {
        assertThat(jdbc.update("""
                UPDATE wok.refresh_tokens
                SET created_at = now() - interval '2 minutes', expires_at = now() - interval '1 minute'
                WHERE id = ?
                """,
                refreshId)).isEqualTo(1);
        assertRejectedWithoutSideEffects();
    }

    @Test
    void revokedRefreshIsRejectedWithoutRotationOrReuse() throws Exception {
        assertThat(jdbc.update("UPDATE wok.refresh_tokens SET revoked_at = now() WHERE id = ?",
                refreshId)).isEqualTo(1);
        assertRejectedWithoutSideEffects();
    }

    @Test
    void revokedSessionIsRejectedWithoutRotationOrReuse() throws Exception {
        // Leave the token valid to exercise session revocation independently.
        assertThat(jdbc.update("""
                UPDATE wok.auth_sessions SET revoked_at = now(), revocation_reason = 'LOGOUT' WHERE id = ?
                """, sessionId)).isEqualTo(1);
        assertRejectedWithoutSideEffects();
    }

    @Test
    void suspendedUserIsRejectedWithoutRotationOrReuse() throws Exception {
        assertThat(jdbc.update("UPDATE wok.users SET status = 'SUSPENDED' WHERE id = ?", userId)).isEqualTo(1);
        assertRejectedWithoutSideEffects();
    }

    private void assertRejectedWithoutSideEffects() throws Exception {
        var sessionBefore = jdbc.queryForMap("SELECT * FROM wok.auth_sessions WHERE id = ?", sessionId);
        var tokensBefore = jdbc.queryForList("SELECT * FROM wok.refresh_tokens WHERE session_id = ? ORDER BY id",
                sessionId);
        assertThat(tokensBefore).hasSize(1);
        assertThat(tokensBefore.getFirst()).containsEntry("used_at", null).containsEntry("parent_token_id", null);
        assertNoReuseRecorded();

        var response = post("/api/v1/auth/refresh", null,
                json.createObjectNode().put("refreshToken", refreshToken).toString());

        assertThat(response.statusCode()).as(response.body()).isEqualTo(401);
        assertThat(json.readTree(response.body())).isEqualTo(
                json.createObjectNode().put("message", "Sesión inválida."));
        // Independent reads after HTTP completion observe committed PostgreSQL state.
        assertThat(jdbc.queryForList("SELECT * FROM wok.refresh_tokens WHERE session_id = ? ORDER BY id", sessionId))
                .as("No child token, consumption or token mutation").isEqualTo(tokensBefore);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.refresh_tokens WHERE parent_token_id = ?",
                Integer.class, refreshId)).isZero();
        assertThat(jdbc.queryForMap("SELECT * FROM wok.auth_sessions WHERE id = ?", sessionId))
                .as("Session expiry, activity and revocation remain unchanged").isEqualTo(sessionBefore);
        assertNoReuseRecorded();
    }

    private void assertNoReuseRecorded() {
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.auth_sessions WHERE user_id = ? AND revocation_reason = 'REFRESH_REUSE'
                """, Integer.class, userId)).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.security_events
                WHERE (actor_user_id = ? OR session_id = ?) AND event_type IN ('REFRESH_TOKEN_REUSE', 'REFRESH_REUSE')
                """, Integer.class, userId, sessionId)).isZero();
    }
}
