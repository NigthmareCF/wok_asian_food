package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.catalog.ModifierSelectionService.SelectedModifier;
import com.wokasianfood.api.platform.RequestLimits;
import com.wokasianfood.api.inventory.InventoryReservationService;
import com.wokasianfood.api.platform.IdempotencyStore;
import com.wokasianfood.api.service.ServiceHoursPolicy;
import jakarta.validation.Valid;
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
                SELECT count(*) AS item_count FROM wok.order_items i WHERE i.order_id = o.id
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
                   (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id) AS item_count
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
                   i.preparation_area_id, pa.code AS preparation_area_code
            FROM wok.order_items i
            JOIN wok.preparation_areas pa ON pa.id = i.preparation_area_id
            WHERE i.order_id = ? ORDER BY pa.code, i.created_at, i.id
            """, (rs, row) -> new OrderLine(rs.getObject("id", UUID.class), rs.getString("name_snapshot"),
                rs.getInt("quantity"), rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"),
                rs.getString("fulfillment"), rs.getString("notes"), rs.getObject("preparation_area_id", UUID.class),
                rs.getString("preparation_area_code"), List.of()), orderId);
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
                item.stationCode(), modifiersByItem.getOrDefault(item.id(), List.of()))).toList();
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
            reservations.release(orderId);
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
                .map(line -> new InventoryReservationService.Line(line.product().id(), line.quantity()))
                .toList());
    }

    private void reserveModifierStock(UUID actor, UUID requestId, UUID orderId, List<NewLine> newLines) {
        reservations.reserveOperationalModifierImpacts(actor, requestId, orderId,
                newLines.stream().map(NewLine::orderItemId).toList());
    }

    private OrderSummary summary(UUID orderId) {
        List<OrderSummary> found = jdbc.query("""
            SELECT o.id, o.code, o.status, o.channel, o.subtotal, o.discount, o.total, o.guest_count, o.opened_at,
                   o.closed_at, o.row_version, o.currency_id, c.code AS currency_code,
                   t.id AS dining_table_id, t.name AS dining_table_name,
                   a.id AS account_id, a.name AS account_name,
                   (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id) AS item_count
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
                 fulfillment, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """, UUID.class, orderId, product.id(), product.name(), line.quantity(), unitPrice,
                product.preparationAreaId(), line.fulfillment() == null ? "DINE_IN"
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
            FROM (SELECT COALESCE(sum(line_total), 0) AS subtotal FROM wok.order_items WHERE order_id = ?)
                totals
            WHERE o.id = ? AND o.subtotal <> totals.subtotal
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

    public record OrderSummary(UUID id, String code, String status, String channel, BigDecimal subtotal,
                               BigDecimal discount, BigDecimal total, int guestCount, Instant openedAt, Instant closedAt,
                               int rowVersion, UUID currencyId, String currency, UUID diningTableId,
                               String diningTableName, UUID accountId, String accountName, int itemCount) {}
    public record OrderLine(UUID id, String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                            String fulfillment, String notes, UUID preparationAreaId, String stationCode,
                            List<OrderModifier> modifiers) {
        public OrderLine(UUID id, String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                         String fulfillment, String notes, UUID preparationAreaId, String stationCode) {
            this(id, name, quantity, unitPrice, lineTotal, fulfillment, notes, preparationAreaId, stationCode,
                    List.of());
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
