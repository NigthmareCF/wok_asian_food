package com.wokasianfood.api.service;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.sql.Timestamp;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/business-hours")
@PreAuthorize("hasAuthority('hours:manage')")
public class AdminBusinessHoursController {
    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private final JdbcTemplate jdbc;

    public AdminBusinessHoursController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<BusinessHours> list() {
        return jdbc.query("""
            SELECT id, service_type, weekday, opens_at, closes_at, timezone_name, active, row_version
            FROM wok.business_hours ORDER BY service_type, weekday
            """, AdminBusinessHoursController::map);
    }

    @GetMapping("/overrides")
    public List<BusinessHoursOverride> listOverrides(@RequestParam String serviceType,
            @RequestParam LocalDate from, @RequestParam LocalDate to) {
        String normalizedType = normalizeServiceType(serviceType);
        if (to.isBefore(from) || java.time.temporal.ChronoUnit.DAYS.between(from, to) > 30)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El rango debe ser de hasta 31 días.");
        return jdbc.query("""
            SELECT id, service_type, service_date, is_open, opens_at, closes_at, timezone_name,
                   reason, expires_at, row_version
            FROM wok.business_hours_overrides
            WHERE service_type = ? AND service_date BETWEEN ? AND ?
            ORDER BY service_date
            """, AdminBusinessHoursController::mapOverride, normalizedType, from, to);
    }

