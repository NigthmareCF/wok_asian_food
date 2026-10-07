package com.wokasianfood.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RoleAuthorizationIntegrationTest extends PostgresIntegrationTest {

    private static final String OPERATIONAL_TABLES = "/api/v1/operational/tables";
    private static final String OPERATIONAL_ORDERS = "/api/v1/operational/orders";
    private static final String OPERATIONAL_KITCHEN = "/api/v1/operational/kitchen/tickets";
    private static final String ADMIN_USERS = "/api/v1/admin/users";
    private static final String CLIENT_SESSIONS = "/api/v1/client/sessions";

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
    void correlatesRoleChangeAuditWithProvidedRequestIdAndGeneratesOneWhenMissing() {
        UUID adminId = createUserWithRole("admin-audit-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        String adminToken = tokenFor(adminId);
        UUID customerId = createUserWithRole("role-target-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID requestId = UUID.randomUUID();

        HttpResponse<String> granted = send("PUT", ADMIN_USERS + "/" + customerId + "/roles/OPERATIONAL",
                adminToken, """
                        {"action":"GRANT","reason":"Asignación autorizada","expectedVersion":1}
                        """, Map.of("X-Request-Id", requestId.toString()));

        assertThat(granted.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT request_id FROM wok.audit_logs WHERE entity_id=? AND action='USER_ROLE_GRANT'",
                UUID.class, customerId)).isEqualTo(requestId);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_id=? AND action='USER_ROLE_GRANT' AND actor_user_id=?",
                Integer.class, customerId, adminId)).isEqualTo(1);

        HttpResponse<String> revoked = send("PUT", ADMIN_USERS + "/" + customerId + "/roles/OPERATIONAL",
                adminToken, """
                        {"action":"REVOKE","reason":"Fin de la asignación","expectedVersion":2}
                        """, Map.of());

        assertThat(revoked.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT request_id IS NOT NULL FROM wok.audit_logs WHERE entity_id=? AND action='USER_ROLE_REVOKE'",
                Boolean.class, customerId)).isTrue();
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
