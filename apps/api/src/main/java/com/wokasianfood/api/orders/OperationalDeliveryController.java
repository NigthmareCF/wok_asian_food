package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/v1/operational/deliveries")
@PreAuthorize("hasAuthority('orders:manage')")
public class OperationalDeliveryController {
    private final DeliveryDispatchService deliveries;

    OperationalDeliveryController(DeliveryDispatchService deliveries) {
        this.deliveries = deliveries;
    }

    @GetMapping
    public List<DeliveryDispatchService.DispatchView> list(@RequestParam(required = false) String status) {
        return deliveries.list(status);
    }

    @GetMapping("/eligible-couriers")
    public List<DeliveryDispatchService.CourierView> couriers() {
        return deliveries.couriers();
    }

    @PatchMapping("/{orderId}")
    public DeliveryDispatchService.DispatchView transition(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody DispatchActionRequest request) {
        return deliveries.transition(UUID.fromString(jwt.getSubject()),
                idempotencyKey, requestId == null ? UUID.randomUUID() : requestId, orderId, request);
    }

    public record DispatchActionRequest(@NotNull Action action, @Positive int expectedVersion,
            UUID assignedToUserId, @Size(max = 500) String reason) {}

    public enum Action { ASSIGN, DISPATCH, DELIVER, FAIL, RETRY }
}

