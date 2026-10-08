package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

class CurrentUserLogoutIntegrationTest extends PostgresIntegrationTest {
    private static final String PASSWORD = "IntegrationPassword!2026";
    private final ObjectMapper json = new ObjectMapper();
    @Autowired private PasswordEncoder passwords;
    private UUID userId;
    private String email;
    private String extraRole;

    @BeforeEach
    void createAccount() {
        String suffix = UUID.randomUUID().toString();
        email = "session-it-" + suffix + "@example.test";
        userId = createUserWithRole(email, "CLIENT");
        jdbc.update("INSERT INTO wok.user_credentials (user_id, password_hash) VALUES (?, ?)",
                userId, passwords.encode(PASSWORD));
        extraRole = "SESSION_EXTRA_" + suffix;
        grantTestRole(extraRole, true, false, "service:read", "service:manage");
        grantTestRole("SESSION_INACTIVE_" + suffix, false, false, "users:manage");
        grantTestRole("SESSION_REVOKED_" + suffix, true, true, "audit:read");
    }

    @Test
    void meReturnsCompleteIdentityAndDistinctPermissionsFromOnlyActiveRoles() throws Exception {
        Session session = login("WEB");
        assertCurrentUser(session.accessToken());
    }

    @Test
    void logoutRevokesOnlyItsSessionAndLeavesAnotherSessionUsable() throws Exception {
        Session first = login("WEB");
        Session second = login("MOBILE");
        assertThat(first.sessionId()).isNotEqualTo(second.sessionId());
        assertThat(first.refreshToken()).isNotEqualTo(second.refreshToken());
        assertCurrentUser(first.accessToken());
        assertCurrentUser(second.accessToken());

        var logout = post("/api/v1/auth/logout", first.accessToken(), null);
        assertThat(logout.statusCode()).as(logout.body()).isEqualTo(204);
        assertThat(logout.body()).isEmpty();

        var revoked = jdbc.queryForMap("""
                SELECT revoked_at IS NOT NULL AS revoked, revocation_reason
                FROM wok.auth_sessions WHERE id = ? AND user_id = ?
                """, first.sessionId(), userId);
        assertThat(revoked).containsEntry("revoked", true).containsEntry("revocation_reason", "LOGOUT");
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.refresh_tokens WHERE session_id = ? AND revoked_at IS NULL
                """, Integer.class, first.sessionId())).isZero();

        assertThat(get("/api/v1/auth/me", first.accessToken()).statusCode()).isEqualTo(401);
        var rejectedRefresh = refresh(first.refreshToken());
        assertThat(rejectedRefresh.statusCode()).as(rejectedRefresh.body()).isEqualTo(401);

        assertCurrentUser(second.accessToken());
        assertThat(jdbc.queryForObject("""
                SELECT revoked_at IS NULL FROM wok.auth_sessions WHERE id = ? AND user_id = ?
                """, Boolean.class, second.sessionId(), userId)).isTrue();
        var refreshed = refresh(second.refreshToken());
        assertThat(refreshed.statusCode()).as(refreshed.body()).isEqualTo(200);
        Session rotated = readSession(refreshed.body());
        assertThat(rotated.sessionId()).isEqualTo(second.sessionId());
        assertThat(rotated.refreshToken()).isNotEqualTo(second.refreshToken());
        assertCurrentUser(rotated.accessToken());
    }

    private void assertCurrentUser(String accessToken) throws Exception {
        var response = get("/api/v1/auth/me", accessToken);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        var expected = json.createObjectNode();
        expected.put("userId", userId.toString());
        expected.put("email", email);
        expected.put("displayName", "CLIENT");
        expected.put("status", "ACTIVE");
        expected.putArray("roles").add("CLIENT").add(extraRole);
        expected.putArray("permissions").add("profile:read").add("profile:update")
                .add("service:manage").add("service:read");
        assertThat(json.readTree(response.body())).isEqualTo(expected);
    }

    private Session login(String clientType) throws Exception {
        var response = post("/api/v1/auth/login", null, """
                {"email":"%s","password":"%s","clientType":"%s"}
                """.formatted(email, PASSWORD, clientType));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return readSession(response.body());
    }

    private Session readSession(String body) throws Exception {
        var pair = json.readTree(body);
        String access = pair.path("accessToken").asText();
        String refresh = pair.path("refreshToken").asText();
        assertThat(access).isNotBlank();
        assertThat(refresh).isNotBlank();
        UUID sessionId = jdbc.queryForObject("SELECT session_id FROM wok.refresh_tokens WHERE token_hash = ?",
                UUID.class, tokens.hash(refresh));
        return new Session(access, refresh, sessionId);
    }

    private java.net.http.HttpResponse<String> refresh(String refreshToken) {
        return post("/api/v1/auth/refresh", null, "{\"refreshToken\":\"" + refreshToken + "\"}");
    }

    private void grantTestRole(String code, boolean active, boolean revoked, String... permissions) {
        UUID roleId = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.roles (id, code, name, active) VALUES (?, ?, ?, ?)",
                roleId, code, "Rol de integración", active);
        jdbc.update("""
                INSERT INTO wok.user_roles (user_id, role_id, revoked_at)
                VALUES (?, ?, CASE WHEN ? THEN now() ELSE NULL END)
                """, userId, roleId, revoked);
        for (String permission : permissions) {
            assertThat(jdbc.update("""
                    INSERT INTO wok.role_permissions (role_id, permission_id)
                    SELECT ?, id FROM wok.permissions WHERE code = ?
                    """, roleId, permission)).isEqualTo(1);
        }
    }

    private record Session(String accessToken, String refreshToken, UUID sessionId) {}
}
