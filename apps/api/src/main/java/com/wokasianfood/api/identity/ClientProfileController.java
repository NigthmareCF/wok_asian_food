package com.wokasianfood.api.identity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/client/profile")
@PreAuthorize("hasRole('CLIENT')")
public class ClientProfileController {
    private final ClientProfileService profiles;

    public ClientProfileController(ClientProfileService profiles) { this.profiles = profiles; }

    @GetMapping
    public ClientProfile get(@AuthenticationPrincipal Jwt jwt) {
        return profiles.get(UUID.fromString(jwt.getSubject()));
    }

    @PutMapping
    public ClientProfile update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateProfile request) {
        return profiles.update(UUID.fromString(jwt.getSubject()), request);
    }

    public record UpdateProfile(@NotBlank @Size(min = 2, max = 100) String displayName,
                                @Pattern(regexp = "^$|^[+0-9() .-]{7,25}$") String phone,
                                @Positive int expectedVersion) {}

    public record ClientProfile(UUID userId, String email, String displayName, String phone, int version) {}
}

@Service
class ClientProfileService {
    private final JdbcTemplate jdbc;

    ClientProfileService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public ClientProfileController.ClientProfile get(UUID userId) {
        List<ClientProfileController.ClientProfile> rows = jdbc.query("""
            SELECT u.id, u.email, u.display_name, u.phone, u.row_version
            FROM wok.users u
            JOIN wok.customer_profiles cp ON cp.user_id = u.id
            WHERE u.id = ? AND u.status = 'ACTIVE'
            """, (rs, row) -> new ClientProfileController.ClientProfile(
                rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("display_name"),
                rs.getString("phone"), rs.getInt("row_version")), userId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No se encontró el perfil Cliente.");
        return rows.getFirst();
    }

    @Transactional
    public ClientProfileController.ClientProfile update(UUID userId, ClientProfileController.UpdateProfile request) {
        List<ProfileRow> rows = jdbc.query("""
            SELECT u.email, u.display_name, u.phone, u.row_version, cp.id AS profile_id
            FROM wok.users u JOIN wok.customer_profiles cp ON cp.user_id = u.id
            WHERE u.id = ? AND u.status = 'ACTIVE' FOR UPDATE OF u, cp
            """, (rs, row) -> new ProfileRow(rs.getString("email"), rs.getString("display_name"),
                rs.getString("phone"), rs.getInt("row_version"), rs.getObject("profile_id", UUID.class)), userId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No se encontró el perfil Cliente.");
        ProfileRow current = rows.getFirst();
        if (current.version != request.expectedVersion())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El perfil cambió. Actualiza la información e inténtalo de nuevo.");

        String displayName = request.displayName().trim();
        String phone = request.phone() == null || request.phone().isBlank() ? null : request.phone().trim();
        Timestamp updatedAt = Timestamp.from(java.time.Instant.now());
        int changed = jdbc.update("""
            UPDATE wok.users SET display_name = ?, phone = ?, row_version = row_version + 1,
                updated_at = ?, updated_by = ? WHERE id = ? AND row_version = ?
            """, displayName, phone, updatedAt, userId, userId, request.expectedVersion());
        if (changed != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "El perfil cambió. Actualiza la información e inténtalo de nuevo.");
        jdbc.update("""
            UPDATE wok.customer_profiles SET full_name = ?, row_version = row_version + 1,
                updated_at = ?, updated_by = ? WHERE id = ?
            """, displayName, updatedAt, userId, current.profileId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, result, request_id)
            VALUES (?, 'CLIENT_PROFILE_UPDATED', 'CUSTOMER_PROFILE', ?,
                jsonb_build_object('displayName', ?, 'phonePresent', ?),
                jsonb_build_object('displayName', ?, 'phonePresent', ?), 'SUCCESS', ?)
            """, userId, current.profileId, current.displayName, current.phone != null,
                displayName, phone != null, UUID.randomUUID());
        return new ClientProfileController.ClientProfile(userId, current.email, displayName, phone,
                request.expectedVersion() + 1);
    }

    record ProfileRow(String email, String displayName, String phone, int version, UUID profileId) {}
}
