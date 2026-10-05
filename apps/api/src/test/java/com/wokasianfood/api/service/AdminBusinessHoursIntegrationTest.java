package com.wokasianfood.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AdminBusinessHoursIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void adminCanCreateAndUpdateHoursWithOptimisticVersionAndAudit() throws Exception {
        String admin = tokenForRole("ADMIN");
        String endpoint = "/api/v1/admin/business-hours/PICKUP/1";
        try {
            var created = send("PUT", endpoint, admin, """
                {"opensAt":"14:00:00","closesAt":"20:00:00","timezoneName":"America/Guatemala",
                 "active":true,"expectedVersion":0,"reason":"Horario inicial de pickup"}
                """, Map.of("X-Request-Id", UUID.randomUUID().toString()));
            assertThat(created.statusCode()).as(created.body()).isEqualTo(200);
            JsonNode first = json.readTree(created.body());
            assertThat(first.path("rowVersion").asInt()).isEqualTo(1);
            UUID id = UUID.fromString(first.path("id").asText());

            var updated = send("PUT", endpoint, admin, """
                {"opensAt":"15:00:00","closesAt":"21:00:00","timezoneName":"America/Guatemala",
                 "active":true,"expectedVersion":1,"reason":"Ajuste de horario aprobado"}
                """, Map.of());
            assertThat(updated.statusCode()).as(updated.body()).isEqualTo(200);
            assertThat(json.readTree(updated.body()).path("rowVersion").asInt()).isEqualTo(2);

            var stale = send("PUT", endpoint, admin, """
                {"opensAt":"13:00:00","closesAt":"21:00:00","timezoneName":"America/Guatemala",
                 "active":true,"expectedVersion":1,"reason":"Intento con versión antigua"}
                """, Map.of());
            assertThat(stale.statusCode()).isEqualTo(409);
            assertThat(jdbc.queryForObject("SELECT opens_at::text FROM wok.business_hours WHERE id = ?",
                    String.class, id)).startsWith("15:00");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? "
                    + "AND action IN ('BUSINESS_HOURS_CREATED','BUSINESS_HOURS_UPDATED')", Integer.class, id)).isEqualTo(2);
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE service_type = 'PICKUP' AND weekday = 1");
        }
    }

    @Test
    void businessHoursAreRestrictedToTheDedicatedAdminPermission() {
        String endpoint = "/api/v1/admin/business-hours";
        assertThat(get(endpoint, null).statusCode()).isEqualTo(401);
        assertThat(get(endpoint, tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
        assertThat(get(endpoint, tokenForRole("OPERATIONAL")).statusCode()).isEqualTo(403);
        assertThat(get(endpoint, tokenForRole("ADMIN")).statusCode()).isEqualTo(200);
    }

    @Test
    void rejectsInvalidWindowAndTimezone() {
        String token = tokenForRole("ADMIN");
        String endpoint = "/api/v1/admin/business-hours/DELIVERY/1";
        assertThat(send("PUT", endpoint, token, """
            {"opensAt":"20:00:00","closesAt":"14:00:00","timezoneName":"America/Guatemala",
             "active":true,"expectedVersion":0,"reason":"Ventana inválida"}
            """, Map.of()).statusCode()).isEqualTo(422);
        assertThat(send("PUT", endpoint, token, """
            {"opensAt":"14:00:00","closesAt":"20:00:00","timezoneName":"No/Existe",
             "active":true,"expectedVersion":0,"reason":"Zona inválida"}
            """, Map.of()).statusCode()).isEqualTo(422);
    }
}
