package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Staff review of customer requests. Rejection is supported; acceptance must create a real order. */
@RestController
@RequestMapping("/api/v1/operational/order-requests")
@PreAuthorize("hasAnyRole('OPERATIONAL', 'ADMIN')")
public class OperationalOrderRequestController {
    private static final RowMapper<QueueItem> QUEUE_MAPPER = (rs, row) -> new QueueItem(
            rs.getObject("id", UUID.class), rs.getString("fulfillment_type"),
            rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
            rs.getString("currency_code"), rs.getString("customer_name"),
            rs.getTimestamp("created_at").toInstant());
    private static final RowMapper<RequestDetail> DETAIL_MAPPER = (rs, row) -> new RequestDetail(
            rs.getObject("id", UUID.class), rs.getString("fulfillment_type"), rs.getString("status"),
            rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
            rs.getString("currency_code"), rs.getString("customer_name"),
            firstNonBlank(rs.getString("contact_phone"), rs.getString("customer_phone")),
            rs.getString("delivery_address"), rs.getString("delivery_reference"),
            rs.getString("payment_preference"), rs.getString("customer_note"),
            rs.getTimestamp("created_at").toInstant(), List.of());
    private static final RowMapper<RequestLine> LINE_MAPPER = (rs, row) -> new RequestLine(
            rs.getObject("menu_item_id", UUID.class), rs.getString("name_snapshot"), rs.getInt("quantity"),
            rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"));

    private final JdbcTemplate jdbc;

    public OperationalOrderRequestController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<QueueItem> pending() {
        return jdbc.query("""
            SELECT r.id, r.fulfillment_type, r.requested_for, r.subtotal, c.code AS currency_code,
                   u.display_name AS customer_name, r.created_at
            FROM wok.order_requests r
            JOIN wok.users u ON u.id = r.customer_user_id
            JOIN wok.currencies c ON c.id = r.currency_id
            WHERE r.status = 'PENDING_REVIEW'
            ORDER BY r.created_at, r.id
            LIMIT 100
            """, QUEUE_MAPPER);
    }

    @GetMapping("/{requestId}")
    public RequestDetail detail(@PathVariable UUID requestId) {
        List<RequestDetail> found = jdbc.query("""
            SELECT r.id, r.fulfillment_type, r.status, r.requested_for, r.subtotal,
                   c.code AS currency_code, u.display_name AS customer_name, u.phone AS customer_phone,
                   r.contact_phone, r.delivery_address, r.delivery_reference, r.payment_preference,
                   r.customer_note, r.created_at
            FROM wok.order_requests r
            JOIN wok.users u ON u.id = r.customer_user_id
            JOIN wok.currencies c ON c.id = r.currency_id
            WHERE r.id = ? AND r.status = 'PENDING_REVIEW'
            """, DETAIL_MAPPER, requestId);
        if (found.isEmpty()) throw notFound();
        RequestDetail request = found.getFirst();
        List<RequestLine> items = jdbc.query("""
            SELECT menu_item_id, name_snapshot, quantity, unit_price, line_total
            FROM wok.order_request_items WHERE order_request_id = ? ORDER BY created_at, id
            """, LINE_MAPPER, requestId);
        return request.withItems(items);
    }

    @PostMapping("/{requestId}/reject")
    @Transactional
    public DecisionResult reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId,
            @Valid @RequestBody DecisionRequest input) {
        UUID actor = UUID.fromString(jwt.getSubject());
        String reason = input.reason().trim();
        if (reason.length() < 3 || reason.length() > 500)
            throw new AuthException(400, "Indica un motivo de al menos 3 caracteres.");
        List<DecisionState> states = jdbc.query("""
            SELECT status, decided_by, decision_reason, decided_at
            FROM wok.order_requests WHERE id = ? FOR UPDATE
            """, (rs, row) -> new DecisionState(rs.getString("status"), rs.getObject("decided_by", UUID.class),
                rs.getString("decision_reason"), rs.getTimestamp("decided_at") == null
                    ? null : rs.getTimestamp("decided_at").toInstant()), requestId);
        if (states.isEmpty()) throw notFound();
        DecisionState state = states.getFirst();
        if ("REJECTED".equals(state.status()) && actor.equals(state.actor()) && reason.equals(state.reason()))
            return new DecisionResult(requestId, "REJECTED", state.decidedAt(), actor, reason, true);
        if (!"PENDING_REVIEW".equals(state.status()))
            throw new AuthException(409, "La solicitud ya fue procesada y no puede rechazarse.");

        List<Instant> updated = jdbc.query("""
            UPDATE wok.order_requests
            SET status = 'REJECTED', decided_by = ?, decision_reason = ?, decided_at = now(), updated_at = now()
            WHERE id = ? AND status = 'PENDING_REVIEW'
            RETURNING decided_at
            """, (rs, row) -> rs.getTimestamp("decided_at").toInstant(), actor, reason, requestId);
        if (updated.isEmpty()) throw new AuthException(409, "La solicitud ya cambió de estado.");
        jdbc.update("""
            INSERT INTO wok.order_request_events(order_request_id, event_type, actor_user_id, reason)
            VALUES (?, 'REJECTED', ?, ?)
            """, requestId, actor, reason);
        return new DecisionResult(requestId, "REJECTED", updated.getFirst(), actor, reason, false);
    }

    private AuthException notFound() { return new AuthException(404, "No encontramos una solicitud pendiente."); }

    private static String firstNonBlank(String preferred, String fallback) {
        return preferred == null || preferred.isBlank() ? fallback : preferred;
    }

    public record QueueItem(UUID requestId, String fulfillmentType, Instant requestedFor, BigDecimal subtotal,
            String currency, String customerName, Instant createdAt) {}
    public record RequestDetail(UUID requestId, String fulfillmentType, String status, Instant requestedFor,
            BigDecimal subtotal, String currency, String customerName, String contactPhone,
            String deliveryAddress, String deliveryReference, String paymentPreference, String customerNote,
            Instant createdAt, List<RequestLine> items) {
        RequestDetail withItems(List<RequestLine> value) {
            return new RequestDetail(requestId, fulfillmentType, status, requestedFor, subtotal, currency,
                    customerName, contactPhone, deliveryAddress, deliveryReference, paymentPreference,
                    customerNote, createdAt, List.copyOf(value));
        }
    }
    public record RequestLine(UUID menuItemId, String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal) {}
    public record DecisionRequest(@NotBlank @Size(min = 3, max = 500) String reason) {}
    public record DecisionResult(UUID requestId, String status, Instant decidedAt, UUID actorUserId,
            String reason, boolean idempotentReplay) {}
    record DecisionState(String status, UUID actor, String reason, Instant decidedAt) {}
}
