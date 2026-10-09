package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ClientProfileOwnershipIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void profileReadsAndUpdatesOnlyTheAuthenticatedCustomerDespiteForgedOwnerField() throws Exception {
        UUID firstCustomer = createCustomer("profile-owner-a-" + UUID.randomUUID() + "@wok.test", "Cliente A");
        UUID secondCustomer = createCustomer("profile-owner-b-" + UUID.randomUUID() + "@wok.test", "Cliente B");
        String firstToken = tokenFor(firstCustomer);
        String secondToken = tokenFor(secondCustomer);

        JsonNode firstBefore = json.readTree(get("/api/v1/client/profile", firstToken).body());
        JsonNode secondBefore = json.readTree(get("/api/v1/client/profile", secondToken).body());
        assertThat(firstBefore.path("userId").asText()).isEqualTo(firstCustomer.toString());
        assertThat(firstBefore.path("email").asText()).contains("profile-owner-a-");
        assertThat(secondBefore.path("userId").asText()).isEqualTo(secondCustomer.toString());
        assertThat(secondBefore.path("email").asText()).contains("profile-owner-b-");

        var update = send("PUT", "/api/v1/client/profile", firstToken, """
            {"displayName":"Nombre actualizado A","phone":"5555 0101","expectedVersion":1,
             "userId":"%s","email":"victim@example.test","roles":["ADMIN"]}
            """.formatted(secondCustomer), Map.of());
        assertThat(update.statusCode()).as(update.body()).isEqualTo(200);
        JsonNode updated = json.readTree(update.body());
        assertThat(updated.path("userId").asText()).isEqualTo(firstCustomer.toString());
        assertThat(updated.path("displayName").asText()).isEqualTo("Nombre actualizado A");
        assertThat(updated.path("phone").asText()).isEqualTo("5555 0101");
        assertThat(updated.path("version").asInt()).isEqualTo(2);

        JsonNode secondAfter = json.readTree(get("/api/v1/client/profile", secondToken).body());
        assertThat(secondAfter.path("userId").asText()).isEqualTo(secondCustomer.toString());
        assertThat(secondAfter.path("displayName").asText()).isEqualTo("Cliente B");
        assertThat(secondAfter.path("email").asText()).contains("profile-owner-b-");
        assertThat(jdbc.queryForObject("SELECT display_name FROM wok.users WHERE id = ?", String.class, secondCustomer))
                .isEqualTo("Cliente B");
        UUID firstProfile = jdbc.queryForObject("SELECT id FROM wok.customer_profiles WHERE user_id = ?", UUID.class, firstCustomer);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE actor_user_id = ? "
                + "AND entity_type = 'CUSTOMER_PROFILE' AND entity_id = ?", Integer.class, firstCustomer, firstProfile))
                .isEqualTo(1);
    }

    private UUID createCustomer(String email, String displayName) {
        UUID userId = createUserWithRole(email, "CLIENT");
        jdbc.update("UPDATE wok.users SET display_name = ? WHERE id = ?", displayName, userId);
        jdbc.update("INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, ?)", userId, displayName);
        return userId;
    }
}
