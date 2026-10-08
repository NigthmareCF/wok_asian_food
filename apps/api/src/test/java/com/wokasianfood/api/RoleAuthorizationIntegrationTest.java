package com.wokasianfood.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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
        assertThat(send("PUT", ADMIN_USERS + "/" + UUID.randomUUID() + "/status", client,
                "{\"action\":\"SUSPEND\",\"reason\":\"Prueba\",\"expectedVersion\":1}", Map.of()).statusCode()).isEqualTo(403);
        assertThat(get(CLIENT_SESSIONS, client).statusCode()).isEqualTo(200);
    }

    @Test
    void blocksOperationalStaffFromClientAndAdminAreas() {
        String operational = tokenForRole("OPERATIONAL");

        assertThat(get(CLIENT_SESSIONS, operational).statusCode()).isEqualTo(403);
        assertThat(get(ADMIN_USERS, operational).statusCode()).isEqualTo(403);
        assertThat(send("PUT", ADMIN_USERS + "/" + UUID.randomUUID() + "/status", operational,
                "{\"action\":\"SUSPEND\",\"reason\":\"Prueba\",\"expectedVersion\":1}", Map.of()).statusCode()).isEqualTo(403);
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
    void suspensionRevokesAllSessionsAndReactivationDoesNotRestoreThem() {
        UUID adminId = createUserWithRole("admin-suspend-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        String adminToken = tokenFor(adminId);
        UUID targetId = createUserWithRole("suspend-target-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID targetSession = openSession(targetId);
        String targetToken = tokens.access(targetId, targetSession);
        UUID requestId = UUID.randomUUID();

        HttpResponse<String> suspended = send("PUT", ADMIN_USERS + "/" + targetId + "/status", adminToken,
                """
                {"action":"SUSPEND","reason":"Investigación de seguridad","expectedVersion":1}
                """, Map.of("X-Request-Id", requestId.toString()));

        assertThat(suspended.statusCode()).isEqualTo(200);
        assertThat(suspended.body()).contains("\"status\":\"SUSPENDED\"", "\"rowVersion\":2", "\"OPERATIONAL\"");
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL AND revocation_reason = 'ACCOUNT_SUSPENDED' FROM wok.auth_sessions WHERE id = ?",
                Boolean.class, targetSession)).isTrue();
        assertThat(get(OPERATIONAL_TABLES, targetToken).statusCode()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT request_id FROM wok.audit_logs WHERE entity_id=? AND action='USER_SUSPEND'",
                UUID.class, targetId)).isEqualTo(requestId);

        HttpResponse<String> reactivated = send("PUT", ADMIN_USERS + "/" + targetId + "/status", adminToken,
                """
                {"action":"REACTIVATE","reason":"Revisión completada","expectedVersion":2}
                """, Map.of());

        assertThat(reactivated.statusCode()).isEqualTo(200);
        assertThat(reactivated.body()).contains("\"status\":\"ACTIVE\"", "\"rowVersion\":3");
        assertThat(get(OPERATIONAL_TABLES, targetToken).statusCode()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_id=? AND action IN ('USER_SUSPEND','USER_REACTIVATE')",
                Integer.class, targetId)).isEqualTo(2);
    }

    @Test
    void rejectsStaleSuspensionAndProtectsTheLastActiveAdministrator() {
        UUID adminId = createUserWithRole("admin-last-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        String adminToken = tokenFor(adminId);
        UUID customerId = createUserWithRole("suspend-stale-" + UUID.randomUUID() + "@wok.test", "CLIENT");

        HttpResponse<String> stale = send("PUT", ADMIN_USERS + "/" + customerId + "/status", adminToken,
                """
                {"action":"SUSPEND","reason":"Solicitud obsoleta","expectedVersion":2}
                """, Map.of());
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.users WHERE id=?", String.class, customerId)).isEqualTo("ACTIVE");

        List<UUID> otherAdminRoles = jdbc.query("""
            SELECT ur.id FROM wok.user_roles ur JOIN wok.roles r ON r.id=ur.role_id
            WHERE r.code='ADMIN' AND ur.revoked_at IS NULL AND ur.user_id<>?
            """, (rs, row) -> rs.getObject(1, UUID.class), adminId);
        otherAdminRoles.forEach(roleId -> jdbc.update("UPDATE wok.user_roles SET revoked_at=now() WHERE id=?", roleId));
        try {
            HttpResponse<String> lastAdmin = send("PUT", ADMIN_USERS + "/" + adminId + "/status", adminToken,
                    """
                    {"action":"SUSPEND","reason":"Prueba de último administrador","expectedVersion":1}
                    """, Map.of());
            assertThat(lastAdmin.statusCode()).isEqualTo(409);
            assertThat(lastAdmin.body()).contains("último administrador");
            assertThat(jdbc.queryForObject("SELECT status FROM wok.users WHERE id=?", String.class, adminId)).isEqualTo("ACTIVE");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_id=? AND action='USER_SUSPEND'",
                    Integer.class, adminId)).isZero();
        } finally {
            if (!otherAdminRoles.isEmpty())
                otherAdminRoles.forEach(roleId -> jdbc.update("UPDATE wok.user_roles SET revoked_at=NULL WHERE id=?", roleId));
        }
    }

    @Test
    void concurrentSuspensionsCannotRemoveTheLastActiveAdministrators() throws Exception {
        UUID firstTarget = createUserWithRole("admin-concurrent-first-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        UUID secondTarget = createUserWithRole("admin-concurrent-second-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        String firstToken = tokenFor(firstTarget);
        String secondToken = tokenFor(secondTarget);

        List<UUID> unrelatedAdminRoles = jdbc.query("""
            SELECT ur.id FROM wok.user_roles ur JOIN wok.roles r ON r.id=ur.role_id
            WHERE r.code='ADMIN' AND ur.revoked_at IS NULL
              AND ur.user_id NOT IN (?, ?)
            """, (rs, row) -> rs.getObject(1, UUID.class), firstTarget, secondTarget);
        unrelatedAdminRoles.forEach(roleId -> jdbc.update("UPDATE wok.user_roles SET revoked_at=now() WHERE id=?", roleId));

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent test start timed out");
                return send("PUT", ADMIN_USERS + "/" + secondTarget + "/status", firstToken,
                        "{\"action\":\"SUSPEND\",\"reason\":\"Prueba concurrente\",\"expectedVersion\":1}", Map.of());
            });
            var second = executor.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent test start timed out");
                return send("PUT", ADMIN_USERS + "/" + firstTarget + "/status", secondToken,
                        "{\"action\":\"SUSPEND\",\"reason\":\"Prueba concurrente\",\"expectedVersion\":1}", Map.of());
            });

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<Integer> responses = List.of(first.get(15, TimeUnit.SECONDS).statusCode(),
                    second.get(15, TimeUnit.SECONDS).statusCode());

            assertThat(responses).contains(200).allMatch(status -> status == 200 || status == 401 || status == 409);
            assertThat(responses.stream().filter(status -> status == 200)).hasSize(1);
            assertThat(jdbc.queryForObject("""
                SELECT count(DISTINCT ur.user_id) FROM wok.user_roles ur
                JOIN wok.roles r ON r.id=ur.role_id JOIN wok.users u ON u.id=ur.user_id
                WHERE r.code='ADMIN' AND ur.revoked_at IS NULL AND u.status='ACTIVE'
                """, Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE action='USER_SUSPEND' AND entity_id IN (?, ?)",
                    Integer.class, firstTarget, secondTarget)).isEqualTo(1);
        } finally {
            unrelatedAdminRoles.forEach(roleId -> jdbc.update("UPDATE wok.user_roles SET revoked_at=NULL WHERE id=?", roleId));
        }
    }

    @Test
    void administratorCanInspectAndRevokeOnlySessionsOwnedByTheSelectedAccount() {
        UUID adminId = createUserWithRole("admin-session-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        String adminToken = tokenFor(adminId);
        UUID targetId = createUserWithRole("session-target-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID targetSession = openSession(targetId);
        jdbc.update("UPDATE wok.auth_sessions SET device_name='Android test device' WHERE id=?", targetSession);
        String targetToken = tokens.access(targetId, targetSession);
        String refresh = tokens.refresh();
        jdbc.update("INSERT INTO wok.refresh_tokens (session_id, token_hash, expires_at) VALUES (?, ?, now() + interval '1 day')",
                targetSession, tokens.hash(refresh));
        UUID unrelatedUser = createUserWithRole("session-other-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID unrelatedSession = openSession(unrelatedUser);

        HttpResponse<String> listed = get(ADMIN_USERS + "/" + targetId + "/sessions", adminToken);
        assertThat(listed.statusCode()).isEqualTo(200);
        assertThat(listed.body()).contains(targetSession.toString(), "Android test device", "\"active\":true");

        UUID requestId = UUID.randomUUID();
        String revokePath = ADMIN_USERS + "/" + targetId + "/sessions/" + targetSession + "/revoke";
        HttpResponse<String> revoked = send("POST", revokePath, adminToken,
                "{\"reason\":\"Dispositivo reportado perdido\"}", Map.of("X-Request-Id", requestId.toString()));
        assertThat(revoked.statusCode()).isEqualTo(200);
        assertThat(revoked.body()).contains("\"active\":false", "\"revocationReason\":\"ADMIN_REVOKED\"");
        assertThat(get(OPERATIONAL_TABLES, targetToken).statusCode()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM wok.refresh_tokens WHERE session_id=?",
                Boolean.class, targetSession)).isTrue();
        assertThat(jdbc.queryForObject("SELECT request_id FROM wok.audit_logs WHERE entity_type='AUTH_SESSION' AND entity_id=?",
                UUID.class, targetSession)).isEqualTo(requestId);

        HttpResponse<String> replay = send("POST", revokePath, adminToken,
                "{\"reason\":\"Reintento\"}", Map.of());
        assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_type='AUTH_SESSION' AND entity_id=?",
                Integer.class, targetSession)).isEqualTo(1);

        HttpResponse<String> foreign = send("POST", ADMIN_USERS + "/" + targetId + "/sessions/" + unrelatedSession + "/revoke",
                adminToken, "{\"reason\":\"Prueba de aislamiento\"}", Map.of());
        assertThat(foreign.statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NULL FROM wok.auth_sessions WHERE id=?",
                Boolean.class, unrelatedSession)).isTrue();
    }

    @Test
    void sessionManagementIsAdminOnly() {
        String client = tokenForRole("CLIENT");
        String operational = tokenForRole("OPERATIONAL");
        String sessionPath = ADMIN_USERS + "/" + UUID.randomUUID() + "/sessions";
        assertThat(get(sessionPath, client).statusCode()).isEqualTo(403);
        assertThat(get(sessionPath, operational).statusCode()).isEqualTo(403);
        String revokePath = sessionPath + "/" + UUID.randomUUID() + "/revoke";
        String body = "{\"reason\":\"Solicitud inválida\"}";
        assertThat(send("POST", revokePath, client, body, Map.of()).statusCode()).isEqualTo(403);
        assertThat(send("POST", revokePath, operational, body, Map.of()).statusCode()).isEqualTo(403);
    }

    @Test
    void keepsPublicEndpointsOpenToAnonymous() {
        assertThat(get("/actuator/health", null).statusCode()).isEqualTo(200);
        HttpResponse<String> openApi = get("/api/v1/openapi", null);
        assertThat(openApi.statusCode()).isEqualTo(200);
        assertThat(openApi.body()).contains("/api/v1/admin/users/{userId}/status",
                "/api/v1/admin/users/{userId}/sessions/{sessionId}/revoke");
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
