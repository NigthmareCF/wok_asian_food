package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/order-requests")
@PreAuthorize("hasAuthority('orders:manage')")
public class OperationalOrderRequestController {
    private final OrderRequestDecisionService decisions;

    public OperationalOrderRequestController(OrderRequestDecisionService decisions) { this.decisions = decisions; }

    @PostMapping("/{requestId}/decision")
    public OrderRequestDecisionService.DecisionResult decide(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID requestId,
            @RequestHeader(value = "X-Request-Id", required = false) UUID correlationId,
            @Valid @RequestBody DecisionRequest request) {
        return decisions.decide(UUID.fromString(jwt.getSubject()),
                correlationId == null ? UUID.randomUUID() : correlationId, requestId, request);
    }

    public record DecisionRequest(@NotNull Action action, @Size(max = 500) String reason) {}

    public enum Action { ACCEPT, REJECT }
}

@Service
class OrderRequestDecisionService {
    private final JdbcTemplate jdbc;
    private final OrderService orders;

    OrderRequestDecisionService(JdbcTemplate jdbc, OrderService orders) {
        this.jdbc = jdbc;
        this.orders = orders;
    }

    @Transactional
    DecisionResult decide(UUID actor, UUID correlationId, UUID orderRequestId,
                          OperationalOrderRequestController.DecisionRequest request) {
        OperationalOrderRequestController.Action action = request.action();
        List<Locked> rows = jdbc.query("""
            SELECT id, status, requested_for, currency_id, order_id
            FROM wok.order_requests WHERE id = ? FOR UPDATE
            """, (rs, row) -> new Locked(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getTimestamp("requested_for").toInstant(), rs.getObject("currency_id", UUID.class),
                rs.getObject("order_id", UUID.class)), orderRequestId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos esa solicitud.");
        Locked current = rows.getFirst();

        if (action == OperationalOrderRequestController.Action.ACCEPT && "ACCEPTED".equals(current.status()))
            return new DecisionResult(current.id(), current.status(), current.orderId(), true);
        if (action == OperationalOrderRequestController.Action.REJECT && "REJECTED".equals(current.status()))
            return new DecisionResult(current.id(), current.status(), current.orderId(), true);
        if (!"PENDING_REVIEW".equals(current.status()))
            throw new AuthException(409, "La solicitud ya fue atendida o cancelada.");

        if (action == OperationalOrderRequestController.Action.REJECT) {
            String reason = request.reason() == null || request.reason().isBlank() ? null : request.reason().trim();
            if (reason == null) throw new AuthException(422, "Indica el motivo del rechazo.");
            jdbc.update("""
                UPDATE wok.order_requests
                SET status = 'REJECTED', decided_by = ?, decided_at = now(), decision_reason = ?, updated_at = now()
                WHERE id = ? AND status = 'PENDING_REVIEW'
                """, actor, reason, orderRequestId);
            jdbc.update("""
                INSERT INTO wok.order_request_events(order_request_id, event_type, actor_user_id, reason)
                VALUES (?, 'REJECTED', ?, ?)
                """, orderRequestId, actor, reason);
            audit(actor, correlationId, orderRequestId, "ORDER_REQUEST_REJECTED", "REJECTED", reason);
            return new DecisionResult(orderRequestId, "REJECTED", null, false);
        }

        revalidate(current);
        List<OperationalOrderController.OrderLineRequest> lines = requestedLines(orderRequestId);
        UUID orderId = orders.createPickupOrder(actor, correlationId, "Pickup " + orderRequestId, lines);
        jdbc.update("""
            UPDATE wok.order_requests
            SET status = 'ACCEPTED', decided_by = ?, decided_at = now(), decision_reason = 'ACCEPTED',
                order_id = ?, updated_at = now()
            WHERE id = ? AND status = 'PENDING_REVIEW'
            """, actor, orderId, orderRequestId);
        jdbc.update("""
            INSERT INTO wok.order_request_events(order_request_id, event_type, actor_user_id, reason)
            VALUES (?, 'ACCEPTED', ?, 'ORDER_CREATED')
            """, orderRequestId, actor);
        audit(actor, correlationId, orderRequestId, "ORDER_REQUEST_ACCEPTED", "ACCEPTED", null);
        return new DecisionResult(orderRequestId, "ACCEPTED", orderId, false);
    }

    private void revalidate(Locked request) {
        List<Revalidated> items = jdbc.query("""
            SELECT ri.menu_item_id, ri.quantity, mi.estimated_preparation_seconds, mi.currency_id
            FROM wok.order_request_items ri
            JOIN wok.menu_items mi ON mi.id = ri.menu_item_id AND mi.status = 'ACTIVE'
            JOIN wok.items i ON i.id = mi.item_id AND i.active = true
            JOIN wok.menu_categories category ON category.id = mi.category_id AND category.active = true
            JOIN wok.preparation_areas area ON area.id = mi.preparation_area_id AND area.active = true
            WHERE ri.order_request_id = ?
            """, (rs, row) -> new Revalidated(rs.getObject("menu_item_id", UUID.class), rs.getInt("quantity"),
                rs.getInt("estimated_preparation_seconds"), rs.getObject("currency_id", UUID.class)), request.id());
        Integer expected = jdbc.queryForObject("""
            SELECT count(*) FROM wok.order_request_items WHERE order_request_id = ?
            """, Integer.class, request.id());
        if (expected == null || items.size() != expected)
            throw new AuthException(422, "Uno o más productos de la solicitud ya no están disponibles.");
        if (items.stream().anyMatch(item -> !item.currencyId().equals(request.currencyId())))
            throw new AuthException(422, "La moneda de la solicitud ya no coincide con el menú.");
        long prepSeconds = items.stream()
                .mapToLong(item -> (long) item.preparationSeconds() * item.quantity())
                .sum();
        if (prepSeconds > 86_400 || !request.requestedFor().isAfter(Instant.now().plusSeconds(prepSeconds)))
            throw new AuthException(422, "El horario solicitado ya no alcanza para preparar la solicitud.");
    }

    private List<OperationalOrderController.OrderLineRequest> requestedLines(UUID orderRequestId) {
        return jdbc.query("""
            SELECT menu_item_id, quantity FROM wok.order_request_items
            WHERE order_request_id = ? ORDER BY menu_item_id
            """, (rs, row) -> new OperationalOrderController.OrderLineRequest(
                rs.getObject("menu_item_id", UUID.class), rs.getInt("quantity"), "TAKEAWAY", null), orderRequestId);
    }

    private void audit(UUID actor, UUID correlationId, UUID entityId, String action, String status, String reason) {
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, reason, result, request_id)
            VALUES (?, ?, 'ORDER_REQUEST', ?, jsonb_build_object('status', ?), ?, 'SUCCESS', ?)
            """, actor, action, entityId, status, reason, correlationId);
    }

    private record Locked(UUID id, String status, Instant requestedFor, UUID currencyId, UUID orderId) {}
    private record Revalidated(UUID menuItemId, int quantity, int preparationSeconds, UUID currencyId) {}

    public record DecisionResult(UUID requestId, String status, UUID orderId, boolean idempotentReplay) {}
}
