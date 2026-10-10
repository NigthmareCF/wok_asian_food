package com.wokasianfood.api.customers;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProfileResourcesIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void addressesPreserveOwnershipVersionsAndAtomicAudit() throws Exception {
        UUID owner = createUserWithRole("addresses-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String token = tokenFor(owner);
        String other = tokenForRole("CLIENT");
        String input = """
                {"label":"Casa","address":"Zona 10, Guatemala","contactPhone":"55551234","isDefault":true}
                """;
        var created = post("/api/v1/client/addresses", token, input);
        assertThat(created.statusCode()).as(created.body()).isEqualTo(200);
        var address = json.readTree(created.body());
        UUID id = UUID.fromString(address.path("addressId").asText());
        String path = "/api/v1/client/addresses/" + id;
        String update = input.substring(0, input.lastIndexOf('}')) + ",\"expectedVersion\":1}";
        assertThat(send("PUT", path, other, update, Map.of()).statusCode()).isEqualTo(404);
        assertThat(send("DELETE", path, other, null, Map.of()).statusCode()).isEqualTo(404);
        assertThat(json.readTree(get("/api/v1/client/addresses", other).body())).isEmpty();
        assertThat(send("PUT", path, token, update, Map.of()).statusCode()).isEqualTo(200);
        assertThat(send("PUT", path, token, update, Map.of()).statusCode()).isEqualTo(409);
        var deleted = send("DELETE", path, token, null, Map.of());
        assertThat(deleted.statusCode()).isEqualTo(204);
        assertThat(deleted.body()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.customer_addresses WHERE id = ?", Integer.class, id)).isZero();
        var audits = jdbc.queryForList("""
                SELECT actor_user_id, action, created_at, before_data::text AS before_data, after_data::text AS after_data
                FROM wok.audit_logs WHERE entity_type = 'CUSTOMER_ADDRESS' AND entity_id = ? ORDER BY created_at
                """, id);
        assertThat(audits).hasSize(3);
        assertThat(audits).allSatisfy(row -> {
            assertThat(row.get("actor_user_id")).isEqualTo(owner);
            assertThat(row.get("created_at")).isNotNull();
            assertThat(row.toString()).doesNotContain("55551234", "Zona 10");
        });
    }

    @Test
    void sessionRevocationIsOwnerScopedAndInvalidatesAccess() throws Exception {
        UUID owner = createUserWithRole("sessions-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID session = openSession(owner);
        String targetToken = tokens.access(owner, session);
        String actorToken = tokenFor(owner);
        String path = "/api/v1/client/sessions/" + session;
        assertThat(send("DELETE", path, tokenForRole("CLIENT"), null, Map.of()).statusCode()).isEqualTo(404);
        assertThat(json.readTree(get("/api/v1/client/sessions", actorToken).body())).hasSize(2);
        var revoked = send("DELETE", path, actorToken, null, Map.of());
        assertThat(revoked.statusCode()).isEqualTo(204);
        assertThat(revoked.body()).isEmpty();
        assertThat(get("/api/v1/client/profile", targetToken).statusCode()).isEqualTo(401);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.security_events WHERE actor_user_id = ? AND session_id = ?
                    AND event_type = 'CLIENT_SESSION_REVOKED'
                """, Integer.class, owner, session)).isEqualTo(1);
    }
}
