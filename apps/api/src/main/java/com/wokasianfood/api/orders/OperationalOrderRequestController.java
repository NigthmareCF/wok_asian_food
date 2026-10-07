package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.catalog.ModifierSelectionService.SelectedModifier;
import com.wokasianfood.api.inventory.InventoryReservationService;
import com.wokasianfood.api.service.ServiceHoursPolicy;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/order-requests")
@PreAuthorize("hasAuthority('orders:manage')")
public class OperationalOrderRequestController {
    private final OrderRequestDecisionService decisions;

    public OperationalOrderRequestController(OrderRequestDecisionService decisions) { this.decisions = decisions; }

    @GetMapping
    public List<OrderRequestDecisionService.OrderRequestSummary> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fulfillmentType) {
        return decisions.list(status, fulfillmentType);
    }

    @GetMapping("/{requestId}")
    public OrderRequestDecisionService.OrderRequestDetails details(@PathVariable UUID requestId) {
        return decisions.details(requestId);
    }

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
    private final ModifierSelectionService modifiers;
    private final InventoryReservationService inventory;
    private final OrderCapacityHoldService capacityHolds;
    private final KitchenQueueEstimator kitchenQueue;
    private final ServiceHoursPolicy serviceHours;

    private static final org.springframework.jdbc.core.RowMapper<OrderRequestSummary> SUMMARY_MAPPER = (rs, row) ->
            new OrderRequestSummary(rs.getObject("request_id", UUID.class), rs.getString("fulfillment_type"),
                    rs.getString("status"), rs.getString("customer_name"), rs.getString("contact_phone"),
                    rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                    rs.getString("currency_code"), rs.getString("customer_note"),
                    rs.getString("delivery_address"), rs.getString("delivery_reference"),
                    rs.getString("payment_preference"), rs.getBoolean("invoice_requested"), rs.getTimestamp("submitted_at").toInstant(),
                    rs.getString("decision_reason"), rs.getObject("order_id", UUID.class));

    OrderRequestDecisionService(JdbcTemplate jdbc, OrderService orders, ModifierSelectionService modifiers,
                                InventoryReservationService inventory, OrderCapacityHoldService capacityHolds,
                                KitchenQueueEstimator kitchenQueue) {
        this.jdbc = jdbc;
        this.orders = orders;
        this.modifiers = modifiers;
        this.inventory = inventory;
        this.capacityHolds = capacityHolds;
        this.kitchenQueue = kitchenQueue;
        this.serviceHours = new ServiceHoursPolicy(jdbc);
    }

    List<OrderRequestSummary> list(String rawStatus, String rawFulfillmentType) {
        String status = normalizeFilter(rawStatus, List.of("PENDING_REVIEW", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"), "estado");
        String fulfillmentType = normalizeFilter(rawFulfillmentType, List.of("PICKUP", "DELIVERY"), "modalidad");
        return jdbc.query("""
                SELECT r.id AS request_id, r.fulfillment_type, r.status,
                       COALESCE(cp.full_name, u.display_name) AS customer_name,
                       CASE WHEN r.fulfillment_type = 'DELIVERY' THEN r.contact_phone ELSE COALESCE(cp.guest_phone, u.phone) END AS contact_phone,
                       r.requested_for, r.subtotal, c.code AS currency_code, r.customer_note,
                       r.delivery_address, r.delivery_reference, r.payment_preference, r.invoice_requested,
                       r.created_at AS submitted_at, r.decision_reason, r.order_id
                FROM wok.order_requests r
                JOIN wok.users u ON u.id = r.customer_user_id
                LEFT JOIN wok.customer_profiles cp ON cp.user_id = u.id
                JOIN wok.currencies c ON c.id = r.currency_id
                WHERE (CAST(? AS text) IS NULL OR r.status = CAST(? AS text))
                  AND (CAST(? AS text) IS NULL OR r.fulfillment_type = CAST(? AS text))
                ORDER BY CASE WHEN r.status = 'PENDING_REVIEW' THEN 0 ELSE 1 END,
                         r.created_at, r.id
                LIMIT 100
                """, SUMMARY_MAPPER, status, status, fulfillmentType, fulfillmentType);
    }

    OrderRequestDetails details(UUID requestId) {
        List<OrderRequestSummary> found = jdbc.query("""
                SELECT r.id AS request_id, r.fulfillment_type, r.status,
                       COALESCE(cp.full_name, u.display_name) AS customer_name,
                       CASE WHEN r.fulfillment_type = 'DELIVERY' THEN r.contact_phone ELSE COALESCE(cp.guest_phone, u.phone) END AS contact_phone,
                       r.requested_for, r.subtotal, c.code AS currency_code, r.customer_note,
                       r.delivery_address, r.delivery_reference, r.payment_preference, r.invoice_requested,
                       r.created_at AS submitted_at, r.decision_reason, r.order_id
                FROM wok.order_requests r
                JOIN wok.users u ON u.id = r.customer_user_id
                LEFT JOIN wok.customer_profiles cp ON cp.user_id = u.id
                JOIN wok.currencies c ON c.id = r.currency_id
                WHERE r.id = ?
                """, SUMMARY_MAPPER, requestId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos esa solicitud.");
        List<RequestLineRow> rows = jdbc.query("""
                SELECT id, name_snapshot, quantity, unit_price, line_total
                FROM wok.order_request_items WHERE order_request_id = ? ORDER BY created_at, id
                """, (rs, row) -> new RequestLineRow(rs.getString("name_snapshot"), rs.getInt("quantity"),
                        rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"), rs.getObject("id", UUID.class)), requestId);
        List<OrderRequestLine> items = rows.stream().map(line -> new OrderRequestLine(line.name(), line.quantity(),
                line.unitPrice(), line.lineTotal(), jdbc.query("""
                    SELECT group_name_snapshot, modifier_name_snapshot, price_delta
                    FROM wok.order_request_item_modifiers WHERE order_request_item_id = ?
                    ORDER BY group_name_snapshot, modifier_name_snapshot, modifier_id
                    """, (rs, row) -> new OrderRequestModifier(rs.getString("group_name_snapshot"),
                        rs.getString("modifier_name_snapshot"), rs.getBigDecimal("price_delta")), line.requestItemId()))).toList();
        return new OrderRequestDetails(found.getFirst(), items);
    }

    private String normalizeFilter(String raw, List<String> allowed, String label) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim().toUpperCase(java.util.Locale.ROOT);
        if (!allowed.contains(value)) throw new AuthException(400, "El filtro de " + label + " no es válido.");
        return value;
    }

    @Transactional
    DecisionResult decide(UUID actor, UUID correlationId, UUID orderRequestId,
                          OperationalOrderRequestController.DecisionRequest request) {
        OperationalOrderRequestController.Action action = request.action();
        List<Locked> rows = jdbc.query("""
            SELECT id, status, fulfillment_type, requested_for, currency_id, order_id, subtotal
            FROM wok.order_requests WHERE id = ? FOR UPDATE
            """, (rs, row) -> new Locked(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getString("fulfillment_type"), rs.getTimestamp("requested_for").toInstant(),
                rs.getObject("currency_id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getBigDecimal("subtotal")), orderRequestId);
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
            capacityHolds.finish(orderRequestId, OrderCapacityHoldService.EndState.RELEASED);
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

        if (!"PICKUP".equals(current.fulfillmentType()) && !"DELIVERY".equals(current.fulfillmentType()))
            throw new AuthException(422, "La modalidad de esta solicitud todavía no admite aceptación operativa.");

        requireServiceEnabled(current.fulfillmentType());
        serviceHours.requireSlot(current.fulfillmentType(), current.requestedFor(), true);
        Map<UUID, Long> preparationByStation = revalidate(current);
        KitchenQueueEstimator.Estimate estimate = kitchenQueue.estimate(preparationByStation, true,
                current.requestedFor(), orderRequestId);
        long etaSeconds = estimate.overallReadySeconds();
        if (etaSeconds > 86_400 || !current.requestedFor().isAfter(Instant.now().plusSeconds(etaSeconds)))
            throw new AuthException(409, "La carga de cocina cambió; la solicitud sigue pendiente para nueva revisión.");
        List<OperationalOrderController.OrderLineRequest> lines = requestedLines(orderRequestId);
        capacityHolds.finish(orderRequestId, OrderCapacityHoldService.EndState.CONVERTED);
        boolean delivery = "DELIVERY".equals(current.fulfillmentType());
        UUID orderId = delivery
                ? orders.createDeliveryOrder(actor, correlationId, "Delivery " + orderRequestId, lines,
                        current.requestedFor())
                : orders.createPickupOrder(actor, correlationId, "Pickup " + orderRequestId, lines,
                        current.requestedFor());
        applyAcceptedModifiers(actor, correlationId, orderRequestId, orderId);
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

    private void requireServiceEnabled(String fulfillmentType) {
        List<String> statuses = jdbc.query("""
            SELECT status FROM wok.service_capabilities
            WHERE code = ? AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
            ORDER BY effective_from DESC, id DESC LIMIT 1
            FOR SHARE
            """, (rs, row) -> rs.getString("status"), fulfillmentType);
        if (statuses.isEmpty() || "PAUSED".equals(statuses.getFirst()) || "DISABLED".equals(statuses.getFirst()))
            throw new AuthException(503, "El servicio está temporalmente indisponible; la solicitud sigue pendiente.");
    }

    private Map<UUID, Long> revalidate(Locked request) {
        List<Revalidated> items = jdbc.query("""
            SELECT ri.menu_item_id, ri.quantity, ri.unit_price, mi.price AS current_price, mi.currency_id,
                   mi.preparation_area_id, mi.estimated_preparation_seconds
            FROM wok.order_request_items ri
            JOIN wok.menu_items mi ON mi.id = ri.menu_item_id AND mi.status = 'ACTIVE'
            JOIN wok.items i ON i.id = mi.item_id AND i.active = true
            JOIN wok.menu_categories category ON category.id = mi.category_id AND category.active = true
            JOIN wok.preparation_areas area ON area.id = mi.preparation_area_id AND area.active = true
            WHERE ri.order_request_id = ?
            FOR SHARE OF mi, i, category
            """, (rs, row) -> new Revalidated(rs.getObject("menu_item_id", UUID.class), rs.getInt("quantity"),
                rs.getBigDecimal("unit_price"), rs.getBigDecimal("current_price"),
                rs.getObject("currency_id", UUID.class), rs.getObject("preparation_area_id", UUID.class),
                rs.getLong("estimated_preparation_seconds")), request.id());
        Integer expected = jdbc.queryForObject("""
            SELECT count(*) FROM wok.order_request_items WHERE order_request_id = ?
            """, Integer.class, request.id());
        if (expected == null || items.size() != expected)
            throw new AuthException(422, "Uno o más productos de la solicitud ya no están disponibles.");
        if (items.stream().anyMatch(item -> !item.currencyId().equals(request.currencyId())))
            throw new AuthException(422, "La moneda de la solicitud ya no coincide con el menú.");
        BigDecimal currentSubtotal = BigDecimal.ZERO;
        Map<UUID, Long> preparationByStation = new LinkedHashMap<>();
        for (Revalidated item : items) {
            List<UUID> selectedIds = jdbc.query("""
                SELECT selected.modifier_id FROM wok.order_request_item_modifiers selected
                JOIN wok.order_request_items request_item ON request_item.id = selected.order_request_item_id
                WHERE request_item.order_request_id = ? AND request_item.menu_item_id = ?
                ORDER BY selected.modifier_id
                """, (rs, row) -> rs.getObject(1, UUID.class), request.id(), item.menuItemId());
            List<SelectedModifier> selected;
            try { selected = modifiers.validate(item.menuItemId(), selectedIds); }
            catch (AuthException invalidSelection) {
                throw new AuthException(409, "Las opciones de un producto cambiaron. Contacta al cliente antes de aceptar.");
            }
            BigDecimal currentUnitPrice = selected.stream().map(SelectedModifier::priceDelta)
                    .reduce(item.currentPrice(), BigDecimal::add);
            if (currentUnitPrice.compareTo(item.requestedPrice()) != 0)
                throw new AuthException(409, "El precio de un producto o sus opciones cambió. Contacta al cliente antes de aceptar.");
            currentSubtotal = currentSubtotal.add(currentUnitPrice.multiply(BigDecimal.valueOf(item.quantity())));
            long seconds;
            try {
                seconds = Math.multiplyExact(item.preparationSeconds(), item.quantity());
                preparationByStation.merge(item.stationId(), seconds, Math::addExact);
            } catch (ArithmeticException overflow) {
                throw new AuthException(422, "La carga de preparación supera el límite operativo.");
            }
        }
        if (currentSubtotal.compareTo(request.subtotal()) != 0)
            throw new AuthException(409, "El precio cambió desde que se envió la solicitud. Contacta al cliente antes de aceptarla.");
        return preparationByStation;
    }

    private void applyAcceptedModifiers(UUID actor, UUID requestId, UUID orderRequestId, UUID orderId) {
        List<AcceptedLine> lines = jdbc.query("""
            SELECT request_item.id AS request_item_id, order_item.id AS order_item_id,
                   request_item.unit_price, request_item.quantity
            FROM wok.order_request_items request_item
            JOIN wok.order_items order_item ON order_item.order_id = ?
                AND order_item.menu_item_id = request_item.menu_item_id
            WHERE request_item.order_request_id = ?
            ORDER BY order_item.id
            """, (rs, row) -> new AcceptedLine(rs.getObject("request_item_id", UUID.class),
                rs.getObject("order_item_id", UUID.class), rs.getBigDecimal("unit_price"), rs.getInt("quantity")),
                orderId, orderRequestId);
        Integer expected = jdbc.queryForObject("""
            SELECT count(*) FROM wok.order_request_items WHERE order_request_id = ?
            """, Integer.class, orderRequestId);
        if (expected == null || lines.size() != expected)
            throw new AuthException(409, "No se pudieron vincular todas las opciones del pedido.");

        for (AcceptedLine line : lines) {
            List<String> names = jdbc.query("""
                SELECT group_name_snapshot || ': ' || modifier_name_snapshot
                FROM wok.order_request_item_modifiers WHERE order_request_item_id = ?
                ORDER BY group_name_snapshot, modifier_name_snapshot, modifier_id
                """, (rs, row) -> rs.getString(1), line.requestItemId());
            String notes = names.isEmpty() ? null : "Opciones: " + String.join(", ", names);
            jdbc.update("""
                UPDATE wok.order_items SET unit_price = ?, notes = CASE WHEN CAST(? AS text) IS NULL THEN notes
                    WHEN notes IS NULL OR btrim(notes) = '' THEN ? ELSE notes || E'\\n' || ? END,
                    updated_at = now(), row_version = row_version + 1
                WHERE id = ?
                """, line.unitPrice(), notes, notes, notes, line.orderItemId());
            jdbc.update("""
                INSERT INTO wok.order_item_modifiers
                    (order_item_id, modifier_id, group_name_snapshot, modifier_name_snapshot, price_delta)
                SELECT ?, modifier_id, group_name_snapshot, modifier_name_snapshot, price_delta
                FROM wok.order_request_item_modifiers WHERE order_request_item_id = ?
                """, line.orderItemId(), line.requestItemId());
        }
        inventory.reserveModifierImpacts(actor, requestId, orderId, orderRequestId);
        jdbc.update("""
            UPDATE wok.orders order_row
            SET subtotal = totals.subtotal, total = totals.subtotal - order_row.discount,
                updated_at = now(), updated_by = ?, row_version = row_version + 1
            FROM (SELECT COALESCE(sum(line_total), 0) AS subtotal
                  FROM wok.order_items WHERE order_id = ?) totals
            WHERE order_row.id = ?
            """, actor, orderId, orderId);
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

    private record Locked(UUID id, String status, String fulfillmentType, Instant requestedFor,
                          UUID currencyId, UUID orderId, BigDecimal subtotal) {}
    private record AcceptedLine(UUID requestItemId, UUID orderItemId, BigDecimal unitPrice, int quantity) {}
    private record Revalidated(UUID menuItemId, int quantity, BigDecimal requestedPrice, BigDecimal currentPrice,
                               UUID currencyId, UUID stationId, long preparationSeconds) {}

    public record DecisionResult(UUID requestId, String status, UUID orderId, boolean idempotentReplay) {}
    public record OrderRequestSummary(UUID requestId, String fulfillmentType, String status, String customerName,
            String contactPhone, Instant requestedFor, BigDecimal subtotal, String currency, String customerNote,
            String deliveryAddress, String deliveryReference, String paymentPreference, boolean invoiceRequested,
            Instant submittedAt, String decisionReason, UUID orderId) {}
    public record OrderRequestDetails(OrderRequestSummary request, List<OrderRequestLine> items) {}
    private record RequestLineRow(String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                                  UUID requestItemId) {}
    public record OrderRequestLine(String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                                   List<OrderRequestModifier> modifiers) {}
    public record OrderRequestModifier(String group, String name, BigDecimal priceDelta) {}
}
