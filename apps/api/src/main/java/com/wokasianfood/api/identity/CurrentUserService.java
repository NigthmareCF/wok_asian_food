package com.wokasianfood.api.identity;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

@Service
class CurrentUserService {
    private final JdbcTemplate jdbc;

    CurrentUserService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    AuthDtos.CurrentUser load(UUID userId) {
        List<CurrentUserRow> rows = jdbc.query("""
            SELECT u.id, u.email, u.display_name, u.status
            FROM wok.users u
            WHERE u.id = ? AND u.status = 'ACTIVE'
            """, (rs, row) -> new CurrentUserRow(rs.getObject("id", UUID.class), rs.getString("email"),
                rs.getString("display_name"), rs.getString("status")), userId);
        if (rows.isEmpty())
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.UNAUTHORIZED, "Sesión inválida.");
        CurrentUserRow current = rows.getFirst();
        return new AuthDtos.CurrentUser(current.id, current.email, current.displayName, current.status,
            activeRoles(userId), effectivePermissions(userId));
    }

    private List<String> activeRoles(UUID userId) {
        return jdbc.queryForList("""
            SELECT DISTINCT r.code FROM wok.user_roles ur
            JOIN wok.roles r ON r.id = ur.role_id
            WHERE ur.user_id = ? AND ur.revoked_at IS NULL AND r.active
            ORDER BY r.code
            """, String.class, userId);
    }

    private List<String> effectivePermissions(UUID userId) {
        return jdbc.queryForList("""
            SELECT DISTINCT p.code FROM wok.user_roles ur
            JOIN wok.roles r ON r.id = ur.role_id
            JOIN wok.role_permissions rp ON rp.role_id = r.id
            JOIN wok.permissions p ON p.id = rp.permission_id
            WHERE ur.user_id = ? AND ur.revoked_at IS NULL AND r.active
            ORDER BY p.code
            """, String.class, userId);
    }

    record CurrentUserRow(UUID id, String email, String displayName, String status) {}
}
