package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;

class ClientSessionOwnershipIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void clientCannotListOrRevokeAnotherCustomersSessions() throws Exception {
        UUID owner = createUserWithRole("session-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID otherCustomer = createUserWithRole("session-other-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String ownerToken = tokenFor(owner);
        UUID ownerSession = UUID.fromString(json.readTree(Base64.getUrlDecoder().decode(ownerToken.split("\\.")[1]))
                .path("sid").asText());
        UUID foreignSession = openSession(otherCustomer);

        var listed = get("/api/v1/client/sessions", ownerToken);
        assertThat(listed.statusCode()).as(listed.body()).isEqualTo(200);
        JsonNode sessions = json.readTree(listed.body());
        assertThat(sessions).hasSize(1);
        assertThat(sessions.get(0).path("sessionId").asText()).isEqualTo(ownerSession.toString());
        assertThat(sessions.get(0).path("current").asBoolean()).isTrue();

        var revoke = send("DELETE", "/api/v1/client/sessions/" + foreignSession, ownerToken, null,
                java.util.Map.of());
        assertThat(revoke.statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT revoked_at FROM wok.auth_sessions WHERE id = ?",
                java.sql.Timestamp.class, foreignSession)).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.security_events "
                + "WHERE session_id = ? AND event_type = 'CLIENT_SESSION_REVOKED'", Integer.class, foreignSession))
                .isZero();
    }

    @Test
    void revokingCurrentSessionAlsoRevokesRefreshAndInvalidatesAccessToken() throws Exception {
        UUID owner = createUserWithRole("session-self-revoke-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String ownerToken = tokenFor(owner);
        UUID currentSession = UUID.fromString(json.readTree(Base64.getUrlDecoder().decode(ownerToken.split("\\.")[1]))
                .path("sid").asText());
        UUID refreshId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.refresh_tokens (id, session_id, token_hash, expires_at)
            VALUES (?, ?, ?, now() + interval '1 day')
            """, refreshId, currentSession, "a".repeat(64));

        var revoke = send("DELETE", "/api/v1/client/sessions/" + currentSession, ownerToken, null,
                java.util.Map.of());

        assertThat(revoke.statusCode()).isEqualTo(204);
        assertThat(jdbc.queryForObject("SELECT revoked_at FROM wok.auth_sessions WHERE id = ?",
                java.sql.Timestamp.class, currentSession)).isNotNull();
        assertThat(jdbc.queryForObject("SELECT revoked_at FROM wok.refresh_tokens WHERE id = ?",
                java.sql.Timestamp.class, refreshId)).isNotNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.security_events "
                + "WHERE session_id = ? AND event_type = 'CLIENT_SESSION_REVOKED'", Integer.class, currentSession))
                .isEqualTo(1);
        assertThat(get("/api/v1/client/sessions", ownerToken).statusCode()).isEqualTo(401);
    }

    @Test
    void concurrentRevocationOfOwnedSessionWritesOneAuditEvent() throws Exception {
        UUID owner = createUserWithRole("session-revoke-race-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String ownerToken = tokenFor(owner);
        UUID targetSession = openSession(owner);
        UUID refreshId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.refresh_tokens (id, session_id, token_hash, expires_at)
            VALUES (?, ?, ?, now() + interval '1 day')
            """, refreshId, targetSession, "b".repeat(64));
        String path = "/api/v1/client/sessions/" + targetSession;
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> revokeWhenReleased(ready, start, path, ownerToken));
            var second = executor.submit(() -> revokeWhenReleased(ready, start, path, ownerToken));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            HttpResponse<String> firstResult = first.get(10, TimeUnit.SECONDS);
            HttpResponse<String> secondResult = second.get(10, TimeUnit.SECONDS);

            assertThat(java.util.List.of(firstResult.statusCode(), secondResult.statusCode()))
                    .containsExactlyInAnyOrder(204, 404);
            assertThat(jdbc.queryForObject("SELECT revoked_at FROM wok.auth_sessions WHERE id = ?",
                    java.sql.Timestamp.class, targetSession)).isNotNull();
            assertThat(jdbc.queryForObject("SELECT revoked_at FROM wok.refresh_tokens WHERE id = ?",
                    java.sql.Timestamp.class, refreshId)).isNotNull();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.security_events "
                    + "WHERE session_id = ? AND event_type = 'CLIENT_SESSION_REVOKED'", Integer.class, targetSession))
                    .isEqualTo(1);
        }
    }

    private HttpResponse<String> revokeWhenReleased(CountDownLatch ready, CountDownLatch start,
                                                       String path, String token) throws Exception {
        ready.countDown();
        if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("race start timed out");
        return send("DELETE", path, token, null, Map.of());
    }
}
