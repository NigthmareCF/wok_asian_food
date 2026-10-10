package com.wokasianfood.api.operational;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Datos ficticios creados únicamente en el PostgreSQL nuevo de Testcontainers. */
class ClientWebPersistenceIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void reservationReplayAndStaffDecisionRemainVisibleOnlyToTheOwner() throws Exception {
        UUID owner = client();
        String customer = tokenFor(owner), stranger = tokenFor(client()), staff = tokenForRole("OPERATIONAL");
        String key = UUID.randomUUID().toString();
        ensureTable();String payload = withCoreQuote(customer,reservationPayload(),"RESERVATION");
        JsonNode submitted = body(post("/api/v1/client/reservations", customer, payload, Map.of("Idempotency-Key", key)));
        assertThat(submitted.path("submitted").asBoolean()).isTrue();
        String reservationId = submitted.path("reservationId").asText();
        JsonNode replay = body(post("/api/v1/client/reservations", customer, payload, Map.of("Idempotency-Key", key)));
        assertThat(replay.path("reservationId").asText()).isEqualTo(reservationId);
        assertThat(post("/api/v1/client/reservations", stranger, payload, Map.of("Idempotency-Key", key)).statusCode()).isEqualTo(409);
        JsonNode pending = body(get("/api/v1/operational/reservations/pending", staff)).valueStream()
                .filter(row -> reservationId.equals(row.path("id").asText())).findFirst().orElseThrow();
        String decision = "{\"decision\":\"CONFIRM\",\"reason\":\"Prueba controlada\",\"expectedVersion\":" + pending.path("rowVersion").asInt() + "}";
        JsonNode confirmed = body(send("PUT", "/api/v1/operational/reservations/" + reservationId + "/decision", staff, decision, Map.of("X-Request-Id", UUID.randomUUID().toString())));
        assertThat(confirmed.path("status").asText()).isEqualTo("CONFIRMED");
        JsonNode history = body(get("/api/v1/client/reservations", tokenFor(owner)));
        assertThat(history.valueStream().filter(row -> reservationId.equals(row.path("reservationId").asText())).findFirst().orElseThrow().path("reservationStatus").asText()).isEqualTo("CONFIRMED");
        assertThat(body(get("/api/v1/client/reservations", stranger)).valueStream().noneMatch(row -> reservationId.equals(row.path("reservationId").asText()))).isTrue();
        assertThat(send("DELETE", "/api/v1/client/reservations/" + reservationId, stranger, null, Map.of()).statusCode()).isEqualTo(404);
        assertThat(send("DELETE", "/api/v1/client/reservations/" + reservationId, customer, null, Map.of()).statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.reservation_evaluations WHERE request_id = ?", Integer.class, UUID.fromString(key))).isEqualTo(1);
    }

