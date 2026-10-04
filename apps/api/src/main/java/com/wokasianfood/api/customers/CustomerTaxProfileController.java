package com.wokasianfood.api.customers;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/client/tax-profiles")
@PreAuthorize("hasRole('CLIENT')")
public class CustomerTaxProfileController {
    private static final RowMapper<CustomerTaxProfile> PROFILE_MAPPER = (rs, row) -> mapProfile(rs);
    private final JdbcTemplate jdbc;

    public CustomerTaxProfileController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<CustomerTaxProfile> list(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = userId(jwt);
        return jdbc.query("""
            SELECT id, label, customer_name, customer_tax_id, is_default, row_version
            FROM wok.customer_tax_profiles WHERE customer_user_id = ?
            ORDER BY is_default DESC, updated_at DESC, id LIMIT 20
            """, PROFILE_MAPPER, userId);
    }

    @PostMapping
    @Transactional
    public CustomerTaxProfile create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TaxProfileInput input) {
        UUID userId = userId(jwt);
        lockCustomer(userId);
        if (labelExists(userId, input.label(), null))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un perfil fiscal con ese nombre.");
        if (input.isDefault()) clearDefault(userId, null);
        return jdbc.query("""
            INSERT INTO wok.customer_tax_profiles(customer_user_id, label, customer_name, customer_tax_id, is_default)
            VALUES (?, ?, ?, ?, ?) RETURNING id, label, customer_name, customer_tax_id, is_default, row_version
            """, PROFILE_MAPPER, userId, input.label().trim(), input.customerName().trim(),
                input.customerTaxId().trim(), input.isDefault()).getFirst();
    }

    @PutMapping("/{profileId}")
    @Transactional
    public CustomerTaxProfile update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID profileId,
            @Valid @RequestBody TaxProfileUpdate input) {
        UUID userId = userId(jwt);
        lockCustomer(userId);
        List<Integer> versions = jdbc.query("""
            SELECT row_version FROM wok.customer_tax_profiles
            WHERE id = ? AND customer_user_id = ? FOR UPDATE
            """, (rs, row) -> rs.getInt("row_version"), profileId, userId);
        if (versions.isEmpty()) throw notFound();
        if (versions.getFirst() != input.expectedVersion())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El perfil fiscal cambió. Actualiza e inténtalo de nuevo.");
        if (labelExists(userId, input.label(), profileId))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un perfil fiscal con ese nombre.");
        if (input.isDefault()) clearDefault(userId, profileId);
        return jdbc.query("""
            UPDATE wok.customer_tax_profiles
            SET label = ?, customer_name = ?, customer_tax_id = ?, is_default = ?,
                updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND customer_user_id = ? AND row_version = ?
            RETURNING id, label, customer_name, customer_tax_id, is_default, row_version
            """, PROFILE_MAPPER, input.label().trim(), input.customerName().trim(), input.customerTaxId().trim(),
                input.isDefault(), profileId, userId, input.expectedVersion()).getFirst();
    }

    @DeleteMapping("/{profileId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID profileId) {
        UUID userId = userId(jwt);
        lockCustomer(userId);
        int deleted = jdbc.update("DELETE FROM wok.customer_tax_profiles WHERE id = ? AND customer_user_id = ?", profileId, userId);
        if (deleted == 0) throw notFound();
    }

    private boolean labelExists(UUID userId, String label, UUID excludedId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM wok.customer_tax_profiles
            WHERE customer_user_id = ? AND lower(label) = lower(?) AND (?::uuid IS NULL OR id <> ?))
            """, Boolean.class, userId, label.trim(), excludedId, excludedId));
    }

    private void clearDefault(UUID userId, UUID excludedId) {
        jdbc.update("""
            UPDATE wok.customer_tax_profiles SET is_default = false, updated_at = now(), row_version = row_version + 1
            WHERE customer_user_id = ? AND is_default AND (?::uuid IS NULL OR id <> ?)
            """, userId, excludedId, excludedId);
    }

    private void lockCustomer(UUID userId) {
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement = connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))")) {
                statement.setString(1, "customer-tax-profiles:" + userId);
                statement.execute();
            }
            return null;
        });
    }

    private UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "No encontramos ese perfil fiscal.");
    }

    private static CustomerTaxProfile mapProfile(ResultSet rs) throws SQLException {
        return new CustomerTaxProfile(rs.getObject("id", UUID.class), rs.getString("label"),
                rs.getString("customer_name"), rs.getString("customer_tax_id"),
                rs.getBoolean("is_default"), rs.getInt("row_version"));
    }

    public record TaxProfileInput(@NotBlank @Size(max = 60) String label,
            @NotBlank @Size(max = 150) String customerName, @NotBlank @Size(max = 32) String customerTaxId,
            boolean isDefault) {}
    public record TaxProfileUpdate(@NotBlank @Size(max = 60) String label,
            @NotBlank @Size(max = 150) String customerName, @NotBlank @Size(max = 32) String customerTaxId,
            boolean isDefault, @Positive int expectedVersion) {}
    public record CustomerTaxProfile(UUID profileId, String label, String customerName,
            String customerTaxId, boolean isDefault, int version) {}
}
