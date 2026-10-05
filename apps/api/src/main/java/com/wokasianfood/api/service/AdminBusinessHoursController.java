package com.wokasianfood.api.service;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.DateTimeException;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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
@RequestMapping("/api/v1/admin/business-hours")
@PreAuthorize("hasAuthority('hours:manage')")
public class AdminBusinessHoursController {
    private final JdbcTemplate jdbc;

    public AdminBusinessHoursController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<BusinessHours> list() {
        return jdbc.query("""
            SELECT id, service_type, weekday, opens_at, closes_at, timezone_name, active, row_version
            FROM wok.business_hours ORDER BY service_type, weekday
            """, AdminBusinessHoursController::map);
    }

    @PutMapping("/{serviceType}/{weekday}")
    @Transactional
    public BusinessHours upsert(@PathVariable String serviceType, @PathVariable int weekday,
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody UpdateRequest request) {
        String normalizedType = serviceType.trim().toUpperCase(Locale.ROOT);
        if (!List.of("RESTAURANT", "DINE_IN", "PICKUP", "DELIVERY", "ONLINE").contains(normalizedType)
                || weekday < 1 || weekday > 7)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El servicio o día no es válido.");
        if (!request.closesAt().isAfter(request.opensAt()))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La hora de cierre debe ser posterior a la apertura.");
        String timezone = request.timezoneName().trim();
        try { ZoneId.of(timezone); }
        catch (DateTimeException invalid) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La zona horaria no es válida.");
        }

        List<BusinessHours> currentRows = jdbc.query("""
            SELECT id, service_type, weekday, opens_at, closes_at, timezone_name, active, row_version
            FROM wok.business_hours WHERE service_type = ? AND weekday = ? FOR UPDATE
            """, AdminBusinessHoursController::map, normalizedType, weekday);
        BusinessHours before = currentRows.isEmpty() ? null : currentRows.getFirst();
        if ((before == null && request.expectedVersion() != 0)
                || (before != null && before.rowVersion() != request.expectedVersion()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El horario cambió. Actualiza la vista antes de guardar.");

        UUID actor = UUID.fromString(jwt.getSubject());
        UUID operationId = requestId == null ? UUID.randomUUID() : requestId;
        BusinessHours after;
        if (before == null) {
            UUID id = UUID.randomUUID();
            jdbc.update("""
                INSERT INTO wok.business_hours
                    (id, service_type, weekday, opens_at, closes_at, timezone_name, active, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, normalizedType, weekday, request.opensAt(), request.closesAt(), timezone,
                    request.active(), actor, actor);
            after = new BusinessHours(id, normalizedType, weekday, request.opensAt(), request.closesAt(), timezone,
                    request.active(), 1);
        } else {
            int updated = jdbc.update("""
                UPDATE wok.business_hours
                SET opens_at = ?, closes_at = ?, timezone_name = ?, active = ?, updated_by = ?,
                    updated_at = now(), row_version = row_version + 1
                WHERE id = ? AND row_version = ?
                """, request.opensAt(), request.closesAt(), timezone, request.active(), actor,
                    before.id(), request.expectedVersion());
            if (updated != 1)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "El horario cambió. Actualiza la vista antes de guardar.");
            after = new BusinessHours(before.id(), normalizedType, weekday, request.opensAt(), request.closesAt(),
                    timezone, request.active(), request.expectedVersion() + 1);
        }

        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, ?, 'BUSINESS_HOURS', ?, ?::jsonb, ?::jsonb, ?, 'SUCCESS', ?)
            """, actor, before == null ? "BUSINESS_HOURS_CREATED" : "BUSINESS_HOURS_UPDATED", after.id(),
                before == null ? null : auditJson(before), auditJson(after), request.reason().trim(), operationId);
        return after;
    }

    private static String auditJson(BusinessHours hours) {
        return "{\"serviceType\":\"" + hours.serviceType() + "\",\"weekday\":" + hours.weekday()
                + ",\"opensAt\":\"" + hours.opensAt() + "\",\"closesAt\":\"" + hours.closesAt()
                + "\",\"timezoneName\":\"" + hours.timezoneName() + "\",\"active\":" + hours.active()
                + ",\"rowVersion\":" + hours.rowVersion() + "}";
    }

    private static BusinessHours map(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new BusinessHours(rs.getObject("id", UUID.class), rs.getString("service_type"),
                rs.getInt("weekday"), rs.getObject("opens_at", LocalTime.class),
                rs.getObject("closes_at", LocalTime.class), rs.getString("timezone_name"),
                rs.getBoolean("active"), rs.getInt("row_version"));
    }

    public record BusinessHours(UUID id, String serviceType, int weekday, LocalTime opensAt,
                                LocalTime closesAt, String timezoneName, boolean active, int rowVersion) {}

    public record UpdateRequest(@NotNull LocalTime opensAt, @NotNull LocalTime closesAt,
            @NotBlank @Size(max = 64) String timezoneName, @NotNull Boolean active,
            @NotNull @PositiveOrZero Integer expectedVersion,
            @NotBlank @Size(min = 3, max = 500) String reason) {}
}
