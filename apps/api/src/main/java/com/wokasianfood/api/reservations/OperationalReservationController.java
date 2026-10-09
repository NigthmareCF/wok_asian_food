package com.wokasianfood.api.reservations;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.platform.IdempotencyStore;
import com.wokasianfood.api.service.ServiceHoursPolicy;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
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

/**
 * Shared staff queue for reservation review.
 *
 * <p>Deliberate model decision: reservations are reviewed by whoever picks them up, not by an assigned
 * host. The schema has no reservation assignee, so any active OPERATIONAL or ADMIN staff may confirm or
 * reject any pending reservation. Single-site host stands share the queue, and the decision is
 * serialized by the row lock plus {@code expectedVersion} on the decision call, so two staff racing on
 * the same reservation cannot both win. Adding per-host ownership would need an {@code assigned_to}
 * column and a claim endpoint; see {@code docs/frontend/channels/OPERATIVO.md}.
 */
@RestController
@RequestMapping("/api/v1/operational/reservations")
@PreAuthorize("hasAnyRole('OPERATIONAL', 'ADMIN')")
public class OperationalReservationController {
    private final ReservationReviewService reviews;

    public OperationalReservationController(ReservationReviewService reviews) { this.reviews = reviews; }

    public enum Decision { CONFIRM, REJECT }

    @GetMapping("/pending")
    public List<ReservationReviewService.PendingReservation> pending() { return reviews.pending(); }

    @PutMapping("/{reservationId}/decision")
    public ReservationReviewService.DecisionResult decide(
            @PathVariable UUID reservationId,
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "Idempotency-Key", required = false) UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody DecisionRequest request) {
        return reviews.decide(reservationId, UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId,
                idempotencyKey, request.decision(), request.reason().trim(), request.expectedVersion(), request.tableIds());
    }

    public record DecisionRequest(@NotNull Decision decision, @NotBlank @Size(min = 3, max = 500) String reason,
                                  @Positive int expectedVersion,
                                  @Size(max = 12) List<@NotNull UUID> tableIds) {}
}

@Service
class ReservationReviewService {
    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private static final LocalTime NORMAL_LAST_ENTRY = LocalTime.of(21, 15);
    private final JdbcTemplate jdbc;
    private final OperatingHoursProvider operatingHours;
    private final ReservationTableAssignmentService tableAssignments;
    private final IdempotencyStore idempotency;
    private static final ObjectMapper JSON = new ObjectMapper();

    ReservationReviewService(JdbcTemplate jdbc, OperatingHoursProvider operatingHours,
                             ReservationTableAssignmentService tableAssignments, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.operatingHours = operatingHours;
        this.tableAssignments = tableAssignments;
        this.idempotency = idempotency;
    }

    public List<PendingReservation> pending() {
        List<PendingReservationRow> rows = jdbc.query("""
            SELECT r.id, r.party_size, r.reservation_at, r.ends_at, r.notes, r.row_version,
                   cp.full_name, u.email
            FROM wok.reservations r
            JOIN wok.customer_profiles cp ON cp.id = r.customer_id
            LEFT JOIN wok.users u ON u.id = cp.user_id
            WHERE r.status = 'REQUESTED'
            ORDER BY r.reservation_at, r.id
            """, (rs, row) -> new PendingReservationRow(rs.getObject("id", UUID.class), rs.getInt("party_size"),
                rs.getTimestamp("reservation_at").toInstant(), rs.getTimestamp("ends_at").toInstant(),
                rs.getString("notes"), rs.getInt("row_version"), rs.getString("full_name"), rs.getString("email")));
        Map<UUID, List<OperationalReservationScheduleController.PreorderItem>> preorders = loadPreorders(
                rows.stream().map(PendingReservationRow::id).toList());
        return rows.stream().map(row -> new PendingReservation(row.id(), row.guests(), row.reservationAt(),
                row.estimatedEndAt(), row.notes(), row.rowVersion(), row.customerName(), row.email(),
                preorders.getOrDefault(row.id(), List.of()))).toList();
    }

