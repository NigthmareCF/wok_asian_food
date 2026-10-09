package com.wokasianfood.api.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ClientMessagingHistoryIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void customerHistoryIncludesClosedThreadsAndTheirLastMessagePreview() {
        UUID customer = createUserWithRole("messages-history-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID staff = createUserWithRole("messages-staff-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID profileId = jdbc.queryForObject("""
            INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, 'Historial Cliente') RETURNING id
            """, UUID.class, customer);
        UUID conversationId = jdbc.queryForObject("""
            INSERT INTO wok.conversations(customer_id, channel, status, handling_mode, closed_at, created_by, updated_by)
            VALUES (?, 'APP', 'CLOSED', 'HUMAN', now(), ?, ?) RETURNING id
            """, UUID.class, profileId, customer, staff);
        jdbc.update("""
            INSERT INTO wok.messages(conversation_id, sender_type, sender_user_id, direction, body, status)
            VALUES (?, 'HUMAN', ?, 'OUTBOUND', 'Tu solicitud quedó resuelta.', 'SENT')
            """, conversationId, staff);

        JsonNode history = body(get("/api/v1/client/conversations", tokenFor(customer)));

        assertThat(history).hasSize(1);
        assertThat(history.get(0).path("conversationId").asText()).isEqualTo(conversationId.toString());
        assertThat(history.get(0).path("status").asText()).isEqualTo("CLOSED");
        assertThat(history.get(0).path("lastMessage").asText()).isEqualTo("Tu solicitud quedó resuelta.");
        assertThat(history.get(0).path("lastMessageAt").isNull()).isFalse();
    }

    @Test
    void customerCannotReadOrWriteAnotherCustomersConversation() {
        UUID owner = createUserWithRole("messages-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID otherCustomer = createUserWithRole("messages-outsider-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        jdbc.update("INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, 'Dueño del hilo')", owner);
        jdbc.update("INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, 'Otro cliente')", otherCustomer);
        String ownerToken = tokenFor(owner);
        String otherToken = tokenFor(otherCustomer);

        JsonNode opened = body(post("/api/v1/client/conversations", ownerToken, null));
        UUID conversationId = UUID.fromString(opened.path("conversationId").asText());
        String messagePath = "/api/v1/client/conversations/" + conversationId + "/messages";

        assertThat(body(get("/api/v1/client/conversations", otherToken))).isEmpty();
        assertThat(get(messagePath, otherToken).statusCode()).isEqualTo(404);
        assertThat(post(messagePath, otherToken, "{\"body\":\"Mensaje no autorizado\"}",
                java.util.Map.of("Idempotency-Key", UUID.randomUUID().toString())).statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.messages WHERE conversation_id = ?",
                Integer.class, conversationId)).isZero();
    }

    private JsonNode body(java.net.http.HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }
}