    @PutMapping("/overrides/{serviceType}/{serviceDate}")
    @Transactional
    public BusinessHoursOverride upsertOverride(@PathVariable String serviceType, @PathVariable LocalDate serviceDate,
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody UpdateOverrideRequest request) {
        String normalizedType = normalizeServiceType(serviceType);
        if (serviceDate.isBefore(LocalDate.now(RESTAURANT_ZONE)))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "No se pueden cambiar horarios de fechas pasadas.");
        String timezone = request.timezoneName().trim();
        ZoneId zone;
        try { zone = ZoneId.of(timezone); }
        catch (DateTimeException invalid) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La zona horaria no es válida.");
        }
        if (!RESTAURANT_ZONE.equals(zone))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El horario debe usar la zona America/Guatemala.");
        if (request.isOpen() && (request.opensAt() == null || request.closesAt() == null
                || !request.closesAt().isAfter(request.opensAt())))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Un servicio abierto requiere un intervalo válido.");
        if (!request.isOpen() && (request.opensAt() != null || request.closesAt() != null))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Un cierre excepcional no debe incluir horas.");

        ServiceHoursPolicy.lockServiceDate(jdbc, normalizedType, serviceDate);
        List<BusinessHoursOverride> currentRows = jdbc.query("""
            SELECT id, service_type, service_date, is_open, opens_at, closes_at, timezone_name,
                   reason, expires_at, row_version
            FROM wok.business_hours_overrides WHERE service_type = ? AND service_date = ? FOR UPDATE
            """, AdminBusinessHoursController::mapOverride, normalizedType, serviceDate);
        BusinessHoursOverride before = currentRows.isEmpty() ? null : currentRows.getFirst();
        if ((before == null && request.expectedVersion() != 0)
                || (before != null && before.rowVersion() != request.expectedVersion()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La excepción cambió. Actualiza la vista antes de guardar.");

        UUID actor = UUID.fromString(jwt.getSubject());
        UUID operationId = requestId == null ? UUID.randomUUID() : requestId;
        Instant expiresAt = serviceDate.plusDays(1).atStartOfDay(zone).toInstant();
        UUID id = before == null ? UUID.randomUUID() : before.id();
        int version = before == null ? 1 : before.rowVersion() + 1;
        BusinessHoursOverride after = new BusinessHoursOverride(id, normalizedType, serviceDate, request.isOpen(),
                request.opensAt(), request.closesAt(), timezone, request.reason().trim(), expiresAt, version);
        if (before == null) {
            int inserted = jdbc.update("""
                INSERT INTO wok.business_hours_overrides
                    (id, service_type, service_date, is_open, opens_at, closes_at, timezone_name,
                     reason, expires_at, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (service_type, service_date) DO NOTHING
                """, id, normalizedType, serviceDate, request.isOpen(), request.opensAt(), request.closesAt(),
                    timezone, after.reason(), Timestamp.from(expiresAt), actor, actor);
            if (inserted != 1)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Otra persona creó la excepción. Actualiza la vista.");
        } else {
            int updated = jdbc.update("""
                UPDATE wok.business_hours_overrides
                SET is_open = ?, opens_at = ?, closes_at = ?, timezone_name = ?, reason = ?, expires_at = ?,
                    updated_by = ?, updated_at = now(), row_version = row_version + 1
                WHERE id = ? AND row_version = ?
                """, request.isOpen(), request.opensAt(), request.closesAt(), timezone, after.reason(),
                    Timestamp.from(expiresAt),
                    actor, id, request.expectedVersion());
            if (updated != 1)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "La excepción cambió. Actualiza la vista antes de guardar.");
        }
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, ?, 'BUSINESS_HOURS_OVERRIDE', ?, ?::jsonb, ?::jsonb, ?, 'SUCCESS', ?)
            """, actor, before == null ? "BUSINESS_HOURS_OVERRIDE_CREATED" : "BUSINESS_HOURS_OVERRIDE_UPDATED",
                id, before == null ? null : overrideJson(before), overrideJson(after), after.reason(), operationId);
        return after;
    }

    @PutMapping("/{serviceType}/{weekday}")
    @Transactional
    public BusinessHours upsert(@PathVariable String serviceType, @PathVariable int weekday,
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody UpdateRequest request) {
        String normalizedType = normalizeServiceType(serviceType);
        if (weekday < 1 || weekday > 7)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El servicio o día no es válido.");
        if (!request.closesAt().isAfter(request.opensAt()))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La hora de cierre debe ser posterior a la apertura.");
        String timezone = request.timezoneName().trim();
        ZoneId zone;
        try { zone = ZoneId.of(timezone); }
        catch (DateTimeException invalid) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La zona horaria no es válida.");
        }
        if (!RESTAURANT_ZONE.equals(zone))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El horario debe usar la zona America/Guatemala.");

        ServiceHoursPolicy.lockWeeklySchedule(jdbc, normalizedType, weekday);
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

    private String overrideJson(BusinessHoursOverride hours) {
        return jdbc.queryForObject("""
            SELECT jsonb_build_object('serviceType', ?::text, 'serviceDate', ?::date, 'isOpen', ?::boolean,
                'opensAt', ?::time, 'closesAt', ?::time, 'timezoneName', ?::text,
                'expiresAt', ?::timestamptz, 'rowVersion', ?::integer)::text
            """, String.class, hours.serviceType(), hours.serviceDate(), hours.isOpen(), hours.opensAt(),
                hours.closesAt(), hours.timezoneName(), Timestamp.from(hours.expiresAt()), hours.rowVersion());
    }

    private static String normalizeServiceType(String serviceType) {
        String normalized = serviceType.trim().toUpperCase(Locale.ROOT);
        if (!List.of("RESTAURANT", "DINE_IN", "PICKUP", "DELIVERY", "ONLINE").contains(normalized))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El servicio no es válido.");
        return normalized;
    }

    private static BusinessHours map(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new BusinessHours(rs.getObject("id", UUID.class), rs.getString("service_type"),
                rs.getInt("weekday"), rs.getObject("opens_at", LocalTime.class),
                rs.getObject("closes_at", LocalTime.class), rs.getString("timezone_name"),
                rs.getBoolean("active"), rs.getInt("row_version"));
    }

    private static BusinessHoursOverride mapOverride(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new BusinessHoursOverride(rs.getObject("id", UUID.class), rs.getString("service_type"),
                rs.getObject("service_date", LocalDate.class), rs.getBoolean("is_open"),
                rs.getObject("opens_at", LocalTime.class), rs.getObject("closes_at", LocalTime.class),
                rs.getString("timezone_name"), rs.getString("reason"),
                rs.getTimestamp("expires_at").toInstant(), rs.getInt("row_version"));
    }

    public record BusinessHours(UUID id, String serviceType, int weekday, LocalTime opensAt,
                                LocalTime closesAt, String timezoneName, boolean active, int rowVersion) {}

    public record BusinessHoursOverride(UUID id, String serviceType, LocalDate serviceDate, boolean isOpen,
            LocalTime opensAt, LocalTime closesAt, String timezoneName, String reason,
            Instant expiresAt, int rowVersion) {}

    public record UpdateRequest(@NotNull LocalTime opensAt, @NotNull LocalTime closesAt,
            @NotBlank @Size(max = 64) String timezoneName, @NotNull Boolean active,
            @NotNull @PositiveOrZero Integer expectedVersion,
            @NotBlank @Size(min = 3, max = 500) String reason) {}

    public record UpdateOverrideRequest(@NotNull Boolean isOpen, LocalTime opensAt, LocalTime closesAt,
            @NotBlank @Size(max = 64) String timezoneName, @NotNull @PositiveOrZero Integer expectedVersion,
            @NotBlank @Size(min = 3, max = 500) String reason) {}
}
