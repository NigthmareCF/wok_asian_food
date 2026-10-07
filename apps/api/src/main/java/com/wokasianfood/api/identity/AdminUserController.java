package com.wokasianfood.api.identity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {
    private final AdminUserService users;
    public AdminUserController(AdminUserService users) { this.users = users; }

    @GetMapping
    public List<AdminUser> list(@RequestParam(defaultValue = "") @Size(max = 100) String search,
                                @RequestParam(defaultValue = "50") int limit,
                                @RequestParam(defaultValue = "0") int offset) {
        return users.list(search.trim(), limit, offset);
    }

    @PutMapping("/{userId}/roles/{roleCode}")
    public AdminUser changeRole(@PathVariable UUID userId, @PathVariable String roleCode,
                                @AuthenticationPrincipal Jwt jwt,
                                @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
                                @Valid @RequestBody RoleChange request) {
        return users.changeRole(UUID.fromString(jwt.getSubject()), userId, roleCode,
                request.action(), request.reason().trim(), request.expectedVersion(),
                requestId == null ? UUID.randomUUID() : requestId);
    }

    public record RoleChange(Action action, @NotBlank @Size(min = 3, max = 500) String reason,
                             @Positive int expectedVersion) {}
    public enum Action { GRANT, REVOKE }
    public record AdminUser(UUID id, String email, String displayName, String status, int rowVersion,
                            Instant createdAt, List<String> roles) {}
}

@Service
class AdminUserService {
    private static final List<String> MANAGED_ROLES = List.of("OPERATIONAL", "ADMIN");
    private final JdbcTemplate jdbc;
    AdminUserService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<AdminUserController.AdminUser> list(String search, int limit, int offset) {
        if (limit < 1 || limit > 100 || offset < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Paginación inválida.");
        return jdbc.query("""
            SELECT u.id, u.email, u.display_name, u.status, u.row_version, u.created_at,
                   COALESCE(array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) AS roles
            FROM wok.users u
            LEFT JOIN wok.user_roles ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
            LEFT JOIN wok.roles r ON r.id = ur.role_id AND r.active
            WHERE (? = '' OR u.email ILIKE '%' || ? || '%' OR u.display_name ILIKE '%' || ? || '%')
            GROUP BY u.id
            ORDER BY u.created_at DESC, u.id
            LIMIT ? OFFSET ?
            """, (rs, row) -> new AdminUserController.AdminUser(rs.getObject("id", UUID.class),
                rs.getString("email"), rs.getString("display_name"), rs.getString("status"),
                rs.getInt("row_version"), rs.getTimestamp("created_at").toInstant(), readRoles(rs.getArray("roles"))),
                search, search, search, limit, offset);
    }

    @Transactional
    public AdminUserController.AdminUser changeRole(UUID actor, UUID userId, String roleCode,
            AdminUserController.Action action, String reason, int expectedVersion, UUID requestId) {
        String role = roleCode.trim().toUpperCase(java.util.Locale.ROOT);
        if (!MANAGED_ROLES.contains(role)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ese rol no se administra desde este flujo.");
        List<UUID> roleIds = jdbc.query("SELECT id FROM wok.roles WHERE code = ? AND active FOR UPDATE",
                (rs, row) -> rs.getObject(1, UUID.class), role);
        if (roleIds.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "El rol no está disponible.");
        UUID roleId = roleIds.getFirst();
        List<UserRow> rows = jdbc.query("""
            SELECT id, email, display_name, status, row_version, created_at FROM wok.users WHERE id = ? FOR UPDATE
            """, (rs, row) -> new UserRow(rs.getObject("id", UUID.class), rs.getString("email"),
                rs.getString("display_name"), rs.getString("status"), rs.getInt("row_version"),
                rs.getTimestamp("created_at").toInstant()), userId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No se encontró la cuenta.");
        UserRow target = rows.getFirst();
        if (target.rowVersion != expectedVersion)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La cuenta cambió. Actualiza la lista.");
        if (action == AdminUserController.Action.GRANT && !"ACTIVE".equals(target.status))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Sólo se asignan roles a cuentas activas.");
        boolean active = jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM wok.user_roles WHERE user_id = ? AND role_id = ? AND revoked_at IS NULL)
            """, Boolean.class, userId, roleId);
        if (action == AdminUserController.Action.GRANT && active) return map(target);
        if (action == AdminUserController.Action.REVOKE && !active) return map(target);
        if (action == AdminUserController.Action.REVOKE && "ADMIN".equals(role)) {
            Integer admins = jdbc.queryForObject("""
                SELECT count(DISTINCT ur.user_id) FROM wok.user_roles ur
                JOIN wok.users u ON u.id = ur.user_id
                WHERE ur.role_id = ? AND ur.revoked_at IS NULL AND u.status = 'ACTIVE'
                """, Integer.class, roleId);
            if (admins != null && admins <= 1)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "No se puede retirar el último rol administrativo activo.");
        }
        if (action == AdminUserController.Action.GRANT) {
            jdbc.update("""
                INSERT INTO wok.user_roles (user_id, role_id, granted_by, reason) VALUES (?, ?, ?, ?)
                """, userId, roleId, actor, reason);
        } else {
            jdbc.update("""
                UPDATE wok.user_roles SET revoked_at = now(), revoked_by = ?, reason = ?
                WHERE user_id = ? AND role_id = ? AND revoked_at IS NULL
                """, actor, reason, userId, roleId);
        }
        jdbc.update("UPDATE wok.users SET row_version = row_version + 1, updated_by = ?, updated_at = now() WHERE id = ?",
                actor, userId);
        jdbc.update("""
            INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, ?, 'USER_ROLE', ?, jsonb_build_object('role', ?, 'active', ?),
                    jsonb_build_object('role', ?, 'active', ?), ?, 'SUCCESS', ?)
            """, actor, "USER_ROLE_" + action.name(), userId, role, active, role,
                action == AdminUserController.Action.GRANT, reason, requestId);
        UserRow changed = new UserRow(target.id, target.email, target.displayName, target.status,
                target.rowVersion + 1, target.createdAt);
        return map(changed);
    }

    private AdminUserController.AdminUser map(UserRow user) {
        List<String> roles = jdbc.query("""
            SELECT r.code FROM wok.user_roles ur JOIN wok.roles r ON r.id = ur.role_id
            WHERE ur.user_id = ? AND ur.revoked_at IS NULL AND r.active ORDER BY r.code
            """, (rs, row) -> rs.getString(1), user.id);
        return new AdminUserController.AdminUser(user.id, user.email, user.displayName,
                user.status, user.rowVersion, user.createdAt, roles);
    }

    private List<String> readRoles(java.sql.Array array) throws SQLException {
        Object[] values = (Object[]) array.getArray();
        List<String> roles = new ArrayList<>(values.length);
        for (Object value : values) roles.add(String.valueOf(value));
        return List.copyOf(roles);
    }
    private record UserRow(UUID id, String email, String displayName, String status, int rowVersion, Instant createdAt) {}
}