    private Map<UUID, List<OperationalReservationScheduleController.PreorderItem>> loadPreorders(List<UUID> reservationIds) {
        if (reservationIds.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(reservationIds.size(), "?"));
        Map<UUID, PendingPreorderBuilder> items = new java.util.LinkedHashMap<>();
        jdbc.query("""
            SELECT e.reservation_id, i.id AS line_id, i.menu_item_id, i.name_snapshot, i.quantity, i.unit_price,
                   c.code AS currency, m.group_name_snapshot, m.modifier_name_snapshot, m.price_delta
            FROM wok.reservation_evaluations e
            JOIN wok.reservation_request_items i ON i.request_id = e.request_id
            JOIN wok.currencies c ON c.id = i.currency_id
            LEFT JOIN wok.reservation_request_item_modifiers m ON m.reservation_request_item_id = i.id
            WHERE e.reservation_id IN (%s)
            ORDER BY e.reservation_id, i.id, m.id
            """.formatted(placeholders), rs -> {
                UUID lineId = rs.getObject("line_id", UUID.class);
                PendingPreorderBuilder item = items.computeIfAbsent(lineId, ignored -> new PendingPreorderBuilder(
                        rsUuid(rs, "reservation_id"), rsUuid(rs, "menu_item_id"), rsString(rs, "name_snapshot"),
                        rsInt(rs, "quantity"), rsBigDecimal(rs, "unit_price"), rsString(rs, "currency")));
                if (rsString(rs, "group_name_snapshot") != null)
                    item.modifiers.add(new OperationalReservationScheduleController.PreorderModifier(
                            rsString(rs, "group_name_snapshot"), rsString(rs, "modifier_name_snapshot"),
                            rsBigDecimal(rs, "price_delta")));
            }, reservationIds.toArray());
        Map<UUID, List<OperationalReservationScheduleController.PreorderItem>> result = new java.util.LinkedHashMap<>();
        for (PendingPreorderBuilder item : items.values())
            result.computeIfAbsent(item.reservationId, ignored -> new java.util.ArrayList<>()).add(item.freeze());
        result.replaceAll((ignored, value) -> List.copyOf(value));
        return Map.copyOf(result);
    }

    private static UUID rsUuid(java.sql.ResultSet rs, String name) {
        try { return rs.getObject(name, UUID.class); } catch (java.sql.SQLException error) { throw new IllegalStateException(error); }
    }
    private static int rsInt(java.sql.ResultSet rs, String name) {
        try { return rs.getInt(name); } catch (java.sql.SQLException error) { throw new IllegalStateException(error); }
    }
    private static String rsString(java.sql.ResultSet rs, String name) {
        try { return rs.getString(name); } catch (java.sql.SQLException error) { throw new IllegalStateException(error); }
    }
    private static java.math.BigDecimal rsBigDecimal(java.sql.ResultSet rs, String name) {
        try { return rs.getBigDecimal(name); } catch (java.sql.SQLException error) { throw new IllegalStateException(error); }
    }

    @Transactional
    public DecisionResult decide(UUID reservationId, UUID actor, UUID requestId,
                                 UUID idempotencyKey,
                                 OperationalReservationController.Decision decision,
                                 String reason, int expectedVersion, List<UUID> requestedTableIds) {
        String operation = "RESERVATION_REVIEW_DECIDED";
        if (idempotencyKey != null) {
            IdempotencyStore.Result claim = idempotency.claim(actor.toString(), operation, idempotencyKey,
                    fingerprint(reservationId, decision, reason, expectedVersion, requestedTableIds));
            if (claim.replay()) {
                if (claim.responseSnapshot() == null)
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "La operación ya fue procesada, pero no tiene una respuesta recuperable.");
                try {
                    DecisionResult original = JSON.readValue(claim.responseSnapshot(), DecisionResult.class);
                    return new DecisionResult(original.reservationId(), original.decision(), original.status(),
                            original.rowVersion(), original.reason(), original.tableIds(), true);
                } catch (JsonProcessingException error) {
                    throw new IllegalStateException("Stored reservation decision response is invalid.", error);
                }
            }
        }
        List<CurrentReservation> rows = jdbc.query("""
            SELECT id, status, row_version, reservation_at, ends_at, party_size
            FROM wok.reservations WHERE id = ? FOR UPDATE
            """, (rs, row) -> new CurrentReservation(rs.getObject("id", UUID.class),
                rs.getString("status"), rs.getInt("row_version"), rs.getTimestamp("reservation_at").toInstant(),
                rs.getTimestamp("ends_at").toInstant(), rs.getInt("party_size")), reservationId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Solicitud no encontrada.");
        CurrentReservation current = rows.getFirst();
        if (!"REQUESTED".equals(current.status))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La solicitud ya fue revisada.");
        if (current.rowVersion != expectedVersion)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La solicitud cambió. Actualiza la vista y vuelve a intentarlo.");
        List<UUID> confirmedTableIds = List.of();
        if (decision == OperationalReservationController.Decision.CONFIRM) {
            validateCurrentSchedule(current);
            confirmedTableIds = tableAssignments.reserveForConfirmation(reservationId, actor, requestId,
                    expectedVersion, expectedVersion + 1, current.partySize(), current.reservationAt(), current.endsAt(),
                    requestedTableIds, reason);
        } else if (requestedTableIds != null && !requestedTableIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "No selecciones mesas cuando rechaces una solicitud.");
        }

        String nextStatus = decision == OperationalReservationController.Decision.CONFIRM ? "CONFIRMED" : "CANCELLED";
        String cancellationReason = decision == OperationalReservationController.Decision.REJECT ? "STAFF_REJECTED: " + reason : null;
        int updated = jdbc.update("""
            UPDATE wok.reservations
            SET status = ?, cancellation_reason = ?, cancelled_at = CASE WHEN ? = 'CANCELLED' THEN now() ELSE NULL END,
                updated_by = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND status = 'REQUESTED' AND row_version = ?
            """, nextStatus, cancellationReason, nextStatus, actor, reservationId, expectedVersion);
        if (updated != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "La solicitud cambió. Actualiza la vista y vuelve a intentarlo.");