@Service
class DeliveryDispatchService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    DeliveryDispatchService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    private static final String SELECT_VIEW = """
        SELECT d.id AS dispatch_id, d.order_id, o.code AS order_code, o.status AS order_status,
               r.id AS request_id, r.requested_for, r.delivery_address, r.delivery_reference,
               r.contact_phone, d.status, d.assigned_to_user_id, u.display_name AS assigned_to_name,
               d.assigned_at, d.dispatched_at, d.delivered_at, d.failure_reason, d.row_version,
               o.updated_at
        FROM wok.delivery_dispatches d
        JOIN wok.orders o ON o.id = d.order_id AND o.channel = 'DELIVERY'
        JOIN wok.order_requests r ON r.order_id = o.id AND r.fulfillment_type = 'DELIVERY'
        LEFT JOIN wok.users u ON u.id = d.assigned_to_user_id
        """;

    private static final org.springframework.jdbc.core.RowMapper<DispatchView> VIEW_MAPPER = (rs, row) ->
            new DispatchView(rs.getObject("dispatch_id", UUID.class), rs.getObject("order_id", UUID.class),
                    rs.getString("order_code"), rs.getString("order_status"), rs.getObject("request_id", UUID.class),
                    rs.getTimestamp("requested_for").toInstant(), rs.getString("delivery_address"),
                    rs.getString("delivery_reference"), rs.getString("contact_phone"), rs.getString("status"),
                    rs.getObject("assigned_to_user_id", UUID.class), rs.getString("assigned_to_name"),
                    instant(rs, "assigned_at"), instant(rs, "dispatched_at"), instant(rs, "delivered_at"),
                    rs.getString("failure_reason"), rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant());

    List<DispatchView> list(String rawStatus) {
        String status = normalizeStatus(rawStatus);
        return jdbc.query(SELECT_VIEW + """
            WHERE (CAST(? AS text) IS NULL OR d.status = CAST(? AS text))
            ORDER BY CASE WHEN d.status IN ('AWAITING_KITCHEN', 'READY_FOR_DISPATCH', 'ASSIGNED', 'OUT_FOR_DELIVERY')
                THEN 0 ELSE 1 END, r.requested_for, d.created_at, d.id
            LIMIT 200
            """, VIEW_MAPPER, status, status);
    }

    List<CourierView> couriers() {
        return jdbc.query("""
            SELECT DISTINCT u.id, u.display_name
            FROM wok.users u
            JOIN wok.user_roles ur ON ur.user_id = u.id
            JOIN wok.roles role ON role.id = ur.role_id
            WHERE u.status = 'ACTIVE' AND role.code IN ('OPERATIONAL', 'ADMIN')
            ORDER BY u.display_name, u.id
            LIMIT 200
            """, (rs, row) -> new CourierView(rs.getObject("id", UUID.class), rs.getString("display_name")));
    }

    @Transactional
    DispatchView transition(UUID actor, UUID idempotencyKey, UUID requestId, UUID orderId,
                            OperationalDeliveryController.DispatchActionRequest request) {
        String reason = clean(request.reason());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "DELIVERY_DISPATCH_TRANSITION",
                idempotencyKey, fingerprint(orderId, request, reason));
        if (claim.replay()) return view(claim.resourceId());

        List<DispatchRow> rows = jdbc.query("""
            SELECT d.id, d.status, d.assigned_to_user_id, d.row_version,
                   o.status AS order_status
            FROM wok.orders o
            JOIN wok.delivery_dispatches d ON d.order_id = o.id
            WHERE o.id = ? AND o.channel = 'DELIVERY'
            FOR UPDATE OF o, d
            """, (rs, row) -> new DispatchRow(rs.getObject("id", UUID.class),
                DispatchStatus.valueOf(rs.getString("status")), rs.getObject("assigned_to_user_id", UUID.class),
                rs.getInt("row_version"), OrderService.OrderStatus.valueOf(rs.getString("order_status"))), orderId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el despacho delivery.");
        DispatchRow current = rows.getFirst();
        if (request.expectedVersion() != current.rowVersion())
            throw new AuthException(409, "El despacho cambió. Actualiza la vista y vuelve a intentarlo.");

        UUID assignedTo = current.assignedTo();
        DispatchStatus next;
        String failureReason = null;
        switch (request.action()) {
            case ASSIGN -> {
                assignedTo = request.assignedToUserId();
                if (assignedTo == null) throw new AuthException(422, "Selecciona a la persona responsable del delivery.");
                if (current.status() != DispatchStatus.READY_FOR_DISPATCH && current.status() != DispatchStatus.ASSIGNED)
                    throw invalidTransition(current.status(), "ASSIGNED");
                requireEligibleCourier(assignedTo);
                next = DispatchStatus.ASSIGNED;
            }
            case DISPATCH -> {
                if (current.status() != DispatchStatus.ASSIGNED || assignedTo == null)
                    throw invalidTransition(current.status(), "OUT_FOR_DELIVERY");
                if (current.orderStatus() != OrderService.OrderStatus.READY)
                    throw new AuthException(409, "El pedido debe estar listo en cocina antes de salir a reparto.");
                next = DispatchStatus.OUT_FOR_DELIVERY;
            }
            case DELIVER -> {
                if (current.status() != DispatchStatus.OUT_FOR_DELIVERY)
                    throw invalidTransition(current.status(), "DELIVERED");
                if (current.orderStatus() != OrderService.OrderStatus.READY)
                    throw new AuthException(409, "El estado del pedido ya no permite confirmar la entrega.");
                int updatedOrder = jdbc.update("""
                    UPDATE wok.orders SET status = 'SERVED', updated_at = now(), updated_by = ?, row_version = row_version + 1
                    WHERE id = ? AND status = 'READY'
                    """, actor, orderId);
                if (updatedOrder != 1) throw new AuthException(409, "El pedido cambió. Actualiza el despacho.");
                jdbc.update("""
                    INSERT INTO wok.order_status_history (order_id, from_status, to_status, reason, actor_user_id, request_id)
                    VALUES (?, 'READY', 'SERVED', 'DELIVERY_COMPLETED', ?, ?)
                    """, orderId, actor, requestId);
                next = DispatchStatus.DELIVERED;
            }
            case FAIL -> {
                if (current.status() != DispatchStatus.OUT_FOR_DELIVERY)
                    throw invalidTransition(current.status(), "DELIVERY_FAILED");
                if (reason == null) throw new AuthException(422, "Indica el motivo por el que no se completó la entrega.");
                next = DispatchStatus.DELIVERY_FAILED;
                failureReason = reason;
            }
            case RETRY -> {
                if (current.status() != DispatchStatus.DELIVERY_FAILED)
                    throw invalidTransition(current.status(), "READY_FOR_DISPATCH");
                if (reason == null) throw new AuthException(422, "Indica por qué se devuelve el pedido a despacho.");
                next = DispatchStatus.READY_FOR_DISPATCH;
                assignedTo = null;
            }
            default -> throw new AuthException(400, "La acción de despacho no es válida.");
        }

        int changed = jdbc.update("""
            UPDATE wok.delivery_dispatches
            SET status = ?, assigned_to_user_id = ?,
                assigned_at = CASE WHEN ? = 'ASSIGNED' THEN now() WHEN ? = 'READY_FOR_DISPATCH' THEN NULL ELSE assigned_at END,
                dispatched_at = CASE WHEN ? = 'OUT_FOR_DELIVERY' THEN now() WHEN ? = 'READY_FOR_DISPATCH' THEN NULL ELSE dispatched_at END,
                delivered_at = CASE WHEN ? = 'DELIVERED' THEN now() ELSE delivered_at END,
                failure_reason = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND row_version = ?
            """, next.name(), assignedTo,
                next.name(), next.name(), next.name(), next.name(), next.name(), failureReason,
                current.id(), request.expectedVersion());
        if (changed != 1) throw new AuthException(409, "El despacho cambió. Actualiza la vista y vuelve a intentarlo.");

        jdbc.update("""
            INSERT INTO wok.delivery_dispatch_events
                (dispatch_id, from_status, to_status, actor_user_id, assigned_to_user_id, reason, request_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, current.id(), current.status().name(), next.name(), actor, assignedTo,
                reason == null ? defaultReason(request.action()) : reason, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, 'DELIVERY_DISPATCH_TRANSITIONED', 'DELIVERY_DISPATCH', ?,
                    jsonb_build_object('status', ?, 'rowVersion', ?),
                    jsonb_build_object('status', ?, 'rowVersion', ?), ?, 'SUCCESS', ?)
            """, actor, current.id(), current.status().name(), current.rowVersion(), next.name(),
                current.rowVersion() + 1, reason, requestId);
        idempotency.complete(actor.toString(), "DELIVERY_DISPATCH_TRANSITION", idempotencyKey, orderId);
        return view(orderId);
    }

    private String fingerprint(UUID orderId,
            OperationalDeliveryController.DispatchActionRequest request, String reason) {
        String canonical = "delivery-dispatch-v1\n" + orderId + "\n" + request.action().name() + "\n"
                + request.expectedVersion() + "\n" + request.assignedToUserId() + "\n" + (reason == null ? "" : reason);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is not available", impossible);
        }
    }

    private void requireEligibleCourier(UUID userId) {
        Integer count = jdbc.queryForObject("""
            SELECT count(*) FROM wok.users u
            JOIN wok.user_roles ur ON ur.user_id = u.id
            JOIN wok.roles role ON role.id = ur.role_id
            WHERE u.id = ? AND u.status = 'ACTIVE' AND role.code IN ('OPERATIONAL', 'ADMIN')
            """, Integer.class, userId);
        if (count == null || count == 0)
            throw new AuthException(422, "La persona seleccionada no tiene una cuenta operativa activa.");
    }

    private DispatchView view(UUID orderId) {
        return jdbc.query(SELECT_VIEW + " WHERE o.id = ?", VIEW_MAPPER, orderId).stream().findFirst()
                .orElseThrow(() -> new AuthException(404, "No encontramos el despacho delivery."));
    }

    private String normalizeStatus(String value) {
        if (value == null || value.isBlank()) return null;
        String status = value.trim().toUpperCase(Locale.ROOT);
        try { DispatchStatus.valueOf(status); }
        catch (IllegalArgumentException invalid) { throw new AuthException(400, "El filtro de estado delivery no es válido."); }
        return status;
    }

    private AuthException invalidTransition(DispatchStatus current, String target) {
        return new AuthException(409, "El despacho no puede pasar de " + current + " a " + target + ".");
    }

    private String defaultReason(OperationalDeliveryController.Action action) {
        return switch (action) {
            case ASSIGN -> "COURIER_ASSIGNED";
            case DISPATCH -> "LEFT_RESTAURANT";
            case DELIVER -> "DELIVERY_COMPLETED";
            case FAIL -> "DELIVERY_FAILED";
            case RETRY -> "RETURNED_TO_DISPATCH_QUEUE";
        };
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private static Instant instant(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    enum DispatchStatus { AWAITING_KITCHEN, READY_FOR_DISPATCH, ASSIGNED, OUT_FOR_DELIVERY, DELIVERY_FAILED, DELIVERED, CANCELLED }

    private record DispatchRow(UUID id, DispatchStatus status, UUID assignedTo, int rowVersion,
                               OrderService.OrderStatus orderStatus) {}

    public record CourierView(UUID userId, String displayName) {}
    public record DispatchView(UUID dispatchId, UUID orderId, String orderCode, String orderStatus, UUID requestId,
            Instant requestedFor, String address, String reference, String contactPhone, String status,
            UUID assignedToUserId, String assignedToName, Instant assignedAt, Instant dispatchedAt,
            Instant deliveredAt, String failureReason, int rowVersion, Instant updatedAt) {}
}
