package com.wokasianfood.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PermissionAuthorizationIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void authorizesByPermissionInsteadOfRoleName() {
        String roleCode = "TABLES_ONLY_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        createRoleWithPermissions(roleCode, "tables:manage");
        String token = tokenForRole(roleCode);

        assertThat(get("/api/v1/operational/tables", token).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/operational/orders", token).statusCode()).isEqualTo(403);
        assertThat(get("/api/v1/operational/kitchen/tickets", token).statusCode()).isEqualTo(403);

        UUID tableId = createTable(token);
        assertThat(post("/api/v1/operational/tables/" + tableId + "/open", token, null).statusCode()).isEqualTo(403);
    }

    @Test
    void opensAndClosesAccountsWithAccountsPermission() {
        String roleCode = "ACCOUNTS_ONLY_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        createRoleWithPermissions(roleCode, "tables:manage", "accounts:manage");
        String token = tokenForRole(roleCode);
        UUID tableId = createTable(token);

        assertThat(post("/api/v1/operational/tables/" + tableId + "/open", token, null).statusCode()).isEqualTo(200);
        assertThat(post("/api/v1/operational/tables/" + tableId + "/close", token, null).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/operational/orders", token).statusCode()).isEqualTo(403);
    }

    private void createRoleWithPermissions(String roleCode, String... permissionCodes) {
        jdbc.update("INSERT INTO wok.roles (code, name) VALUES (?, ?)", roleCode, "Rol de prueba " + roleCode);
        for (String permissionCode : permissionCodes) {
            int granted = jdbc.update("""
                    INSERT INTO wok.role_permissions (role_id, permission_id)
                    SELECT r.id, p.id FROM wok.roles r JOIN wok.permissions p ON p.code = ?
                    WHERE r.code = ?
                    """, permissionCode, roleCode);
            assertThat(granted).as("permiso %s debe existir", permissionCode).isEqualTo(1);
        }
    }

    private UUID createTable(String token) {
        var response = post("/api/v1/operational/tables", token, """
                {"name":"Mesa Permiso %s","capacity":2,"zone":"SALON"}
                """.formatted(UUID.randomUUID().toString().substring(0, 8)));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        try {
            return UUID.fromString(json.readTree(response.body()).path("id").asText());
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }
}
