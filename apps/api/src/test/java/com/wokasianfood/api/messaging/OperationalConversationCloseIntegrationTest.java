package com.wokasianfood.api.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OperationalConversationCloseIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void closesOwnedAppThreadIdempotentlyAndAllowsCustomerToStartANewOne() {
        UUID customerId = createUserWithRole("conversation-close-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID staffId = createUserWithRole("conversation-staff-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID customerProfileId = jdbc.queryForObject("""
            INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, 'Cliente de prueba') RETURNING id
            """, UUID.class, customerId);
        String customerToken = tokenFor(customerId);
        String staffToken = tokenFor(staffId);

        JsonNode initial = body(post("/api/v1/client/conversations", customerToken, null));
        UUID conversationId = UUID.fromString(initial.path("conversationId").asText());
        assertThat(initial.path("version").asInt()).isEqualTo(1);
        body(post("/api/v1/client/conversations/" + conversationId + "/messages", customerToken,
                "{\"body\":\"Necesito ayuda\"}", Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(jdbc.queryForObject("SELECT row_version FROM wok.conversations WHERE id = ?",
                Integer.class, conversationId)).isEqualTo(2);
        JsonNode waiting = body(get("/api/v1/operational/conversations", staffToken));
        int currentVersion = java.util.stream.StreamSupport.stream(waiting.spliterator(), false)
                .filter(item -> conversationId.toString().equals(item.path("conversationId").asText()))
                .findFirst().orElseThrow().path("version").asInt();
        assertThat(currentVersion).isEqualTo(2);

        String path = "/api/v1/operational/conversations/" + conversationId + "/close";
        String key = UUID.randomUUID().toString();
        String payload = "{\"expectedVersion\":" + currentVersion + ",\"reason\":\"Consulta resuelta\"}";
        Map<String, String> headers = Map.of("Idempotency-Key", key, "X-Request-Id", UUID.randomUUID().toString());
        JsonNode closed = body(patch(path, staffToken, payload, headers));

        assertThat(closed.path("status").asText()).isEqualTo("CLOSED");
        assertThat(closed.path("version").asInt()).isEqualTo(3);
        assertThat(closed.path("closedAt").isTextual()).isTrue();
        JsonNode replay = body(patch(path, staffToken, payload, headers));
        assertThat(replay.path("conversationId").asText()).isEqualTo(conversationId.toString());
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(patch(path, staffToken, "{\"expectedVersion\":2,\"reason\":\"Otro motivo\"}",
                headers).statusCode()).isEqualTo(409);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE action = 'APP_CONVERSATION_CLOSED' "
                + "AND entity_id = ?", Integer.class, conversationId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.conversations WHERE customer_id = ? AND status = 'CLOSED'",
                Integer.class, customerProfileId)).isEqualTo(1);

        JsonNode next = body(post("/api/v1/client/conversations", customerToken, null));
        assertThat(next.path("conversationId").asText()).isNotEqualTo(conversationId.toString());
        assertThat(next.path("status").asText()).isEqualTo("OPEN");
        assertThat(next.path("version").asInt()).isEqualTo(1);
    }

    @Test
    void staleVersionCannotCloseConversationAndClientCannotUseStaffCommand() {
        UUID customerId = createUserWithRole("conversation-stale-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID staffId = createUserWithRole("conversation-stale-staff-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        jdbc.update("INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, 'Cliente stale')", customerId);
        String customerToken = tokenFor(customerId);
        JsonNode initial = body(post("/api/v1/client/conversations", customerToken, null));
        UUID conversationId = UUID.fromString(initial.path("conversationId").asText());
        String path = "/api/v1/operational/conversations/" + conversationId + "/close";
        String payload = "{\"expectedVersion\":99,\"reason\":\"Consulta resuelta\"}";

        assertThat(patch(path, tokenFor(staffId), payload,
                Map.of("Idempotency-Key", UUID.randomUUID().toString())).statusCode()).isEqualTo(409);
        assertThat(patch(path, customerToken, payload,
                Map.of("Idempotency-Key", UUID.randomUUID().toString())).statusCode()).isEqualTo(403);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.conversations WHERE id = ?", String.class,
                conversationId)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE action = 'APP_CONVERSATION_CLOSED' "
                + "AND entity_id = ?", Integer.class, conversationId)).isZero();
    }

    private JsonNode body(java.net.http.HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }
}
