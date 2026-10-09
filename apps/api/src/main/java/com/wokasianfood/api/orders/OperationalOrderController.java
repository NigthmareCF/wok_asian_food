package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.catalog.ModifierSelectionService.SelectedModifier;
import com.wokasianfood.api.platform.RequestLimits;
import com.wokasianfood.api.inventory.InventoryReservationService;
import com.wokasianfood.api.inventory.InventoryReservationService.ModifierResourceContribution;
import com.wokasianfood.api.platform.IdempotencyStore;
import com.wokasianfood.api.service.ServiceHoursPolicy;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/orders")
@PreAuthorize("hasAuthority('orders:manage')")
public class OperationalOrderController {
    private final OrderService orders;

    public OperationalOrderController(OrderService orders) { this.orders = orders; }

    @GetMapping
    public List<OrderService.OrderSummary> list(@RequestParam(required = false) String status,
                                                @RequestParam(required = false) UUID tableId) {
        return orders.list(normalize(status), tableId);
    }

    @GetMapping("/{orderId}")
    public OrderService.OrderDetails details(@PathVariable UUID orderId) {
        return orders.details(orderId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderService.OrderReceipt open(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody OpenOrderRequest request) {
        return orders.open(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, idempotencyKey, request);
    }

    @PatchMapping("/{orderId}/status")
    public OrderService.OrderSummary changeStatus(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody StatusRequest request) {
        return orders.changeStatus(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, orderId, request);
    }

    @PostMapping("/{orderId}/items")
    public OrderService.OrderDetails addItems(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody AddItemsRequest request) {
        return orders.addItems(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, orderId, idempotencyKey, request);
    }

    @PostMapping("/{orderId}/items/{orderItemId}/cancellations")
    public OrderService.OrderDetails cancelItem(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId, @PathVariable UUID orderItemId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody CancelOrderItemRequest request) {
        return orders.cancelItem(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, orderId, orderItemId, idempotencyKey, request);
    }

    public record AddItemsRequest(@NotEmpty @Size(max = RequestLimits.MAX_DISTINCT_MENU_LINES) List<@Valid OrderLineRequest> items) {}

    public record OpenOrderRequest(@NotNull UUID accountId,
                                   @Size(min = 2, max = 20) String channel,
                                   @Positive int guestCount,
                                   @Size(max = 500) String notes,
                                   @NotEmpty @Size(max = RequestLimits.MAX_DISTINCT_MENU_LINES) List<@Valid OrderLineRequest> items) {}

    public record OrderLineRequest(@NotNull UUID menuItemId, @Positive int quantity,
                                   @Size(min = 2, max = 20) String fulfillment,
                                   @Size(max = 300) String notes,
                                   @Size(max = 30) List<@NotNull UUID> modifierIds) {
        public OrderLineRequest(UUID menuItemId, int quantity, String fulfillment, String notes) {
            this(menuItemId, quantity, fulfillment, notes, List.of());
        }

        public OrderLineRequest {
            modifierIds = modifierIds == null ? List.of()
                    : Collections.unmodifiableList(new ArrayList<>(modifierIds));
        }
    }

    public record StatusRequest(@NotNull OrderService.OrderStatus status, @Positive int expectedVersion,
                                @Size(max = 300) String reason) {}

    public record CancelOrderItemRequest(@Positive int expectedOrderVersion, @Positive int expectedItemVersion,
                                         @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record ModifyOrderItemQuantityRequest(@Positive int expectedOrderVersion, @Positive int expectedItemVersion,
            @Positive int quantity, @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record ModifyOrderItemModifiersRequest(@Positive int expectedOrderVersion,
            @Positive int expectedItemVersion, @NotNull List<SelectedModifier> modifiers,
            @NotNull List<ModifierResourceContribution> resourceContributions,
            @NotBlank @Size(min = 3, max = 500) String reason) {}

    private String normalize(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim().toUpperCase();
    }
}

@Service
class OrderService {
    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private static final DateTimeFormatter CODE_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final Map<OrderStatus, List<OrderStatus>> TRANSITIONS = Map.of(
            OrderStatus.SENT, List.of(OrderStatus.PREPARING, OrderStatus.CANCELLED),
            OrderStatus.PREPARING, List.of(OrderStatus.READY, OrderStatus.CANCELLED),
            OrderStatus.READY, List.of(OrderStatus.SERVED, OrderStatus.CANCELLED),
            OrderStatus.SERVED, List.of(OrderStatus.CLOSED),
            OrderStatus.CLOSED, List.of(),
            OrderStatus.CANCELLED, List.of());
    private static final RowMapper<Product> PRODUCT_MAPPER = (rs, row) -> new Product(
            rs.getObject("id", UUID.class), rs.getString("name"), rs.getBigDecimal("price"),
            rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
            rs.getObject("preparation_area_id", UUID.class), rs.getString("preparation_area_code"),
            rs.getInt("estimated_preparation_seconds"));

    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;
    private final InventoryReservationService reservations;
    private final ModifierSelectionService modifiers;
    private final KitchenQueueEstimator kitchenQueue;
    private final ServiceHoursPolicy serviceHours;

    @Autowired
    OrderService(JdbcTemplate jdbc, IdempotencyStore idempotency, InventoryReservationService reservations,
                 ModifierSelectionService modifiers) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
        this.reservations = reservations;
        this.modifiers = modifiers;
        this.kitchenQueue = new KitchenQueueEstimator(jdbc);
        this.serviceHours = new ServiceHoursPolicy(jdbc);
    }

    OrderService(JdbcTemplate jdbc, IdempotencyStore idempotency, InventoryReservationService reservations) {
        this(jdbc, idempotency, reservations, new ModifierSelectionService(jdbc));
    }

    public enum OrderStatus { SENT, PREPARING, READY, SERVED, CLOSED, CANCELLED }

    List<OrderSummary> list(String status, UUID tableId) {
        return jdbc.query("""
            SELECT o.id, o.code, o.status, o.channel, o.subtotal, o.discount, o.total, o.guest_count, o.opened_at,
                   o.closed_at, o.row_version, o.currency_id, c.code AS currency_code,
                   t.id AS dining_table_id, t.name AS dining_table_name,
                   a.id AS account_id, a.name AS account_name,
                   COALESCE(item_stats.item_count, 0) AS item_count
            FROM wok.orders o
            JOIN wok.currencies c ON c.id = o.currency_id
            JOIN wok.order_accounts a ON a.id = o.account_id
            LEFT JOIN wok.dining_tables t ON t.id = o.dining_table_id
            LEFT JOIN LATERAL (
                SELECT count(*) AS item_count FROM wok.order_items i WHERE i.order_id = o.id AND i.status = 'ACTIVE'
            ) item_stats ON true
            WHERE (CAST(? AS text) IS NULL OR o.status = CAST(? AS text))
              AND (CAST(? AS uuid) IS NULL OR o.dining_table_id = CAST(? AS uuid))
            ORDER BY o.opened_at DESC, o.id DESC
            LIMIT 200
            """, (rs, row) -> new OrderSummary(
                rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("status"), rs.getString("channel"),
                rs.getBigDecimal("subtotal"), rs.getBigDecimal("discount"), rs.getBigDecimal("total"),
                rs.getInt("guest_count"), rs.getTimestamp("opened_at").toInstant(),
                rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
                rs.getInt("row_version"), rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
                rs.getObject("dining_table_id", UUID.class), rs.getString("dining_table_name"),
                rs.getObject("account_id", UUID.class), rs.getString("account_name"), rs.getInt("item_count")),
            status, status, tableId, tableId);
    }

    public OrderDetails details(UUID orderId) {
        List<OrderSummary> found = jdbc.query("""
            SELECT o.id, o.code, o.status, o.channel, o.subtotal, o.discount, o.total, o.guest_count, o.opened_at,
                   o.closed_at, o.row_version, o.currency_id, c.code AS currency_code,
                   t.id AS dining_table_id, t.name AS dining_table_name,
                   a.id AS account_id, a.name AS account_name,
                   (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id AND i.status = 'ACTIVE') AS item_count
            FROM wok.orders o
            JOIN wok.currencies c ON c.id = o.currency_id
            JOIN wok.order_accounts a ON a.id = o.account_id
            LEFT JOIN wok.dining_tables t ON t.id = o.dining_table_id
            WHERE o.id = ?
            """, summaryMapper(), orderId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos el pedido.");
        OrderSummary summary = found.getFirst();
        List<OrderLine> itemRows = jdbc.query("""
            SELECT i.id, i.name_snapshot, i.quantity, i.unit_price, i.line_total, i.fulfillment, i.notes,
                   i.preparation_area_id, pa.code AS preparation_area_code, i.status, i.row_version
            FROM wok.order_items i
            JOIN wok.preparation_areas pa ON pa.id = i.preparation_area_id
            WHERE i.order_id = ? ORDER BY pa.code, i.created_at, i.id
            """, (rs, row) -> new OrderLine(rs.getObject("id", UUID.class), rs.getString("name_snapshot"),
                rs.getInt("quantity"), rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"),
                rs.getString("fulfillment"), rs.getString("notes"), rs.getObject("preparation_area_id", UUID.class),
                rs.getString("preparation_area_code"), rs.getString("status"), rs.getInt("row_version"), List.of()), orderId);
        Map<UUID, List<OrderModifier>> modifiersByItem = new LinkedHashMap<>();
        jdbc.query("""
            SELECT selected.order_item_id, selected.group_name_snapshot, selected.modifier_name_snapshot,
                   selected.price_delta
            FROM wok.order_item_modifiers selected
            JOIN wok.order_items item ON item.id = selected.order_item_id
            WHERE item.order_id = ?
            ORDER BY item.id, selected.group_name_snapshot, selected.modifier_name_snapshot, selected.modifier_id
            """, (rs, row) -> new OrderModifierRow(rs.getObject("order_item_id", UUID.class),
                new OrderModifier(rs.getString("group_name_snapshot"), rs.getString("modifier_name_snapshot"),
                        rs.getBigDecimal("price_delta"))), orderId)
                .forEach(row -> modifiersByItem.computeIfAbsent(row.orderItemId(), ignored -> new ArrayList<>())
                        .add(row.modifier()));
        List<OrderLine> items = itemRows.stream().map(item -> new OrderLine(item.id(), item.name(), item.quantity(),
                item.unitPrice(), item.lineTotal(), item.fulfillment(), item.notes(), item.preparationAreaId(),
                item.stationCode(), item.status(), item.version(), modifiersByItem.getOrDefault(item.id(), List.of()))).toList();
        List<KitchenTicket> tickets = jdbc.query("""
            SELECT t.id, t.sequence_no, t.status, t.claimed_by, t.ready_at, t.estimated_ready_at, t.row_version,
                   t.station_id, pa.code AS station_code
            FROM wok.kitchen_tickets t
            JOIN wok.preparation_areas pa ON pa.id = t.station_id
            WHERE t.order_id = ? ORDER BY t.sequence_no
            """, (rs, row) -> new KitchenTicket(rs.getObject("id", UUID.class), rs.getInt("sequence_no"),
                rs.getString("status"), rs.getObject("claimed_by", UUID.class),
                rs.getTimestamp("ready_at") == null ? null : rs.getTimestamp("ready_at").toInstant(),
                rs.getTimestamp("estimated_ready_at") == null ? null : rs.getTimestamp("estimated_ready_at").toInstant(),
                rs.getInt("row_version"), rs.getObject("station_id", UUID.class), rs.getString("station_code")),
            orderId);
        return new OrderDetails(summary, items, tickets);
    }

    @Transactional
    public OrderReceipt open(UUID actor, UUID requestId, UUID idempotencyKey,
                             OperationalOrderController.OpenOrderRequest request) {
        Channel channel = request.channel() == null ? Channel.DINE_IN : Channel.valueOf(request.channel().trim().toUpperCase());
        String notes = request.notes() == null || request.notes().isBlank() ? null : request.notes().trim();
        List<OperationalOrderController.OrderLineRequest> lines = normalizedLines(request.items());
        String fingerprint = fingerprint(channel, notes, request.guestCount(), lines);

        OrderDetails previous = existing(actor, idempotencyKey, fingerprint);
        if (previous != null) return receipt(previous, true);

        Account account = lockAccount(request.accountId());
        if (account.status() != null && !"OPEN".equals(account.status()))
            throw new AuthException(409, "La cuenta ya no admite pedidos nuevos.");
        if (channel == Channel.DINE_IN && account.diningTableId() == null)
            throw new AuthException(422, "El canal en salón requiere una cuenta con mesa.");

        List<Product> products = loadProducts(lines);
        if (products.size() != lines.size())
            throw new AuthException(422, "Uno o más productos ya no están disponibles.");
        UUID currencyId = products.getFirst().currencyId();
        if (products.stream().anyMatch(product -> !product.currencyId().equals(currencyId)))
            throw new AuthException(422, "No se pueden mezclar monedas en un pedido.");

        UUID orderId = UUID.randomUUID();
        int inserted = jdbc.update("""
            INSERT INTO wok.orders
                (id, code, account_id, dining_table_id, channel, status, currency_id, guest_count, notes,
                 idempotency_key, request_fingerprint, opened_by, updated_by)
            VALUES (?, ?, ?, ?, ?, 'SENT', ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (opened_by, idempotency_key) DO NOTHING
            """, orderId, nextCode(), request.accountId(), account.diningTableId(), channel.name(), currencyId,
                request.guestCount(), notes, idempotencyKey, fingerprint, actor, actor);

        if (inserted == 0) {
            OrderDetails replay = existing(actor, idempotencyKey, fingerprint);
            if (replay != null) return receipt(replay, true);
        }

        List<NewLine> newLines = new ArrayList<>();
        for (int index = 0; index < products.size(); index++) {
            newLines.add(insertLine(orderId, products.get(index), lines.get(index)));
        }

        reserveStock(actor, requestId, orderId, newLines);
        reserveModifierStock(actor, requestId, orderId, newLines);
        recalcTotals(orderId, actor);
        enqueueTickets(actor, requestId, orderId, newLines, null, null);
        jdbc.update("""
            INSERT INTO wok.order_status_history (order_id, from_status, to_status, actor_user_id, request_id)
            VALUES (?, NULL, 'SENT', ?, ?)
            """, orderId, actor, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'ORDER_OPENED', 'ORDER', ?,
                    jsonb_build_object('status', 'SENT', 'channel', ?, 'items', ?), 'SUCCESS', ?)
            """, actor, orderId, channel.name(), lines.size(), requestId);
        return receipt(details(orderId), false);
    }

    @Transactional
    public OrderDetails addItems(UUID actor, UUID requestId, UUID orderId, UUID idempotencyKey,
                                 OperationalOrderController.AddItemsRequest request) {
        List<OperationalOrderController.OrderLineRequest> lines = normalizedLines(request.items());
        String fingerprint = itemsFingerprint(orderId, lines);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "ORDER_ITEMS_ADDED",
                idempotencyKey, fingerprint);
        if (claim.replay()) return details(claim.resourceId());

        OrderRow order = lockOrder(orderId);
        if (order.status() == OrderStatus.SERVED || order.status() == OrderStatus.CLOSED
                || order.status() == OrderStatus.CANCELLED)
            throw new AuthException(409, "El pedido ya no admite nuevos productos.");
        Account account = lockAccount(order.accountId());
        if (!"OPEN".equals(account.status()))
            throw new AuthException(409, "La cuenta ya no admite productos nuevos.");

        List<Product> products = loadProducts(lines);
        if (products.size() != lines.size())
            throw new AuthException(422, "Uno o más productos ya no están disponibles.");
        if (products.stream().anyMatch(product -> !product.currencyId().equals(order.currencyId())))
            throw new AuthException(422, "No se pueden mezclar monedas en un pedido.");

        List<NewLine> newLines = new ArrayList<>();
        for (int index = 0; index < products.size(); index++) {
            newLines.add(insertLine(orderId, products.get(index), lines.get(index)));
        }
        reserveStock(actor, requestId, orderId, newLines);
        reserveModifierStock(actor, requestId, orderId, newLines);
        recalcTotals(orderId, actor);
        enqueueTickets(actor, requestId, orderId, newLines, null, null);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'ORDER_ITEMS_ADDED', 'ORDER', ?,
                    jsonb_build_object('lines', ?, 'quantity', ?), 'SUCCESS', ?)
            """, actor, orderId, lines.size(),
                newLines.stream().mapToInt(NewLine::quantity).sum(), requestId);
        idempotency.complete(actor.toString(), "ORDER_ITEMS_ADDED", idempotencyKey, orderId);
        return details(orderId);
    }

    @Transactional
    public OrderDetails cancelItem(UUID actor, UUID requestId, UUID orderId, UUID orderItemId,
            UUID idempotencyKey, OperationalOrderController.CancelOrderItemRequest request) {
        String reason = request.reason().trim();
        String requestFingerprint = hashText(orderId + "|" + orderItemId + "|" + request.expectedOrderVersion()
                + "|" + request.expectedItemVersion() + "|" + reason);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "ORDER_LINE_CANCELLED",
                idempotencyKey, requestFingerprint);
        if (claim.replay()) return details(claim.resourceId());

        List<LineCancellationOrder> orderRows = jdbc.query("""
            SELECT id, account_id, status, row_version FROM wok.orders WHERE id = ? FOR UPDATE
            """, (rs, row) -> new LineCancellationOrder(rs.getObject("id", UUID.class),
                rs.getObject("account_id", UUID.class), OrderStatus.valueOf(rs.getString("status")),
                rs.getInt("row_version")), orderId);
        if (orderRows.isEmpty()) throw new AuthException(404, "No encontramos el pedido.");
        LineCancellationOrder order = orderRows.getFirst();
        if (order.status() != OrderStatus.SENT)
            throw new AuthException(409, "Sólo se pueden ajustar productos antes de que cocina inicie el pedido.");
        if (order.rowVersion() != request.expectedOrderVersion())
            throw new AuthException(409, "El pedido cambió. Actualiza la vista antes de ajustar productos.");

        Account account = lockAccount(order.accountId());
        if (!"OPEN".equals(account.status())) throw new AuthException(409, "La cuenta ya no admite cambios.");
        if (jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM wok.payments WHERE account_id = ? AND status = 'CAPTURED')
                """, Boolean.class, order.accountId()))
            throw new AuthException(409, "Registra el reembolso o ajuste financiero antes de modificar productos cobrados.");
        if (jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM wok.invoices
                    WHERE account_id = ? AND status IN ('DRAFT', 'QUEUED', 'ISSUED', 'UNKNOWN'))
                """, Boolean.class, order.accountId()))
            throw new AuthException(409, "La cuenta ya tiene facturación preparada o emitida; resuélvela antes del ajuste.");
        if (jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM wok.payment_intents intent
                    WHERE intent.order_id = ? AND intent.status IN
                        ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'UNKNOWN'))
                """, Boolean.class, orderId))
            throw new AuthException(409, "Hay un pago pendiente de confirmación para este pedido.");

        List<LineCancellationItem> lineRows = jdbc.query("""
            SELECT id, quantity, unit_price, line_total, status, row_version, resource_snapshot_complete,
                   preparation_snapshot_complete
            FROM wok.order_items WHERE id = ? AND order_id = ? FOR UPDATE
            """, (rs, row) -> new LineCancellationItem(rs.getObject("id", UUID.class), rs.getInt("quantity"),
                rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"), rs.getString("status"),
                rs.getInt("row_version"), rs.getBoolean("resource_snapshot_complete"),
                rs.getBoolean("preparation_snapshot_complete")), orderItemId, orderId);
        if (lineRows.isEmpty()) throw new AuthException(404, "No encontramos el producto en este pedido.");
        LineCancellationItem item = lineRows.getFirst();
        if (!"ACTIVE".equals(item.status())) throw new AuthException(409, "El producto ya fue cancelado.");
        if (item.rowVersion() != request.expectedItemVersion())
            throw new AuthException(409, "El producto cambió. Actualiza el detalle antes de ajustar.");
        if (!item.resourceSnapshotComplete())
            throw new AuthException(409, "Este pedido no conserva una reserva de recursos por producto y requiere revisión manual.");
        Integer activeLines = jdbc.queryForObject("""
                SELECT count(*) FROM wok.order_items WHERE order_id = ? AND status = 'ACTIVE'
            """, Integer.class, orderId);
        if (activeLines == null || activeLines <= 1)
            throw new AuthException(409, "Cancela el pedido completo desde su flujo de cancelación.");

        List<LineTicket> tickets = jdbc.query("""
            SELECT ticket_item.id, ticket_item.ticket_id, ticket_item.quantity, ticket_item.action,
                   ticket.status, ticket.row_version
            FROM wok.kitchen_ticket_items ticket_item
            JOIN wok.kitchen_tickets ticket ON ticket.id = ticket_item.ticket_id
            WHERE ticket_item.order_item_id = ? AND ticket_item.action <> 'CANCELLED'
            ORDER BY ticket_item.ticket_id FOR UPDATE OF ticket_item, ticket
            """, (rs, row) -> new LineTicket(rs.getObject("id", UUID.class),
                rs.getObject("ticket_id", UUID.class), rs.getInt("quantity"), rs.getString("action"),
                rs.getString("status"), rs.getInt("row_version")), orderItemId);
        if (tickets.isEmpty() || tickets.stream().anyMatch(ticket -> !"QUEUED".equals(ticket.status())))
            throw new AuthException(409, "Cocina ya inició este producto; solicita ayuda al equipo antes de ajustar.");

        List<InventoryReservationService.ResourceDelta> resourceDeltas = reservations.releaseOrderItem(orderId, orderItemId);
        jdbc.update("""
            INSERT INTO wok.order_item_change_events
                (order_id, order_item_id, change_type, previous_status, previous_quantity, previous_line_total,
                 next_status, next_quantity, next_line_total, financial_delta, reason, actor_user_id,
                 resource_delta_snapshot, kitchen_ticket_snapshot, request_id)
            VALUES (?, ?, 'CANCEL_LINE', 'ACTIVE', ?, ?, 'CANCELLED', 0, 0, ?, ?, ?,
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'itemId', item_id, 'quantityDelta', quantity_delta) ORDER BY item_id)
                    FROM wok.order_item_resource_reservations WHERE order_item_id = ?), '[]'::jsonb),
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'ticketItemId', ticket_item.id, 'ticketId', ticket.id,
                    'quantity', ticket_item.quantity, 'action', ticket_item.action,
                    'ticketStatus', ticket.status, 'estimatedReadyAt', ticket.estimated_ready_at)
                    ORDER BY ticket_item.created_at, ticket_item.id)
                    FROM wok.kitchen_ticket_items ticket_item
                    JOIN wok.kitchen_tickets ticket ON ticket.id = ticket_item.ticket_id
                    WHERE ticket_item.order_item_id = ?), '[]'::jsonb), ?)
            """, orderId, orderItemId, item.quantity(), item.lineTotal(), item.lineTotal().negate(), reason, actor,
                orderItemId, orderItemId, requestId);

        int lineChanged = jdbc.update("""
            UPDATE wok.order_items SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = ?,
                updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND status = 'ACTIVE' AND row_version = ?
            """, actor, orderItemId, request.expectedItemVersion());
        if (lineChanged != 1) throw new AuthException(409, "El producto cambió. Actualiza la vista antes del ajuste.");
        jdbc.update("""
            UPDATE wok.kitchen_ticket_items SET action = 'CANCELLED'
            WHERE order_item_id = ? AND action <> 'CANCELLED'
            """, orderItemId);
        for (UUID ticketId : tickets.stream().map(LineTicket::ticketId).distinct().toList()) {
            int activeTicketItems = jdbc.queryForObject("""
                SELECT count(*) FROM wok.kitchen_ticket_items WHERE ticket_id = ? AND action <> 'CANCELLED'
                """, Integer.class, ticketId);
            if (activeTicketItems == 0) {
                int ticketChanged = jdbc.update("""
                    UPDATE wok.kitchen_tickets SET status = 'CANCELLED', updated_at = now(),
                        row_version = row_version + 1
                    WHERE id = ? AND status = 'QUEUED'
                    """, ticketId);
                if (ticketChanged == 1) jdbc.update("""
                    INSERT INTO wok.kitchen_ticket_status_history
                        (ticket_id, from_status, to_status, reason, actor_user_id, request_id)
                    VALUES (?, 'QUEUED', 'CANCELLED', 'ALL_LINES_CANCELLED', ?, ?)
                    """, ticketId, actor, requestId);
            }
        }
        recalcTotals(orderId, actor);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data,
                 reason, result, request_id)
            VALUES (?, 'ORDER_LINE_CANCELLED', 'ORDER_ITEM', ?,
                jsonb_build_object('status', 'ACTIVE', 'quantity', ?, 'lineTotal', ?),
                jsonb_build_object('status', 'CANCELLED', 'quantity', 0, 'lineTotal', 0,
                    'releasedResources', ?), ?, 'SUCCESS', ?)
            """, actor, orderItemId, item.quantity(), item.lineTotal(), resourceDeltas.size(), reason, requestId);
        idempotency.complete(actor.toString(), "ORDER_LINE_CANCELLED", idempotencyKey, orderId);
        return details(orderId);
    }

    @Transactional
    public OrderDetails modifyItemQuantity(UUID actor, UUID requestId, UUID orderId, UUID orderItemId,
            UUID idempotencyKey, OperationalOrderController.ModifyOrderItemQuantityRequest request) {
        String reason = request.reason().trim();
        String fingerprint = hashText(orderId + "|" + orderItemId + "|" + request.expectedOrderVersion()
                + "|" + request.expectedItemVersion() + "|" + request.quantity() + "|" + reason);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "ORDER_LINE_QUANTITY_MODIFIED",
                idempotencyKey, fingerprint);
        if (claim.replay()) return details(claim.resourceId());
        LineCancellationOrder order = lockLineChangeOrder(orderId);
        if (order.status() != OrderStatus.SENT || order.rowVersion() != request.expectedOrderVersion())
            throw new AuthException(409, "El pedido cambió o cocina ya inició; actualiza el detalle antes de modificarlo.");
        Account account = lockAccount(order.accountId());
        if (!"OPEN".equals(account.status())) throw new AuthException(409, "La cuenta ya no admite cambios.");
        if (hasFinancialActivity(orderId, order.accountId()))
            throw new AuthException(409, "Resuelve el cobro o la facturación antes de modificar productos.");

        List<LineCancellationItem> lines = jdbc.query("""
            SELECT id, quantity, unit_price, line_total, status, row_version, resource_snapshot_complete,
                   preparation_snapshot_complete
            FROM wok.order_items WHERE id = ? AND order_id = ? FOR UPDATE
            """, (rs, row) -> new LineCancellationItem(rs.getObject("id", UUID.class), rs.getInt("quantity"),
                rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"), rs.getString("status"),
                rs.getInt("row_version"), rs.getBoolean("resource_snapshot_complete"),
                rs.getBoolean("preparation_snapshot_complete")), orderItemId, orderId);
        if (lines.isEmpty()) throw new AuthException(404, "No encontramos el producto en este pedido.");
        LineCancellationItem line = lines.getFirst();
        if (!"ACTIVE".equals(line.status()) || line.rowVersion() != request.expectedItemVersion())
            throw new AuthException(409, "El producto cambió desde que se solicitó el ajuste.");
        if (!line.resourceSnapshotComplete())
            throw new AuthException(409, "Este producto no conserva una reserva verificable y requiere revisión manual.");
        if (!line.preparationSnapshotComplete())
            throw new AuthException(409, "Este pedido es anterior al snapshot operativo de preparación y requiere revisión manual.");
        if (!Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT modifier_resource_snapshot_complete FROM wok.order_items WHERE id = ?
                """, Boolean.class, orderItemId)))
            throw new AuthException(409, "Este producto no conserva el detalle de recursos de sus opciones y requiere revisión manual.");
        if (line.quantity() == request.quantity()) throw new AuthException(422, "La cantidad solicitada no cambia la actual.");

        List<LineTicket> tickets = jdbc.query("""
            SELECT ti.id, ti.ticket_id, ti.quantity, ti.action, ticket.status, ticket.row_version
            FROM wok.kitchen_ticket_items ti JOIN wok.kitchen_tickets ticket ON ticket.id = ti.ticket_id
            WHERE ti.order_item_id = ? AND ti.action <> 'CANCELLED'
            ORDER BY ticket.station_id, ticket.id FOR UPDATE OF ti, ticket
            """, (rs, row) -> new LineTicket(rs.getObject("id", UUID.class), rs.getObject("ticket_id", UUID.class),
                rs.getInt("quantity"), rs.getString("action"), rs.getString("status"), rs.getInt("row_version")), orderItemId);
        if (tickets.size() != 1 || tickets.stream().anyMatch(ticket -> !"QUEUED".equals(ticket.status())))
            throw new AuthException(409, "La comanda ya inició o no permite un ajuste seguro.");
        LineTicket target = tickets.getFirst();
        UUID stationId = jdbc.queryForObject("SELECT station_id FROM wok.kitchen_tickets WHERE id = ?", UUID.class, target.ticketId());
        List<Instant> previousEtaRows = jdbc.query("SELECT estimated_ready_at FROM wok.kitchen_tickets WHERE id = ?",
                (rs, row) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant(), target.ticketId());
        Instant previousEta = previousEtaRows.isEmpty() ? null : previousEtaRows.getFirst();
        String resourcesBefore = jdbc.queryForObject("""
            SELECT COALESCE(jsonb_agg(jsonb_build_object('itemId', item_id, 'quantityDelta', quantity_delta)
                ORDER BY item_id), '[]'::jsonb)::text
            FROM wok.order_item_resource_reservations WHERE order_item_id = ?
            """, String.class, orderItemId);

        List<InventoryReservationService.ResourceDelta> resources = reservations.adjustOrderItemQuantity(
                orderId, orderItemId, line.quantity(), request.quantity());
        List<UUID> activeStations = jdbc.query("""
            SELECT id FROM wok.preparation_areas WHERE id = ? AND active = true FOR UPDATE
            """, (rs, row) -> rs.getObject(1, UUID.class), stationId);
        if (activeStations.isEmpty()) throw new AuthException(409, "El área de preparación ya no está disponible.");
        int changed = jdbc.update("""
            UPDATE wok.order_items SET quantity = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND row_version = ? AND status = 'ACTIVE'
            """, request.quantity(), orderItemId, request.expectedItemVersion());
        if (changed != 1) throw new AuthException(409, "El producto cambió durante el ajuste.");
        jdbc.update("UPDATE wok.kitchen_ticket_items SET quantity = ? WHERE id = ?", request.quantity(), target.id());

        Long ticketPreparation = jdbc.queryForObject("""
            SELECT COALESCE(sum(ti.quantity::bigint * item.preparation_seconds_per_unit_snapshot), 0)::bigint
            FROM wok.kitchen_ticket_items ti JOIN wok.order_items item ON item.id = ti.order_item_id
            WHERE ti.ticket_id = ? AND ti.action <> 'CANCELLED'
            """, Long.class, target.ticketId());
        Long queueDelay = jdbc.queryForObject("""
            SELECT GREATEST(0, COALESCE(ceil(extract(epoch FROM (max(estimated_ready_at) - now())))::bigint, 0))
            FROM wok.kitchen_tickets WHERE station_id = ? AND status IN ('QUEUED', 'PREPARING') AND id <> ?
            """, Long.class, stationId, target.ticketId());
        long seconds = Math.addExact(ticketPreparation == null ? 0 : ticketPreparation,
                queueDelay == null ? 0 : queueDelay);
        if (seconds > 86_400) throw new AuthException(422, "La nueva preparación excede el tiempo operativo permitido.");
        List<Instant> requestedRows = jdbc.query("SELECT requested_for FROM wok.order_requests WHERE order_id = ?",
                (rs, row) -> rs.getTimestamp(1).toInstant(), orderId);
        if (!requestedRows.isEmpty() && !requestedRows.getFirst().isAfter(Instant.now().plusSeconds(seconds)))
            throw new AuthException(422, "La nueva cantidad ya no cabe en el horario solicitado.");
        jdbc.update("""
            UPDATE wok.kitchen_tickets SET estimated_ready_at = now() + make_interval(secs => ?),
                updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND status = 'QUEUED'
            """, Math.toIntExact(seconds), target.ticketId());

        BigDecimal nextLineTotal = line.unitPrice().multiply(BigDecimal.valueOf(request.quantity()));
        if (nextLineTotal.precision() > 14 || nextLineTotal.scale() > 2)
            throw new AuthException(422, "El total de la línea excede el máximo permitido.");
        BigDecimal nextSubtotal = jdbc.queryForObject("""
            SELECT COALESCE(sum(line_total), 0) + ?
            FROM wok.order_items WHERE order_id = ? AND status = 'ACTIVE' AND id <> ?
            """, BigDecimal.class, nextLineTotal, orderId, orderItemId);
        if (nextSubtotal != null && nextSubtotal.precision() > 14)
            throw new AuthException(422, "El total del pedido excede el máximo permitido.");
        jdbc.update("""
            INSERT INTO wok.order_item_change_events
                (order_id, order_item_id, change_type, previous_status, previous_quantity, previous_line_total,
                 next_status, next_quantity, next_line_total, financial_delta, reason, actor_user_id,
                 resource_delta_snapshot, kitchen_ticket_snapshot, request_id)
            VALUES (?, ?, 'MODIFY_LINE_QUANTITY', 'ACTIVE', ?, ?, 'ACTIVE', ?, ?, ?, ?, ?,
                ?::jsonb, jsonb_build_array(jsonb_build_object('ticketId', ?, 'ticketItemId', ?,
                    'oldQuantity', ?, 'newQuantity', ?,
                    'previousEstimatedReadyAt', ?::timestamptz,
                    'nextEstimatedReadyAt', (SELECT estimated_ready_at FROM wok.kitchen_tickets WHERE id = ?))), ?)
            """, orderId, orderItemId, line.quantity(), line.lineTotal(), request.quantity(), nextLineTotal,
                nextLineTotal.subtract(line.lineTotal()), reason, actor,
                jsonbResourceChangeSnapshot(resourcesBefore, resources), target.ticketId(), target.id(),
                target.quantity(), request.quantity(), previousEta == null ? null
                        : java.sql.Timestamp.from(previousEta),
                target.ticketId(), requestId);
        recalcTotals(orderId, actor);
        jdbc.update("""
            INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data,
                reason, result, request_id)
            VALUES (?, 'ORDER_LINE_QUANTITY_MODIFIED', 'ORDER_ITEM', ?,
                jsonb_build_object('quantity', ?, 'lineTotal', ?),
                jsonb_build_object('quantity', ?, 'lineTotal', ?, 'estimatedPreparationSeconds', ?),
                ?, 'SUCCESS', ?)
            """, actor, orderItemId, line.quantity(), line.lineTotal(), request.quantity(), nextLineTotal,
                seconds, reason, requestId);
        idempotency.complete(actor.toString(), "ORDER_LINE_QUANTITY_MODIFIED", idempotencyKey, orderId);
        return details(orderId);
    }

    @Transactional
    public OrderDetails modifyItemModifiers(UUID actor, UUID requestId, UUID orderId, UUID orderItemId,
            UUID idempotencyKey, OperationalOrderController.ModifyOrderItemModifiersRequest request) {
        String reason = request.reason().trim();
        List<SelectedModifier> nextModifiers = request.modifiers().stream()
                .sorted(Comparator.comparing(option -> option.id().toString())).toList();
        String fingerprint = hashText(orderId + "|" + orderItemId + "|" + request.expectedOrderVersion()
                + "|" + request.expectedItemVersion() + "|" + nextModifiers + "|" + reason);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "ORDER_LINE_MODIFIERS_MODIFIED",
                idempotencyKey, fingerprint);
        if (claim.replay()) return details(claim.resourceId());
        LineCancellationOrder order = lockLineChangeOrder(orderId);
        if (order.status() != OrderStatus.SENT || order.rowVersion() != request.expectedOrderVersion())
            throw new AuthException(409, "El pedido cambió o cocina ya inició; actualiza el detalle antes de modificarlo.");
        Account account = lockAccount(order.accountId());
        if (!"OPEN".equals(account.status())) throw new AuthException(409, "La cuenta ya no admite cambios.");
        if (hasFinancialActivity(orderId, order.accountId()))
            throw new AuthException(409, "Resuelve el cobro o la facturación antes de modificar productos.");

        List<LineCancellationItem> lines = jdbc.query("""
            SELECT id, quantity, unit_price, line_total, status, row_version, resource_snapshot_complete,
                   preparation_snapshot_complete
            FROM wok.order_items WHERE id = ? AND order_id = ? FOR UPDATE
            """, (rs, row) -> new LineCancellationItem(rs.getObject("id", UUID.class), rs.getInt("quantity"),
                rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"), rs.getString("status"),
                rs.getInt("row_version"), rs.getBoolean("resource_snapshot_complete"),
                rs.getBoolean("preparation_snapshot_complete")), orderItemId, orderId);
        if (lines.isEmpty()) throw new AuthException(404, "No encontramos el producto en este pedido.");
        LineCancellationItem line = lines.getFirst();
        if (!"ACTIVE".equals(line.status()) || line.rowVersion() != request.expectedItemVersion())
            throw new AuthException(409, "El producto cambió desde que se solicitaron las opciones.");
        if (!line.resourceSnapshotComplete() || !line.preparationSnapshotComplete()
                || !Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT modifier_resource_snapshot_complete FROM wok.order_items WHERE id = ?
                """, Boolean.class, orderItemId)))
            throw new AuthException(409, "Este producto no conserva snapshots de inventario y preparación compatibles; requiere revisión manual.");
        List<LineTicket> tickets = jdbc.query("""
            SELECT ti.id, ti.ticket_id, ti.quantity, ti.action, ticket.status, ticket.row_version
            FROM wok.kitchen_ticket_items ti JOIN wok.kitchen_tickets ticket ON ticket.id = ti.ticket_id
            WHERE ti.order_item_id = ? AND ti.action <> 'CANCELLED'
            ORDER BY ticket.station_id, ticket.id FOR UPDATE OF ti, ticket
            """, (rs, row) -> new LineTicket(rs.getObject("id", UUID.class), rs.getObject("ticket_id", UUID.class),
                rs.getInt("quantity"), rs.getString("action"), rs.getString("status"), rs.getInt("row_version")), orderItemId);
        if (tickets.size() != 1 || tickets.stream().anyMatch(ticket -> !"QUEUED".equals(ticket.status())))
            throw new AuthException(409, "La comanda ya inició o no permite un ajuste seguro.");

        List<PreviousModifier> previous = jdbc.query("""
            SELECT selected.modifier_id, selected.group_name_snapshot, selected.modifier_name_snapshot,
                   selected.price_delta, modifier.group_id
            FROM wok.order_item_modifiers selected JOIN wok.modifiers modifier ON modifier.id = selected.modifier_id
            WHERE selected.order_item_id = ? ORDER BY selected.modifier_id
            """, (rs, row) -> new PreviousModifier(rs.getObject("modifier_id", UUID.class),
                rs.getObject("group_id", UUID.class), rs.getString("group_name_snapshot"),
                rs.getString("modifier_name_snapshot"), rs.getBigDecimal("price_delta")), orderItemId);
        List<UUID> previousIds = previous.stream().map(PreviousModifier::modifierId).toList();
        List<UUID> nextIds = nextModifiers.stream().map(SelectedModifier::id).toList();
        if (previousIds.equals(nextIds)) throw new AuthException(422, "Las opciones seleccionadas no cambian el producto.");
        BigDecimal oldDelta = previous.stream().map(PreviousModifier::priceDelta)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal nextDelta = nextModifiers.stream().map(SelectedModifier::priceDelta)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal basePrice = line.unitPrice().subtract(oldDelta);
        BigDecimal nextUnitPrice = basePrice.add(nextDelta);
        BigDecimal nextLineTotal = nextUnitPrice.multiply(BigDecimal.valueOf(line.quantity()));
        if (nextUnitPrice.signum() < 0 || nextUnitPrice.scale() > 2 || nextUnitPrice.precision() > 14
                || nextLineTotal.scale() > 2 || nextLineTotal.precision() > 14)
            throw new AuthException(422, "El precio nuevo excede la precisión monetaria permitida.");
        BigDecimal nextSubtotal = jdbc.queryForObject("""
            SELECT COALESCE(sum(line_total), 0) + ? FROM wok.order_items
            WHERE order_id = ? AND status = 'ACTIVE' AND id <> ?
            """, BigDecimal.class, nextLineTotal, orderId, orderItemId);
        if (nextSubtotal != null && nextSubtotal.precision() > 14)
            throw new AuthException(422, "El total del pedido excede el máximo permitido.");

        String previousResourceSnapshot = jdbc.queryForObject("""
            SELECT COALESCE(jsonb_agg(jsonb_build_object('itemId', item_id, 'quantityDelta', quantity_delta)
                ORDER BY item_id), '[]'::jsonb)::text
            FROM wok.order_item_resource_reservations WHERE order_item_id = ?
            """, String.class, orderItemId);
        List<InventoryReservationService.ResourceDelta> resourceDeltas = reservations.replaceOrderItemModifierResources(
                orderId, orderItemId, request.resourceContributions());
        jdbc.update("DELETE FROM wok.order_item_modifiers WHERE order_item_id = ?", orderItemId);
        for (SelectedModifier modifier : nextModifiers) jdbc.update("""
            INSERT INTO wok.order_item_modifiers
                (order_item_id, modifier_id, group_name_snapshot, modifier_name_snapshot, price_delta)
            VALUES (?, ?, ?, ?, ?)
            """, orderItemId, modifier.id(), modifier.groupName(), modifier.name(), modifier.priceDelta());
        int updated = jdbc.update("""
            UPDATE wok.order_items SET unit_price = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND row_version = ? AND status = 'ACTIVE'
            """, nextUnitPrice, orderItemId, request.expectedItemVersion());
        if (updated != 1) throw new AuthException(409, "El producto cambió durante el ajuste.");

        jdbc.update("""
            INSERT INTO wok.order_item_change_events
                (order_id, order_item_id, change_type, previous_status, previous_quantity, previous_line_total,
                 next_status, next_quantity, next_line_total, financial_delta, reason, actor_user_id,
                 resource_delta_snapshot, modifier_snapshot, request_id)
            VALUES (?, ?, 'MODIFY_LINE_MODIFIERS', 'ACTIVE', ?, ?, 'ACTIVE', ?, ?, ?, ?, ?,
                ?::jsonb, ?::jsonb, ?)
            """, orderId, orderItemId, line.quantity(), line.lineTotal(), line.quantity(), nextLineTotal,
                nextLineTotal.subtract(line.lineTotal()), reason, actor,
                jsonbResourceChangeSnapshot(previousResourceSnapshot, resourceDeltas),
                jsonbModifierChangeSnapshot(previous, nextModifiers), requestId);
        recalcTotals(orderId, actor);
        jdbc.update("""
            INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data,
                reason, result, request_id)
            VALUES (?, 'ORDER_LINE_MODIFIERS_MODIFIED', 'ORDER_ITEM', ?,
                jsonb_build_object('unitPrice', ?, 'lineTotal', ?, 'modifierIds', ?::jsonb),
                jsonb_build_object('unitPrice', ?, 'lineTotal', ?, 'modifierIds', ?::jsonb,
                    'resourceChanges', ?), ?, 'SUCCESS', ?)
            """, actor, orderItemId, line.unitPrice(), line.lineTotal(), writeModifierIds(previousIds),
                nextUnitPrice, nextLineTotal, writeModifierIds(nextIds), resourceDeltas.size(), reason, requestId);
        idempotency.complete(actor.toString(), "ORDER_LINE_MODIFIERS_MODIFIED", idempotencyKey, orderId);
        return details(orderId);
    }

    private LineCancellationOrder lockLineChangeOrder(UUID orderId) {
        List<LineCancellationOrder> rows = jdbc.query("""
            SELECT id, account_id, status, row_version FROM wok.orders WHERE id = ? FOR UPDATE
            """, (rs, row) -> new LineCancellationOrder(rs.getObject("id", UUID.class),
                rs.getObject("account_id", UUID.class), OrderStatus.valueOf(rs.getString("status")),
                rs.getInt("row_version")), orderId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el pedido.");
        return rows.getFirst();
    }

    private boolean hasFinancialActivity(UUID orderId, UUID accountId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM wok.payments WHERE account_id = ? AND status = 'CAPTURED')
                OR EXISTS (SELECT 1 FROM wok.invoices WHERE account_id = ? AND status IN ('DRAFT','QUEUED','ISSUED','UNKNOWN'))
                OR EXISTS (SELECT 1 FROM wok.payment_intents WHERE order_id = ? AND status IN
                    ('CREATED','PENDING','REQUIRES_ACTION','AUTHORIZED','UNKNOWN'))
            """, Boolean.class, accountId, accountId, orderId));
    }

    private String jsonbResourceChangeSnapshot(String previous,
            List<InventoryReservationService.ResourceDelta> next) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(Map.of(
                    "previous", new com.fasterxml.jackson.databind.ObjectMapper().readTree(previous),
                    "next", next.stream().map(delta -> Map.of("itemId", delta.itemId(),
                            "quantityDelta", delta.quantityDelta())).toList()));
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("Could not serialize the resource change snapshot", error);
        }
    }

    private String jsonbModifierChangeSnapshot(List<PreviousModifier> previous, List<SelectedModifier> next) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(Map.of(
                    "previous", previous.stream().map(option -> Map.of("modifierId", option.modifierId(),
                            "groupName", option.groupName(), "name", option.name(),
                            "priceDelta", option.priceDelta())).toList(),
                    "next", next.stream().map(option -> Map.of("modifierId", option.id(),
                            "groupName", option.groupName(), "name", option.name(),
                            "priceDelta", option.priceDelta())).toList()));
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("Could not serialize modifier snapshots", error);
        }
    }

    private String writeModifierIds(List<UUID> ids) {
        try { return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(ids); }
        catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("Could not serialize modifier identifiers", error);
        }
    }

    @Transactional
    public UUID createPickupOrder(UUID actor, UUID requestId, String accountName,
                                  List<OperationalOrderController.OrderLineRequest> requestedLines,
                                  Instant requestedFor) {
        return createOffPremiseOrder(actor, requestId, accountName, Channel.PICKUP, requestedLines, requestedFor);
    }

    @Transactional
    public UUID createDeliveryOrder(UUID actor, UUID requestId, String accountName,
                                    List<OperationalOrderController.OrderLineRequest> requestedLines,
                                    Instant requestedFor) {
        return createOffPremiseOrder(actor, requestId, accountName, Channel.DELIVERY, requestedLines, requestedFor);
    }

    private UUID createOffPremiseOrder(UUID actor, UUID requestId, String accountName, Channel channel,
                                       List<OperationalOrderController.OrderLineRequest> requestedLines,
                                       Instant requestedFor) {
        List<OperationalOrderController.OrderLineRequest> lines = requestedLines.stream()
                .map(line -> new OperationalOrderController.OrderLineRequest(
                        line.menuItemId(), line.quantity(), "TAKEAWAY", line.notes(), line.modifierIds()))
                .toList();
        List<Product> products = loadProducts(lines);
        if (products.size() != lines.size())
            throw new AuthException(422, "Uno o más productos de la solicitud ya no están disponibles.");
        UUID currencyId = products.getFirst().currencyId();
        if (products.stream().anyMatch(product -> !product.currencyId().equals(currencyId)))
            throw new AuthException(422, "No se pueden mezclar monedas en un pedido.");

        UUID accountId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.order_accounts (id, dining_table_id, name, status, opened_by, created_by, updated_by)
            VALUES (?, NULL, ?, 'OPEN', ?, ?, ?)
            """, accountId, accountName, actor, actor, actor);

        UUID orderId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.orders
                (id, code, account_id, dining_table_id, channel, status, currency_id, guest_count, opened_by, updated_by)
            VALUES (?, ?, ?, NULL, ?, 'SENT', ?, 1, ?, ?)
            """, orderId, nextCode(), accountId, channel.name(), currencyId, actor, actor);

        List<NewLine> newLines = new ArrayList<>();
        for (int index = 0; index < products.size(); index++) {
            newLines.add(insertLine(orderId, products.get(index), lines.get(index)));
        }
        reserveStock(actor, requestId, orderId, newLines);
        recalcTotals(orderId, actor);
        enqueueTickets(actor, requestId, orderId, newLines, requestedFor, channel.name());
        jdbc.update("""
            INSERT INTO wok.order_status_history (order_id, from_status, to_status, actor_user_id, request_id)
            VALUES (?, NULL, 'SENT', ?, ?)
            """, orderId, actor, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'ORDER_OPENED', 'ORDER', ?,
                    jsonb_build_object('status', 'SENT', 'channel', ?, 'lines', ?), 'SUCCESS', ?)
            """, actor, orderId, channel.name(), lines.size(), requestId);
        if (channel == Channel.DELIVERY) {
            UUID dispatchId = UUID.randomUUID();
            jdbc.update("""
                INSERT INTO wok.delivery_dispatches (id, order_id, status)
                VALUES (?, ?, 'AWAITING_KITCHEN')
                """, dispatchId, orderId);
            jdbc.update("""
                INSERT INTO wok.delivery_dispatch_events
                    (dispatch_id, from_status, to_status, actor_user_id, reason, request_id)
                VALUES (?, NULL, 'AWAITING_KITCHEN', ?, 'DELIVERY_ORDER_ACCEPTED', ?)
                """, dispatchId, actor, requestId);
        }
        return orderId;
    }

    @Transactional
    public OrderSummary changeStatus(UUID actor, UUID requestId, UUID orderId,
                                     OperationalOrderController.StatusRequest request) {
        List<OrderStatus> rows = jdbc.query("""
            SELECT status FROM wok.orders WHERE id = ? FOR UPDATE
            """, (rs, row) -> OrderStatus.valueOf(rs.getString("status")), orderId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el pedido.");
        OrderStatus current = rows.getFirst();
        if (!TRANSITIONS.getOrDefault(current, List.of()).contains(request.status()))
            throw new AuthException(409, "El pedido no puede pasar de " + current + " a " + request.status() + ".");
        if (request.expectedVersion() <= 0)
            throw new AuthException(422, "Revisa la versión del pedido.");

        int changed = jdbc.update("""
            UPDATE wok.orders
            SET status = ?,
                closed_at = CASE WHEN ? IN ('CLOSED', 'CANCELLED') THEN now() ELSE NULL END,
                updated_at = now(), updated_by = ?, row_version = row_version + 1
            WHERE id = ? AND status = ? AND row_version = ?
            """, request.status().name(), request.status().name(), actor, orderId, current.name(),
                request.expectedVersion());
        if (changed != 1)
            throw new AuthException(409, "El pedido cambió. Actualiza la vista y vuelve a intentarlo.");

        if (request.status() == OrderStatus.CANCELLED) {
            cancelTickets(actor, requestId, orderId);
            if (current == OrderStatus.SENT) reservations.release(orderId);
            else reservations.consumeAsWaste(actor, requestId, orderId);
            cancelDeliveryDispatches(actor, requestId, orderId);
        }
        if (request.status() == OrderStatus.SERVED) {
            reservations.consume(actor, requestId, orderId);
        }
        jdbc.update("""
            INSERT INTO wok.order_status_history (order_id, from_status, to_status, reason, actor_user_id, request_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """, orderId, current.name(), request.status().name(),
                request.reason() == null || request.reason().isBlank() ? null : request.reason().trim(),
                actor, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, 'ORDER_STATUS_CHANGED', 'ORDER', ?,
                    jsonb_build_object('status', ?, 'version', ?),
                    jsonb_build_object('status', ?, 'version', ?), ?, 'SUCCESS', ?)
            """, actor, orderId, current.name(), request.expectedVersion(), request.status().name(),
                request.expectedVersion() + 1, request.reason(), requestId);

        return summary(orderId);
    }

    private void cancelDeliveryDispatches(UUID actor, UUID requestId, UUID orderId) {
        List<DeliveryDispatchCancellation> dispatches = jdbc.query("""
            SELECT id, status, assigned_to_user_id, row_version
            FROM wok.delivery_dispatches
            WHERE order_id = ? AND status NOT IN ('DELIVERED', 'CANCELLED')
            FOR UPDATE
            """, (rs, row) -> new DeliveryDispatchCancellation(rs.getObject("id", UUID.class),
                rs.getString("status"), rs.getObject("assigned_to_user_id", UUID.class), rs.getInt("row_version")), orderId);
        for (DeliveryDispatchCancellation dispatch : dispatches) {
            int changed = jdbc.update("""
                UPDATE wok.delivery_dispatches
                SET status = 'CANCELLED', updated_at = now(), row_version = row_version + 1
                WHERE id = ? AND row_version = ?
                """, dispatch.id(), dispatch.rowVersion());
            if (changed != 1) throw new AuthException(409, "El despacho cambió. Actualiza el pedido.");
            jdbc.update("""
                INSERT INTO wok.delivery_dispatch_events
                    (dispatch_id, from_status, to_status, actor_user_id, assigned_to_user_id, reason, request_id)
                VALUES (?, ?, 'CANCELLED', ?, ?, 'ORDER_CANCELLED', ?)
                """, dispatch.id(), dispatch.status(), actor, dispatch.assignedTo(), requestId);
        }
    }

    private record DeliveryDispatchCancellation(UUID id, String status, UUID assignedTo, int rowVersion) {}

    private void reserveStock(UUID actor, UUID requestId, UUID orderId, List<NewLine> newLines) {
        reservations.reserve(actor, requestId, orderId, newLines.stream()
                .map(line -> new InventoryReservationService.Line(
                        line.orderItemId(), line.product().id(), line.quantity()))
                .toList());
    }

    private void reserveModifierStock(UUID actor, UUID requestId, UUID orderId, List<NewLine> newLines) {
        List<UUID> itemIds = newLines.stream().map(NewLine::orderItemId).toList();
        reservations.reserveOperationalModifierImpacts(actor, requestId, orderId, itemIds);
        reservations.completeResourceSnapshots(itemIds);
    }

    private OrderSummary summary(UUID orderId) {
        List<OrderSummary> found = jdbc.query("""
            SELECT o.id, o.code, o.status, o.channel, o.subtotal, o.discount, o.total, o.guest_count, o.opened_at,
                   o.closed_at, o.row_version, o.currency_id, c.code AS currency_code,
                   t.id AS dining_table_id, t.name AS dining_table_name,
                   a.id AS account_id, a.name AS account_name,
                   (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id AND i.status = 'ACTIVE') AS item_count
            FROM wok.orders o
            JOIN wok.currencies c ON c.id = o.currency_id
            JOIN wok.order_accounts a ON a.id = o.account_id
            LEFT JOIN wok.dining_tables t ON t.id = o.dining_table_id
            WHERE o.id = ?
            """, summaryMapper(), orderId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos el pedido.");
        return found.getFirst();
    }

    private NewLine insertLine(UUID orderId, Product product,
                                OperationalOrderController.OrderLineRequest line) {
        List<SelectedModifier> selected = modifiers.validate(product.id(), line.modifierIds());
        BigDecimal unitPrice = selected.stream().map(SelectedModifier::priceDelta)
                .reduce(product.price(), BigDecimal::add);
        UUID orderItemId = jdbc.queryForObject("""
            INSERT INTO wok.order_items
                (order_id, menu_item_id, name_snapshot, quantity, unit_price, preparation_area_id,
                 preparation_seconds_per_unit_snapshot, preparation_snapshot_complete,
                 fulfillment, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, true, ?, ?) RETURNING id
            """, UUID.class, orderId, product.id(), product.name(), line.quantity(), unitPrice,
                product.preparationAreaId(), product.preparationSeconds(), line.fulfillment() == null ? "DINE_IN"
                    : line.fulfillment().trim().toUpperCase(),
                line.notes() == null || line.notes().isBlank() ? null : line.notes().trim());
        for (SelectedModifier modifier : selected) jdbc.update("""
            INSERT INTO wok.order_item_modifiers
                (order_item_id, modifier_id, group_name_snapshot, modifier_name_snapshot, price_delta)
            VALUES (?, ?, ?, ?, ?)
            """, orderItemId, modifier.id(), modifier.groupName(), modifier.name(), modifier.priceDelta());
        return new NewLine(orderItemId, product, line.quantity());
    }

    private void recalcTotals(UUID orderId, UUID actor) {
        jdbc.update("""
            UPDATE wok.orders o
            SET subtotal = totals.subtotal, total = totals.subtotal - o.discount, updated_at = now(),
                updated_by = ?, row_version = row_version + 1
            FROM (SELECT COALESCE(sum(line_total), 0) AS subtotal FROM wok.order_items
                  WHERE order_id = ? AND status = 'ACTIVE')
                totals
            WHERE o.id = ?
            """, actor, orderId, orderId);
    }

    private OrderRow lockOrder(UUID orderId) {
        List<OrderRow> rows = jdbc.query("""
            SELECT id, account_id, status, currency_id FROM wok.orders WHERE id = ? FOR UPDATE
            """, (rs, row) -> new OrderRow(rs.getObject("id", UUID.class), rs.getObject("account_id", UUID.class),
                OrderStatus.valueOf(rs.getString("status")), rs.getObject("currency_id", UUID.class)), orderId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el pedido.");
        return rows.getFirst();
    }

    private void enqueueTickets(UUID actor, UUID requestId, UUID orderId, List<NewLine> newLines,
                                Instant requestedFor, String serviceType) {
        Map<UUID, List<NewLine>> byStation = new LinkedHashMap<>();
        for (NewLine line : newLines) {
            byStation.computeIfAbsent(line.product().preparationAreaId(), key -> new ArrayList<>()).add(line);
        }
        Map<UUID, Long> preparationByStation = new LinkedHashMap<>();
        for (Map.Entry<UUID, List<NewLine>> entry : byStation.entrySet()) {
            long preparationSeconds = entry.getValue().stream()
                    .mapToLong(line -> Math.multiplyExact((long) line.product().preparationSeconds(), line.quantity()))
                    .reduce(0L, Math::addExact);
            preparationByStation.put(entry.getKey(), preparationSeconds);
        }
        KitchenQueueEstimator.Estimate queueEstimate = kitchenQueue.estimate(preparationByStation, true, requestedFor);
        long totalReadyInSeconds = queueEstimate.overallReadySeconds();
        if (requestedFor != null) serviceHours.requireSlot(serviceType, requestedFor, true);
        if (totalReadyInSeconds > 86_400 || (requestedFor != null
                && !requestedFor.isAfter(Instant.now().plusSeconds(totalReadyInSeconds))))
            throw new AuthException(422, "La cola y preparación estimadas ya no caben en el horario solicitado.");
        Map<UUID, Long> readyInSecondsByStation = queueEstimate.stations().stream()
                .collect(java.util.stream.Collectors.toMap(KitchenQueueEstimator.StationEstimate::stationId,
                        KitchenQueueEstimator.StationEstimate::readyInSeconds));
        int sequence = nextTicketSequence(orderId);
        for (Map.Entry<UUID, List<NewLine>> entry : byStation.entrySet()) {
            UUID ticketId = UUID.randomUUID();
            jdbc.update("""
                INSERT INTO wok.kitchen_tickets (id, order_id, sequence_no, station_id, status)
                VALUES (?, ?, ?, ?, 'QUEUED')
                """, ticketId, orderId, sequence, entry.getKey());
            for (NewLine line : entry.getValue()) {
                jdbc.update("""
                    INSERT INTO wok.kitchen_ticket_items (ticket_id, order_item_id, quantity, action)
                    VALUES (?, ?, ?, 'NEW')
                    """, ticketId, line.orderItemId(), line.quantity());
            }
            long readyInSeconds = readyInSecondsByStation.get(entry.getKey());
            if (readyInSeconds > 86_400)
                throw new AuthException(422, "La carga de cocina excede el tiempo máximo operativo.");
            jdbc.update("""
                UPDATE wok.kitchen_tickets
                SET estimated_ready_at = now() + make_interval(secs => ?), updated_at = now()
                WHERE id = ?
                """, Math.toIntExact(readyInSeconds), ticketId);
            jdbc.update("""
                INSERT INTO wok.kitchen_ticket_status_history (ticket_id, from_status, to_status, actor_user_id, request_id)
                VALUES (?, NULL, 'QUEUED', ?, ?)
                """, ticketId, actor, requestId);
            sequence++;
        }
    }

    private int nextTicketSequence(UUID orderId) {
        Integer max = jdbc.queryForObject("""
            SELECT COALESCE(max(sequence_no), 0) FROM wok.kitchen_tickets WHERE order_id = ?
            """, Integer.class, orderId);
        return (max == null ? 0 : max) + 1;
    }

    private void cancelTickets(UUID actor, UUID requestId, UUID orderId) {
        List<UUID> pending = jdbc.query("""
            SELECT id FROM wok.kitchen_tickets
            WHERE order_id = ? AND status IN ('QUEUED', 'PREPARING')
            """, (rs, row) -> rs.getObject("id", UUID.class), orderId);
        for (UUID ticketId : pending) {
            jdbc.update("""
                UPDATE wok.kitchen_tickets
                SET status = 'CANCELLED', claimed_by = NULL, claimed_at = NULL, updated_at = now(), row_version = row_version + 1
                WHERE id = ? AND status IN ('QUEUED', 'PREPARING')
                """, ticketId);
            jdbc.update("""
                INSERT INTO wok.kitchen_ticket_status_history (ticket_id, from_status, to_status, reason, actor_user_id, request_id)
                SELECT id, status, 'CANCELLED', 'ORDER_CANCELLED', ?, ? FROM wok.kitchen_tickets WHERE id = ?
                """, actor, requestId, ticketId);
        }
    }

    private Account lockAccount(UUID accountId) {
        List<Account> rows = jdbc.query("""
            SELECT id, dining_table_id, status FROM wok.order_accounts WHERE id = ? FOR UPDATE
            """, (rs, row) -> new Account(rs.getObject("id", UUID.class),
                rs.getObject("dining_table_id", UUID.class), rs.getString("status")), accountId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la cuenta.");
        return rows.getFirst();
    }

    private List<Product> loadProducts(List<OperationalOrderController.OrderLineRequest> lines) {
        List<Product> products = new ArrayList<>();
        for (OperationalOrderController.OrderLineRequest line : lines) {
            List<Product> matches = jdbc.query("""
                SELECT mi.id, mi.name, mi.price, mi.currency_id, c.code AS currency_code,
                       mi.preparation_area_id, pa.code AS preparation_area_code,
                       mi.estimated_preparation_seconds
                FROM wok.menu_items mi
                JOIN wok.items i ON i.id = mi.item_id
                JOIN wok.menu_categories category ON category.id = mi.category_id AND category.active = true
                JOIN wok.preparation_areas pa ON pa.id = mi.preparation_area_id AND pa.active = true
                JOIN wok.currencies c ON c.id = mi.currency_id
                WHERE mi.id = ? AND mi.status = 'ACTIVE' AND i.active = true
                """, PRODUCT_MAPPER, line.menuItemId());
            if (matches.isEmpty()) return List.of();
            products.add(matches.getFirst());
        }
        return products;
    }

    private List<OperationalOrderController.OrderLineRequest> normalizedLines(
            List<OperationalOrderController.OrderLineRequest> items) {
        if (items == null || items.isEmpty() || items.size() > RequestLimits.MAX_DISTINCT_MENU_LINES)
            throw new AuthException(400, "Revisa los productos enviados.");
        if (items.stream().anyMatch(item -> item == null || item.menuItemId() == null || item.fulfillment() == null)
                || items.stream().anyMatch(item -> "BARRIL".equalsIgnoreCase(item.fulfillment().trim())))
            throw new AuthException(400, "Revisa el tipo de servicio de cada producto.");
        if (new HashSet<>(items.stream().map(OperationalOrderController.OrderLineRequest::menuItemId).toList())
                .size() != items.size())
            throw new AuthException(400, "Cada producto debe aparecer una sola vez.");
        return items.stream().sorted(Comparator.comparing(item -> item.menuItemId().toString())).toList();
    }

    private OrderDetails existing(UUID actor, UUID idempotencyKey, String fingerprint) {
        List<UUID> found = jdbc.query("""
            SELECT id FROM wok.orders WHERE opened_by = ? AND idempotency_key = ? AND request_fingerprint = ?
            """, (rs, row) -> rs.getObject(1, UUID.class), actor, idempotencyKey, fingerprint);
        if (!found.isEmpty()) return details(found.getFirst());
        Integer reused = jdbc.queryForObject("""
            SELECT count(*) FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?
            """, Integer.class, actor, idempotencyKey);
        if (reused != null && reused > 0) throw new AuthException(409, "La clave de pedido ya se usó con otros datos.");
        return null;
    }

    private String fingerprint(Channel channel, String notes, int guestCount,
                               List<OperationalOrderController.OrderLineRequest> lines) {
        String canonical = channel.name() + "\n" + guestCount + "\n" + (notes == null ? "" : notes) + "\n"
                + lines.stream()
                        .map(line -> line.menuItemId() + ":" + line.quantity() + ":"
                                + (line.fulfillment() == null ? "DINE_IN" : line.fulfillment()) + ":"
                                + (line.notes() == null ? "" : line.notes()) + ":"
                                + line.modifierIds().stream().map(UUID::toString).sorted()
                                        .reduce((a, b) -> a + "," + b).orElse(""))
                        .reduce((a, b) -> a + "\n" + b).orElse("");
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private String itemsFingerprint(UUID orderId, List<OperationalOrderController.OrderLineRequest> lines) {
        String canonical = orderId + "\n" + lines.stream()
                .map(line -> line.menuItemId() + ":" + line.quantity() + ":"
                        + (line.fulfillment() == null ? "DINE_IN" : line.fulfillment()) + ":"
                        + (line.notes() == null ? "" : line.notes()) + ":"
                        + line.modifierIds().stream().map(UUID::toString).sorted()
                                .reduce((a, b) -> a + "," + b).orElse(""))
                .reduce((a, b) -> a + "\n" + b).orElse("");
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private String hashText(String canonical) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private String nextCode() {
        Integer sequence = jdbc.queryForObject("SELECT nextval('wok.order_code_seq')", Integer.class);
        ZonedDateTime now = ZonedDateTime.now(RESTAURANT_ZONE);
        return "ORD-" + now.format(CODE_DATE) + "-" + String.format("%04d", sequence == null ? 1 : sequence);
    }

    private OrderReceipt receipt(OrderDetails details, boolean replay) {
        return new OrderReceipt(details.order().id(), details.order().code(), details.order().status(),
                details.order().channel(), details.order().subtotal(), details.order().discount(),
                details.order().total(), details.order().currency(), details.order().rowVersion(),
                details.items().size(), replay);
    }

    private static RowMapper<OrderSummary> summaryMapper() {
        return (rs, row) -> new OrderSummary(
                rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("status"), rs.getString("channel"),
                rs.getBigDecimal("subtotal"), rs.getBigDecimal("discount"), rs.getBigDecimal("total"),
                rs.getInt("guest_count"), rs.getTimestamp("opened_at").toInstant(),
                rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
                rs.getInt("row_version"), rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
                rs.getObject("dining_table_id", UUID.class), rs.getString("dining_table_name"),
                rs.getObject("account_id", UUID.class), rs.getString("account_name"), rs.getInt("item_count"));
    }

    public enum Channel { DINE_IN, PICKUP, DELIVERY }

    record Product(UUID id, String name, BigDecimal price, UUID currencyId, String currencyCode,
                   UUID preparationAreaId, String preparationAreaCode, int preparationSeconds) {}
    record Account(UUID id, UUID diningTableId, String status) {}
    record NewLine(UUID orderItemId, Product product, int quantity) {}
    record OrderRow(UUID id, UUID accountId, OrderStatus status, UUID currencyId) {}
    private record OrderModifierRow(UUID orderItemId, OrderModifier modifier) {}
    private record LineCancellationOrder(UUID id, UUID accountId, OrderStatus status, int rowVersion) {}
    private record LineCancellationItem(UUID id, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                                        String status, int rowVersion, boolean resourceSnapshotComplete,
                                        boolean preparationSnapshotComplete) {}
    private record PreviousModifier(UUID modifierId, UUID groupId, String groupName, String name,
                                    BigDecimal priceDelta) {}
    private record LineTicket(UUID id, UUID ticketId, int quantity, String action, String status, int rowVersion) {}

    public record OrderSummary(UUID id, String code, String status, String channel, BigDecimal subtotal,
                               BigDecimal discount, BigDecimal total, int guestCount, Instant openedAt, Instant closedAt,
                               int rowVersion, UUID currencyId, String currency, UUID diningTableId,
                               String diningTableName, UUID accountId, String accountName, int itemCount) {}
    public record OrderLine(UUID id, String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                            String fulfillment, String notes, UUID preparationAreaId, String stationCode,
                            String status, int version,
                            List<OrderModifier> modifiers) {
        public OrderLine(UUID id, String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                         String fulfillment, String notes, UUID preparationAreaId, String stationCode) {
            this(id, name, quantity, unitPrice, lineTotal, fulfillment, notes, preparationAreaId, stationCode,
                    "ACTIVE", 1, List.of());
        }
        public OrderLine(UUID id, String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                         String fulfillment, String notes, UUID preparationAreaId, String stationCode,
                         List<OrderModifier> modifiers) {
            this(id, name, quantity, unitPrice, lineTotal, fulfillment, notes, preparationAreaId, stationCode,
                    "ACTIVE", 1, modifiers);
        }
    }
    public record OrderModifier(String group, String name, BigDecimal priceDelta) {}
    public record KitchenTicket(UUID id, int sequence, String status, UUID claimedBy, Instant readyAt,
                                Instant estimatedReadyAt, int rowVersion, UUID stationId, String stationCode) {}
    public record OrderDetails(OrderSummary order, List<OrderLine> items, List<KitchenTicket> tickets) {}
    public record OrderReceipt(UUID orderId, String code, String status, String channel, BigDecimal subtotal,
                               BigDecimal discount, BigDecimal total, String currency, int rowVersion, int itemCount,
                               boolean idempotentReplay) {}
}
