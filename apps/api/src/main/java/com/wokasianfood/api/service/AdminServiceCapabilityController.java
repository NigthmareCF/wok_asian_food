package com.wokasianfood.api.service;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/service-capabilities")
@PreAuthorize("hasRole('ADMIN')")
public class AdminServiceCapabilityController {
    private final ServiceCapabilityManager manager;

    public AdminServiceCapabilityController(ServiceCapabilityManager manager) { this.manager = manager; }

    @GetMapping
    public List<ServiceCapabilityManager.Capability> list() { return manager.list(); }

    @PutMapping("/{code}")
    public ServiceCapabilityManager.Capability change(
            @PathVariable String code,
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody ChangeRequest request) {
        return manager.change(code, UUID.fromString(jwt.getSubject()), requestId == null ? UUID.randomUUID() : requestId,
                request.status(), request.reason().trim(), request.expectedVersion());
    }

    public record ChangeRequest(@NotNull ServiceCapabilityManager.Status status,
                                @NotBlank @Size(min = 3, max = 500) String reason,
                                @Positive int expectedVersion) {}
}

@Service
class ServiceCapabilityManager {
    private final JdbcTemplate jdbc;

    ServiceCapabilityManager(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Capability> list() {
        return jdbc.query("""
            SELECT code, status, reason, row_version, policy_version, effective_from, effective_until
            FROM wok.service_capabilities
            WHERE effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
            ORDER BY code
            """, (rs, row) -> new Capability(rs.getString("code"), Status.valueOf(rs.getString("status")),
                rs.getString("reason"), rs.getInt("row_version"), rs.getInt("policy_version"),
                rs.getTimestamp("effective_from").toInstant(),
                rs.getTimestamp("effective_until") == null ? null : rs.getTimestamp("effective_until").toInstant()));
    }

    @Transactional
    public Capability change(String code, UUID actor, UUID requestId, Status status, String reason, int expectedVersion) {
        List<Capability> current = jdbc.query("""
            SELECT code, status, reason, row_version, policy_version, effective_from, effective_until
            FROM wok.service_capabilities WHERE code = ? FOR UPDATE
            """, (rs, row) -> new Capability(rs.getString("code"), Status.valueOf(rs.getString("status")),
                rs.getString("reason"), rs.getInt("row_version"), rs.getInt("policy_version"),
                rs.getTimestamp("effective_from").toInstant(),
                rs.getTimestamp("effective_until") == null ? null : rs.getTimestamp("effective_until").toInstant()), code);
        if (current.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Servicio desconocido.");
        Capability before = current.getFirst();
        if (before.rowVersion() != expectedVersion)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El estado cambió. Actualiza la vista y vuelve a intentarlo.");
        if (before.status() == status && Objects.equals(before.reason(), reason)) return before;

        int updated = jdbc.update("""
            UPDATE wok.service_capabilities
            SET status = ?, reason = ?, changed_by = ?, updated_by = ?, updated_at = now(),
                policy_version = policy_version + 1, row_version = row_version + 1
            WHERE code = ? AND row_version = ?
            """, status.name(), reason, actor, actor, code, expectedVersion);
        if (updated != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "El estado cambió. Actualiza la vista y vuelve a intentarlo.");

        jdbc.update("""
            INSERT INTO wok.service_capability_events
                (capability_id, previous_status, new_status, reason, actor_user_id, request_id)
            SELECT id, ?, ?, ?, ?, ? FROM wok.service_capabilities WHERE code = ?
            """, before.status().name(), status.name(), reason, actor, requestId, code);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            SELECT ?, 'SERVICE_CAPABILITY_CHANGED', 'SERVICE_CAPABILITY', id,
                   jsonb_build_object('status', ?, 'version', ?),
                   jsonb_build_object('status', ?, 'version', row_version), ?, 'SUCCESS', ?
            FROM wok.service_capabilities WHERE code = ?
            """, actor, before.status().name(), before.rowVersion(), status.name(), reason, requestId, code);
        return new Capability(before.code(), status, reason, expectedVersion + 1, before.policyVersion() + 1,
                before.effectiveFrom(), before.effectiveUntil());
    }

    enum Status { ENABLED, MANUAL_APPROVAL, PAUSED, DISABLED }
    record Capability(String code, Status status, String reason, int rowVersion, int policyVersion,
                      Instant effectiveFrom, Instant effectiveUntil) {}
}
