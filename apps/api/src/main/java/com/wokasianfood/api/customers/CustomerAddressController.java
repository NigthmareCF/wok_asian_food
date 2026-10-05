package com.wokasianfood.api.customers;

import com.wokasianfood.api.platform.GuatemalaPhone;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/client/addresses")
@PreAuthorize("hasRole('CLIENT')")
public class CustomerAddressController {
    private static final RowMapper<CustomerAddress> ADDRESS_MAPPER = (rs, row) -> mapAddress(rs);
    private final JdbcTemplate jdbc;

    public CustomerAddressController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<CustomerAddress> list(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = userId(jwt);
        return jdbc.query("""
            SELECT id, label, address, reference, contact_phone, is_default, row_version
            FROM wok.customer_addresses WHERE customer_user_id = ?
            ORDER BY is_default DESC, updated_at DESC, id LIMIT 50
            """, ADDRESS_MAPPER, userId);
    }

    @PostMapping
    @Transactional
    public CustomerAddress create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AddressInput input) {
        UUID userId = userId(jwt);
        lockCustomer(userId);
        if (labelExists(userId, input.label(), null))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe una dirección con ese nombre.");
        if (input.isDefault()) jdbc.update("UPDATE wok.customer_addresses SET is_default = false, updated_at = now(), row_version = row_version + 1 WHERE customer_user_id = ? AND is_default", userId);
        return jdbc.query("""
            INSERT INTO wok.customer_addresses(customer_user_id, label, address, reference, contact_phone, is_default)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id, label, address, reference, contact_phone, is_default, row_version
            """, ADDRESS_MAPPER, userId, input.label().trim(), input.address().trim(), normalize(input.reference()),
                input.contactPhone().trim(), input.isDefault()).getFirst();
    }

    @PutMapping("/{addressId}")
    @Transactional
    public CustomerAddress update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID addressId,
            @Valid @RequestBody AddressUpdate input) {
        UUID userId = userId(jwt);
        lockCustomer(userId);
        List<Integer> versions = jdbc.query("""
            SELECT row_version FROM wok.customer_addresses
            WHERE id = ? AND customer_user_id = ? FOR UPDATE
            """, (rs, row) -> rs.getInt("row_version"), addressId, userId);
        if (versions.isEmpty()) throw notFound();
        if (versions.getFirst() != input.expectedVersion())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La dirección cambió. Actualiza e inténtalo de nuevo.");
        if (labelExists(userId, input.label(), addressId))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe una dirección con ese nombre.");
        if (input.isDefault()) jdbc.update("UPDATE wok.customer_addresses SET is_default = false, updated_at = now(), row_version = row_version + 1 WHERE customer_user_id = ? AND is_default AND id <> ?", userId, addressId);
        return jdbc.query("""
            UPDATE wok.customer_addresses
            SET label = ?, address = ?, reference = ?, contact_phone = ?, is_default = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND customer_user_id = ? AND row_version = ?
            RETURNING id, label, address, reference, contact_phone, is_default, row_version
            """, ADDRESS_MAPPER, input.label().trim(), input.address().trim(), normalize(input.reference()),
                input.contactPhone().trim(), input.isDefault(), addressId, userId, input.expectedVersion()).getFirst();
    }

    @DeleteMapping("/{addressId}")
    @Transactional
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID addressId) {
        UUID userId = userId(jwt);
        lockCustomer(userId);
        int deleted = jdbc.update("DELETE FROM wok.customer_addresses WHERE id = ? AND customer_user_id = ?", addressId, userId);
        if (deleted == 0) throw notFound();
    }

    private boolean labelExists(UUID userId, String label, UUID excludedId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM wok.customer_addresses
            WHERE customer_user_id = ? AND lower(label) = lower(?) AND (?::uuid IS NULL OR id <> ?))
            """, Boolean.class, userId, label.trim(), excludedId, excludedId));
    }

    private void lockCustomer(UUID userId) {
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement = connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))")) {
                statement.setString(1, "customer-addresses:" + userId);
                statement.execute();
            }
            return null;
        });
    }

    private UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
    private String normalize(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private ResponseStatusException notFound() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "No encontramos esa dirección."); }

    private static CustomerAddress mapAddress(ResultSet rs) throws SQLException {
        return new CustomerAddress(rs.getObject("id", UUID.class), rs.getString("label"), rs.getString("address"),
                rs.getString("reference"), rs.getString("contact_phone"), rs.getBoolean("is_default"), rs.getInt("row_version"));
    }

    public record AddressInput(@NotBlank @Size(max = 80) String label,
            @NotBlank @Size(min = 5, max = 500) String address, @Size(max = 300) String reference,
            @NotBlank @Pattern(regexp = "^" + GuatemalaPhone.PATTERN + "$") String contactPhone, boolean isDefault) {}
    public record AddressUpdate(@NotBlank @Size(max = 80) String label,
            @NotBlank @Size(min = 5, max = 500) String address, @Size(max = 300) String reference,
            @NotBlank @Pattern(regexp = "^" + GuatemalaPhone.PATTERN + "$") String contactPhone, boolean isDefault,
            @Positive int expectedVersion) {}
    public record CustomerAddress(UUID addressId, String label, String address, String reference,
            String contactPhone, boolean isDefault, int version) {}
}