    @Test
    void cancellationIsPersistentAndReplayingItDoesNotCreateAnotherEvent() throws Exception {
        String customer = tokenFor(client());ensureTable();
        JsonNode submitted = body(post("/api/v1/client/reservations", customer, withCoreQuote(customer,reservationPayload(),"RESERVATION"), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        String id = submitted.path("reservationId").asText();
        for (int retry = 0; retry < 2; retry++) assertThat(body(send("DELETE", "/api/v1/client/reservations/" + id, customer, null, Map.of())).path("status").asText()).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.reservation_status_history WHERE reservation_id = ? AND to_status = 'CANCELLED'", Integer.class, UUID.fromString(id))).isEqualTo(1);
    }

    @Test
    void customerAndStaffExchangePersistentMessagesWithoutDuplicateSendsOrCrossCustomerReads() throws Exception {
        UUID owner = client();
        String customer = tokenFor(owner), stranger = tokenFor(client()), staff = tokenForRole("OPERATIONAL");
        String id = body(post("/api/v1/client/conversations", customer, "{}")).path("conversationId").asText();
        assertThat(body(post("/api/v1/client/conversations", customer, "{}")).path("conversationId").asText()).isEqualTo(id);
        String clientPath = "/api/v1/client/conversations/" + id + "/messages";
        String staffPath = "/api/v1/operational/conversations/" + id + "/messages";
        Map<String, String> key = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode sent = body(post(clientPath, customer, "{\"body\":\"Consulta de prueba\"}", key));
        assertThat(body(post(clientPath, customer, "{\"body\":\"Consulta de prueba\"}", key)).path("messageId").asText()).isEqualTo(sent.path("messageId").asText());
        assertThat(body(get("/api/v1/operational/conversations", staff)).valueStream().anyMatch(row -> id.equals(row.path("conversationId").asText()))).isTrue();
        Map<String, String> replyKey = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode reply = body(post(staffPath, staff, "{\"body\":\"Respuesta de prueba\"}", replyKey));
        assertThat(body(post(staffPath, staff, "{\"body\":\"Respuesta de prueba\"}", replyKey)).path("messageId").asText()).isEqualTo(reply.path("messageId").asText());
        JsonNode messages = body(get(clientPath, tokenFor(owner)));
        assertThat(messages.size()).isEqualTo(2);
        assertThat(messages.valueStream().anyMatch(row -> "Respuesta de prueba".equals(row.path("body").asText()) && "HUMAN".equals(row.path("senderType").asText()))).isTrue();
        assertThat(get(clientPath, stranger).statusCode()).isEqualTo(404);
        assertThat(post(clientPath, stranger, "{\"body\":\"No autorizado\"}", Map.of("Idempotency-Key", UUID.randomUUID().toString())).statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.messages WHERE conversation_id = ?", Integer.class, UUID.fromString(id))).isEqualTo(2);
    }

    @Test
    void profileUsesTheExistingVersionContractAndAdministrativeRolesPersist() throws Exception {
        UUID owner = client();
        String customer = tokenFor(owner), admin = tokenForRole("ADMIN");
        JsonNode profile = body(get("/api/v1/client/profile", customer));
        String update = "{\"displayName\":\"Cliente de prueba actualizado\",\"phone\":\"\",\"expectedVersion\":" + profile.path("version").asInt() + "}";
        JsonNode updated = body(send("PUT", "/api/v1/client/profile", customer, update, Map.of()));
        assertThat(updated.path("version").asInt()).isEqualTo(profile.path("version").asInt() + 1);
        assertThat(send("PUT", "/api/v1/client/profile", customer, update, Map.of()).statusCode()).isEqualTo(409);
        assertThat(body(get("/api/v1/client/profile", tokenFor(owner))).path("displayName").asText()).isEqualTo("Cliente de prueba actualizado");
        assertThat(body(get("/api/v1/client/profile", tokenFor(client()))).path("userId").asText()).isNotEqualTo(owner.toString());
        int version = jdbc.queryForObject("SELECT row_version FROM wok.users WHERE id = ?", Integer.class, owner);
        String roleChange = "{\"action\":\"GRANT\",\"reason\":\"Prueba controlada de acceso\",\"expectedVersion\":" + version + "}";
        String path = "/api/v1/admin/users/" + owner + "/roles/OPERATIONAL";
        assertThat(send("PUT", path, customer, roleChange, Map.of()).statusCode()).isEqualTo(403);
        assertThat(body(send("PUT", path, admin, roleChange, Map.of())).path("roles").valueStream().anyMatch(role -> "OPERATIONAL".equals(role.asText()))).isTrue();
        JsonNode listed = body(get("/api/v1/admin/users?search=web-contract&limit=100&offset=0", admin)).valueStream().filter(user -> owner.toString().equals(user.path("id").asText())).findFirst().orElseThrow();
        assertThat(listed.path("rowVersion").asInt()).isEqualTo(version + 1);
        assertThat(listed.path("roles").valueStream().anyMatch(role -> "OPERATIONAL".equals(role.asText()))).isTrue();
    }

    private UUID client() {
        UUID id = createUserWithRole("web-contract-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        jdbc.update("INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, 'Cliente de prueba') ON CONFLICT (user_id) DO NOTHING", id);
        return id;
    }
    private void ensureTable(){jdbc.update("INSERT INTO wok.dining_tables(name,zone,capacity) VALUES(?,?,4)","CORE_"+UUID.randomUUID(),"TEST");}
    private String reservationPayload() {
        String time = LocalDate.now(ZoneId.of("America/Guatemala")).plusDays(1).atTime(LocalTime.of(14, 0)).atZone(ZoneId.of("America/Guatemala")).toInstant().toString();
        return "{\"guests\":2,\"requestedAt\":\"" + time + "\",\"preorder\":false,\"notes\":\"Prueba controlada\"}";
    }
    private JsonNode body(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).isBetween(200, 299);
        return json.readTree(response.body());
    }
}
