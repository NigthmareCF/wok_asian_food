package com.wokasianfood.api.reservations;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.Instant;
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
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody DecisionRequest request) {
        return reviews.decide(reservationId, UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId,
                request.decision(), request.reason().trim(), request.expectedVersion());
    }

    public record DecisionRequest(@NotNull Decision decision, @NotBlank @Size(min = 3, max = 500) String reason,
                                  @Positive int expectedVersion) {}
}

@Service
class ReservationReviewService {
    private final JdbcTemplate jdbc;

    ReservationReviewService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<PendingReservation> pending() {
        return jdbc.query("""
            SELECT r.id, r.party_size, r.reservation_at, r.ends_at, r.notes, r.row_version,
                   cp.full_name, u.email
            FROM wok.reservations r
            JOIN wok.customer_profiles cp ON cp.id = r.customer_id
            LEFT JOIN wok.users u ON u.id = cp.user_id
            WHERE r.status = 'REQUESTED'
            ORDER BY r.reservation_at, r.id
            """, (rs, row) -> new PendingReservation(rs.getObject("id", UUID.class), rs.getInt("party_size"),
                rs.getTimestamp("reservation_at").toInstant(), rs.getTimestamp("ends_at").toInstant(),
                rs.getString("notes"), rs.getInt("row_version"), rs.getString("full_name"), rs.getString("email")));
    }

    @Transactional
    public DecisionResult decide(UUID reservationId, UUID actor, UUID requestId,
                                 OperationalReservationController.Decision decision,
                                 String reason, int expectedVersion) {
        List<CurrentReservation> rows = jdbc.query("""
            SELECT id, status, row_version
            FROM wok.reservations WHERE id = ? FOR UPDATE
            """, (rs, row) -> new CurrentReservation(rs.getObject("id", UUID.class),
                rs.getString("status"), rs.getInt("row_version")), reservationId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Solicitud no encontrada.");
        CurrentReservation current = rows.getFirst();
        if (!"REQUESTED".equals(current.status))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La solicitud ya fue revisada.");
        if (current.rowVersion != expectedVersion)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La solicitud cambió. Actualiza la vista y vuelve a intentarlo.");

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
        return new DecisionResult(reservationId, decision, nextStatus, expectedVersion + 1, reason);
    }

    record CurrentReservation(UUID id, String status, int rowVersion) {}
    public record PendingReservation(UUID id, int guests, Instant reservationAt, Instant estimatedEndAt,
                                     String notes, int rowVersion, String customerName, String email) {}
    public record DecisionResult(UUID reservationId, OperationalReservationController.Decision decision,
                                 String status, int rowVersion, String reason) {}
}
