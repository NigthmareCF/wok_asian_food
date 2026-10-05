package com.wokasianfood.api.reservations;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Staff-controlled assignment of one or more compatible dining tables to a confirmed reservation. */
@RestController
@RequestMapping("/api/v1/operational/reservations")
@PreAuthorize("hasAuthority('tables:manage')")
public class OperationalReservationTableAssignmentController {
    private final ReservationTableAssignmentService assignments;

    public OperationalReservationTableAssignmentController(ReservationTableAssignmentService assignments) {
        this.assignments = assignments;
    }

    @PostMapping("/{reservationId}/table-assignments")
    @ResponseStatus(HttpStatus.CREATED)
    public ReservationTableAssignmentService.AssignmentReceipt assign(
            @PathVariable UUID reservationId,
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody AssignmentRequest request) {
        return assignments.assign(reservationId, UUID.fromString(jwt.getSubject()), idempotencyKey,
                requestId == null ? UUID.randomUUID() : requestId, request);
    }

    public record AssignmentRequest(@NotEmpty @Size(max = 12) List<@NotNull UUID> tableIds,
                                    @Positive int expectedVersion,
                                    @NotBlank @Size(min = 3, max = 500) String reason) {}
}

@Service
class ReservationTableAssignmentService {
    private static final Duration ARRIVAL_TOLERANCE = Duration.ofMinutes(20);
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    ReservationTableAssignmentService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    @Transactional
    AssignmentReceipt assign(UUID reservationId, UUID actor, UUID idempotencyKey, UUID requestId,
                             OperationalReservationTableAssignmentController.AssignmentRequest request) {
        List<UUID> tableIds = request.tableIds().stream().sorted().toList();
        if (new HashSet<>(tableIds).size() != tableIds.size())
            throw new AuthException(422, "Selecciona cada mesa una sola vez.");
        String reason = request.reason().trim();
        String hash = fingerprint(reservationId, tableIds, request.expectedVersion(), reason);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "RESERVATION_TABLES_ASSIGNED", idempotencyKey, hash);
        if (claim.replay()) return receipt(claim.resourceId());

        Reservation reservation = lockReservation(reservationId);
        if (!Set.of("CONFIRMED", "ARRIVED").contains(reservation.status()))
            throw new AuthException(409, "Sólo se pueden asignar mesas a una reserva confirmada o que ya llegó.");
        if (reservation.version() != request.expectedVersion())
            throw new AuthException(409, "La reserva cambió. Actualiza la vista antes de asignar las mesas.");
        if (!reservation.startsAt().isAfter(Instant.now()))
            throw new AuthException(409, "El horario de la reserva ya comenzó; coordina la asignación desde la vista de mesas.");

        List<UUID> current = currentTableIds(reservationId);
        if (!current.isEmpty()) {
            if (current.equals(tableIds)) {
                idempotency.complete(actor.toString(), "RESERVATION_TABLES_ASSIGNED", idempotencyKey, reservationId);
                return receipt(reservationId);
            }
            throw new AuthException(409, "La reserva ya tiene mesas asignadas. Libera la asignación vigente antes de cambiarla.");
        }

        List<SelectedTable> selected = lockTables(tableIds);
        if (selected.size() != tableIds.size()) throw new AuthException(404, "No encontramos todas las mesas seleccionadas.");
        if (selected.stream().anyMatch(table -> !table.active() || "UNAVAILABLE".equals(table.status())))
            throw new AuthException(409, "Una o más mesas están inactivas o no disponibles.");
        if (selected.stream().anyMatch(table -> "OCCUPIED".equals(table.status())))
            throw new AuthException(409, "Una mesa seleccionada está ocupada. Elige mesas libres para evitar asignar una mesa sin disponibilidad confirmada.");
        if (selected.stream().map(SelectedTable::zone).map(value -> value.toUpperCase(Locale.ROOT)).distinct().count() > 1)
            throw new AuthException(422, "Las mesas de una misma reserva deben pertenecer a la misma zona.");
        int capacity = selected.stream().mapToInt(SelectedTable::capacity).sum();
        if (capacity < reservation.partySize())
            throw new AuthException(422, "La capacidad conjunta de las mesas no alcanza para todas las personas.");

        Instant occupiedUntil = reservation.endsAt().plus(ARRIVAL_TOLERANCE);
        if (!occupiedUntil.isAfter(reservation.startsAt()))
            throw new AuthException(409, "El periodo estimado de la reserva no es válido.");
        try {
            for (SelectedTable table : selected) {
                jdbc.update("""
                    INSERT INTO wok.reservation_table_assignments
                        (reservation_id, table_id, occupied_period, assigned_by)
                    VALUES (?, ?, tstzrange(?, ?, '[)'), ?)
                    """, reservationId, table.id(), Timestamp.from(reservation.startsAt()),
                        Timestamp.from(occupiedUntil), actor);
            }
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthException(409, "Una de las mesas se asignó a otra reserva en ese horario. Actualiza las disponibilidades.");
        }

