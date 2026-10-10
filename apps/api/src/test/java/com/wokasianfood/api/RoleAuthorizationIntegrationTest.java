package com.wokasianfood.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalTime;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class RoleAuthorizationIntegrationTest extends PostgresIntegrationTest {

    private static final String OPERATIONAL_TABLES = "/api/v1/operational/tables";
    private static final String OPERATIONAL_ORDERS = "/api/v1/operational/orders";
    private static final String OPERATIONAL_KITCHEN = "/api/v1/operational/kitchen/tickets";
    private static final String ADMIN_USERS = "/api/v1/admin/users";
    private static final String CLIENT_SESSIONS = "/api/v1/client/sessions";
    private static final String RESERVATION_POLICY = "/api/v1/client/reservations/policy";

    @Test
    void reservationPolicyIsClientOnlyAndReturnsThePublishedWireContract() throws Exception {
        assertThat(get(RESERVATION_POLICY, null).statusCode()).isEqualTo(401);
        for (String role : java.util.List.of("OPERATIONAL", "ADMIN")) {
            assertThat(get(RESERVATION_POLICY, tokenForRole(role)).statusCode()).isEqualTo(403);
        }

        Instant before = Instant.now();
        var response = get(RESERVATION_POLICY, tokenForRole("CLIENT"));
        Instant after = Instant.now();
        assertThat(response.statusCode()).isEqualTo(200);
        var policy = JsonMapper.builder().build().readTree(response.body());
        assertThat(policy.size()).isEqualTo(9);
        assertThat(policy.path("minimumNoticeMinutes").asInt()).isEqualTo(120);
        assertThat(policy.path("additionalPairMinutes").asInt()).isEqualTo(15);
        assertThat(policy.path("timeZone").asString()).isEqualTo("America/Guatemala");
        assertThat(policy.path("minimumNoticeHours").asInt()).isEqualTo(2);
        assertThat(LocalTime.parse(policy.path("firstRequestTime").asString())).isEqualTo(LocalTime.of(14, 0));
        assertThat(LocalTime.parse(policy.path("lastRequestTime").asString())).isEqualTo(LocalTime.of(21, 15));
        assertThat(LocalTime.parse(policy.path("preorderRecommendedAfter").asString())).isEqualTo(LocalTime.of(20, 30));
        assertThat(policy.path("preorderItemsSupported").asBoolean()).isFalse();
        assertThat(Instant.parse(policy.path("asOf").asString())).isBetween(before, after);
    }

    @Test
    void rejectsAnonymousRequestsToProtectedAreas() {
        assertThat(get(OPERATIONAL_TABLES, null).statusCode()).isEqualTo(401);
        assertThat(get(OPERATIONAL_ORDERS, null).statusCode()).isEqualTo(401);
        assertThat(get(OPERATIONAL_KITCHEN, null).statusCode()).isEqualTo(401);
        assertThat(get(CLIENT_SESSIONS, null).statusCode()).isEqualTo(401);
        assertThat(get(ADMIN_USERS, null).statusCode()).isEqualTo(401);
    }

    @Test
    void blocksClientsFromOperationalAndAdminAreas() {
        String client = tokenForRole("CLIENT");

        assertThat(get(OPERATIONAL_TABLES, client).statusCode()).isEqualTo(403);
        assertThat(get(OPERATIONAL_ORDERS, client).statusCode()).isEqualTo(403);
        assertThat(get(OPERATIONAL_KITCHEN, client).statusCode()).isEqualTo(403);
        assertThat(get(ADMIN_USERS, client).statusCode()).isEqualTo(403);
        assertThat(get(CLIENT_SESSIONS, client).statusCode()).isEqualTo(200);
    }

    @Test
    void blocksOperationalStaffFromClientAndAdminAreas() {
        String operational = tokenForRole("OPERATIONAL");

        assertThat(get(CLIENT_SESSIONS, operational).statusCode()).isEqualTo(403);
        assertThat(get(ADMIN_USERS, operational).statusCode()).isEqualTo(403);
        assertThat(get(OPERATIONAL_TABLES, operational).statusCode()).isEqualTo(200);
        assertThat(get(OPERATIONAL_ORDERS, operational).statusCode()).isEqualTo(200);
        assertThat(get(OPERATIONAL_KITCHEN, operational).statusCode()).isEqualTo(200);
    }

    @Test
    void letsAdministratorsReachOperationalAndAdministrativeAreas() {
        String admin = tokenForRole("ADMIN");

        assertThat(get(ADMIN_USERS, admin).statusCode()).isEqualTo(200);
        assertThat(get(OPERATIONAL_TABLES, admin).statusCode()).isEqualTo(200);
        assertThat(get(OPERATIONAL_ORDERS, admin).statusCode()).isEqualTo(200);
        assertThat(get(OPERATIONAL_KITCHEN, admin).statusCode()).isEqualTo(200);
        assertThat(get(CLIENT_SESSIONS, admin).statusCode()).isEqualTo(403);
    }

    @Test
    void keepsPublicEndpointsOpenToAnonymous() {
        assertThat(get("/actuator/health", null).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/openapi", null).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/public/menu", null).statusCode()).isEqualTo(200);
    }

    @Test
    void rejectsExpiredSessionToken() {
        var userId = createUserWithRole("expired-" + java.util.UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        var sessionId = openSession(userId);
        jdbc.update("""
                UPDATE wok.auth_sessions SET created_at = now() - interval '2 hours',
                    expires_at = now() - interval '1 hour' WHERE id = ?
                """, sessionId);
        String token = tokens.access(userId, sessionId);

        HttpResponse<String> response = get(OPERATIONAL_TABLES, token);
        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Test
    void rejectsTokenAfterSessionRevocation() {
        var userId = createUserWithRole("revoked-" + java.util.UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        var sessionId = openSession(userId);
        String token = tokens.access(userId, sessionId);
        jdbc.update("UPDATE wok.auth_sessions SET revoked_at = now() WHERE id = ?", sessionId);

        assertThat(get(OPERATIONAL_TABLES, token).statusCode()).isEqualTo(401);
    }
}
