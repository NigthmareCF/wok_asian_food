package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Base64;
import java.util.UUID;
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
}