        int updated = jdbc.update("""
            UPDATE wok.reservations
            SET updated_by = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND row_version = ? AND status IN ('CONFIRMED', 'ARRIVED')
            """, actor, reservationId, request.expectedVersion());
        if (updated != 1) throw new AuthException(409, "La reserva cambió. Actualiza la vista antes de asignar las mesas.");

        String idsJson = tableIds.stream().map(id -> "\"" + id + "\"").collect(java.util.stream.Collectors.joining(",", "[", "]"));
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, 'RESERVATION_TABLES_ASSIGNED', 'RESERVATION', ?,
                    jsonb_build_object('rowVersion', ?),
                    jsonb_build_object('tableIds', ?::jsonb, 'occupiedFrom', ?::timestamptz,
                                       'occupiedUntil', ?::timestamptz, 'rowVersion', ?::integer),
                    ?, 'SUCCESS', ?)
            """, actor, reservationId, request.expectedVersion(), idsJson,
                Timestamp.from(reservation.startsAt()), Timestamp.from(occupiedUntil), request.expectedVersion() + 1,
                reason, requestId);
        idempotency.complete(actor.toString(), "RESERVATION_TABLES_ASSIGNED", idempotencyKey, reservationId);
        return receipt(reservationId);
    }

    private Reservation lockReservation(UUID reservationId) {
        List<Reservation> rows = jdbc.query("""
            SELECT id, status, party_size, reservation_at, ends_at, row_version
            FROM wok.reservations WHERE id = ? FOR UPDATE
            """, (rs, row) -> new Reservation(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getInt("party_size"), rs.getTimestamp("reservation_at").toInstant(),
                rs.getTimestamp("ends_at").toInstant(), rs.getInt("row_version")), reservationId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la reserva.");
        return rows.getFirst();
    }

    private List<UUID> currentTableIds(UUID reservationId) {
        return jdbc.query("""
            SELECT table_id FROM wok.reservation_table_assignments
            WHERE reservation_id = ? AND released_at IS NULL ORDER BY table_id
            """, (rs, row) -> rs.getObject("table_id", UUID.class), reservationId);
    }

    private List<SelectedTable> lockTables(List<UUID> ids) {
        List<SelectedTable> tables = new ArrayList<>(ids.size());
        for (UUID id : ids) {
            List<SelectedTable> rows = jdbc.query("""
                SELECT id, capacity, zone, active, current_status
                FROM wok.dining_tables WHERE id = ? FOR UPDATE
                """, (rs, row) -> new SelectedTable(rs.getObject("id", UUID.class), rs.getInt("capacity"),
                    rs.getString("zone"), rs.getBoolean("active"), rs.getString("current_status")), id);
            tables.addAll(rows);
        }
        return tables;
    }

    @Transactional(readOnly = true)
    AssignmentReceipt receipt(UUID reservationId) {
        List<AssignmentReceipt> rows = jdbc.query("""
            SELECT r.id, r.row_version, r.reservation_at,
                   a.table_id, t.name AS table_name, t.capacity, t.zone,
                   lower(a.occupied_period) AS occupied_from, upper(a.occupied_period) AS occupied_until
            FROM wok.reservations r
            JOIN wok.reservation_table_assignments a ON a.reservation_id = r.id AND a.released_at IS NULL
            JOIN wok.dining_tables t ON t.id = a.table_id
            WHERE r.id = ? ORDER BY t.name
            """, (rs, row) -> new AssignmentReceipt(rs.getObject("id", UUID.class), rs.getInt("row_version"),
                rs.getTimestamp("reservation_at").toInstant(), rs.getTimestamp("occupied_until").toInstant(),
                List.of(new TableAssignment(rs.getObject("table_id", UUID.class), rs.getString("table_name"),
                    rs.getInt("capacity"), rs.getString("zone")))), reservationId);
        if (rows.isEmpty()) throw new AuthException(409, "La asignación no está disponible para repetición idempotente.");
        AssignmentReceipt first = rows.getFirst();
        return new AssignmentReceipt(first.reservationId(), first.rowVersion(), first.occupiedFrom(), first.occupiedUntil(),
                rows.stream().flatMap(row -> row.tables().stream()).toList());
    }

    private String fingerprint(UUID reservationId, List<UUID> tableIds, int version, String reason) {
        String value = "reservation-tables-v1\n" + reservationId + "\n" + tableIds + "\n" + version + "\n" + reason;
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is not available", impossible);
        }
    }

    private record Reservation(UUID id, String status, int partySize, Instant startsAt, Instant endsAt, int version) {}
    private record SelectedTable(UUID id, int capacity, String zone, boolean active, String status) {}
    public record TableAssignment(UUID tableId, String name, int capacity, String zone) {}
    public record AssignmentReceipt(UUID reservationId, int rowVersion, Instant occupiedFrom, Instant occupiedUntil,
                                    List<TableAssignment> tables) {}
}