        jdbc.update("""
            INSERT INTO wok.reservation_status_history
                (reservation_id, from_status, to_status, reason, actor_user_id, request_id)
            VALUES (?, 'REQUESTED', ?, ?, ?, ?)
            """, reservationId, nextStatus, reason, actor, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, 'RESERVATION_REVIEWED', 'RESERVATION', ?,
                    jsonb_build_object('status', 'REQUESTED', 'version', ?),
                    jsonb_build_object('status', ?, 'version', ?), ?, 'SUCCESS', ?)
            """, actor, reservationId, expectedVersion, nextStatus, expectedVersion + 1, reason, requestId);
        DecisionResult result = new DecisionResult(reservationId, decision, nextStatus, expectedVersion + 1,
                reason, confirmedTableIds, false);
        if (idempotencyKey != null) {
            try {
                idempotency.completeWithSnapshot(actor.toString(), operation, idempotencyKey, reservationId, 200,
                        JSON.writeValueAsString(result));
            } catch (JsonProcessingException error) {
                throw new IllegalStateException("Could not store reservation decision response.", error);
            }
        }
        return result;
    }

    private String fingerprint(UUID reservationId, OperationalReservationController.Decision decision,
                               String reason, int expectedVersion, List<UUID> requestedTableIds) {
        List<String> sortedTables = requestedTableIds == null ? List.of()
                : requestedTableIds.stream().map(UUID::toString).sorted().toList();
        try {
            String canonical = JSON.writeValueAsString(List.of(reservationId.toString(), decision.name(), reason,
                    expectedVersion, sortedTables));
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (JsonProcessingException | NoSuchAlgorithmException error) {
            throw new IllegalStateException("Could not fingerprint reservation decision.", error);
        }
    }

    private void validateCurrentSchedule(CurrentReservation reservation) {
        Instant now = Instant.now();
        if (!reservation.reservationAt().isAfter(now.plus(Duration.ofHours(3))))
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "La solicitud ya no cumple la anticipación mínima. Recházala y pide al cliente elegir otro horario.");
        var local = reservation.reservationAt().atZone(RESTAURANT_ZONE);
        LocalDate serviceDate = local.toLocalDate();
        int weekday = serviceDate.getDayOfWeek().getValue();
        for (String serviceType : List.of("DINE_IN", "RESTAURANT"))
            ServiceHoursPolicy.lockServiceDate(jdbc, serviceType, serviceDate);
        for (String serviceType : List.of("DINE_IN", "RESTAURANT"))
            ServiceHoursPolicy.lockWeeklySchedule(jdbc, serviceType, weekday);
        var window = operatingHours.forDate(serviceDate, true);
        if (window.isEmpty())
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "El restaurante no tiene horario activo para ese día. Rechaza la solicitud para que el cliente elija otro horario.");
        var configured = window.get();
        var requestedLocal = reservation.reservationAt().atZone(configured.zone()).toLocalTime();
        var lastEntry = configured.closesAt().isBefore(NORMAL_LAST_ENTRY) ? configured.closesAt() : NORMAL_LAST_ENTRY;
        if (requestedLocal.isBefore(configured.opensAt()) || !requestedLocal.isBefore(configured.closesAt())
                || requestedLocal.isAfter(lastEntry))
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "El horario solicitado ya no coincide con el horario de servicio vigente. Rechaza la solicitud para que el cliente elija otro horario.");
    }

    record CurrentReservation(UUID id, String status, int rowVersion, Instant reservationAt, Instant endsAt, int partySize) {}
    public record PendingReservation(UUID id, int guests, Instant reservationAt, Instant estimatedEndAt,
                                     String notes, int rowVersion, String customerName, String email,
                                     List<OperationalReservationScheduleController.PreorderItem> preorderItems) {}
    public record DecisionResult(UUID reservationId, OperationalReservationController.Decision decision,
                                 String status, int rowVersion, String reason, List<UUID> tableIds,
                                 boolean idempotentReplay) {}
    private record PendingReservationRow(UUID id, int guests, Instant reservationAt, Instant estimatedEndAt,
                                         String notes, int rowVersion, String customerName, String email) {}
    private static final class PendingPreorderBuilder {
        private final UUID reservationId;
        private final UUID menuItemId;
        private final String name;
        private final int quantity;
        private final java.math.BigDecimal unitPrice;
        private final String currency;
        private final List<OperationalReservationScheduleController.PreorderModifier> modifiers = new java.util.ArrayList<>();
        private PendingPreorderBuilder(UUID reservationId, UUID menuItemId, String name, int quantity,
                                       java.math.BigDecimal unitPrice, String currency) {
            this.reservationId = reservationId; this.menuItemId = menuItemId; this.name = name;
            this.quantity = quantity; this.unitPrice = unitPrice; this.currency = currency;
        }
        private OperationalReservationScheduleController.PreorderItem freeze() {
            return new OperationalReservationScheduleController.PreorderItem(menuItemId, name, quantity,
                    unitPrice, currency, List.copyOf(modifiers));
        }
    }
}
