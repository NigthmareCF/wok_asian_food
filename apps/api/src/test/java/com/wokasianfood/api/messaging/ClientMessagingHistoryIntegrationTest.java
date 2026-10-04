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

    private JsonNode body(java.net.http.HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }
}
