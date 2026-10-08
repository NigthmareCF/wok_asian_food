package com.wokasianfood.api.kitchen;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/kitchen")
@PreAuthorize("hasAuthority('kitchen:manage')")
public class KitchenController {
    private final KitchenService kitchen;

    public KitchenController(KitchenService kitchen) { this.kitchen = kitchen; }

    @GetMapping("/tickets")
    public List<KitchenService.TicketView> tickets(@RequestParam(required = false) UUID stationId,
                                                   @RequestParam(required = false) String status) {
        return kitchen.queue(stationId, status == null || status.isBlank() ? "OPEN" : status.trim().toUpperCase());
    }

    @GetMapping("/load")
    public List<KitchenService.StationLoad> load() {
        return kitchen.load();
    }

    @PostMapping("/tickets/{ticketId}/claim")
    public KitchenService.TicketView claim(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID ticketId,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId) {
        return kitchen.claim(UUID.fromString(jwt.getSubject()), requestId == null ? UUID.randomUUID() : requestId,
                ticketId);
    }

    @PatchMapping("/tickets/{ticketId}/status")
    public KitchenService.TicketView changeStatus(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID ticketId,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody TicketStatusRequest request) {
        return kitchen.changeStatus(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, ticketId, request);
    }

    public record TicketStatusRequest(@NotNull KitchenService.TicketStatus status, @Positive int expectedVersion,
                                      @Size(max = 300) String reason) {}
}

@Service
class KitchenService {
    private static final Map<TicketStatus, List<TicketStatus>> TRANSITIONS = Map.of(
            TicketStatus.QUEUED, List.of(TicketStatus.PREPARING, TicketStatus.CANCELLED),
            TicketStatus.PREPARING, List.of(TicketStatus.READY, TicketStatus.QUEUED, TicketStatus.CANCELLED),
            TicketStatus.READY, List.of(TicketStatus.RECALLED),
            TicketStatus.RECALLED, List.of(TicketStatus.PREPARING),
            TicketStatus.CANCELLED, List.of());

    private final JdbcTemplate jdbc;

    KitchenService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public enum TicketStatus { QUEUED, PREPARING, READY, RECALLED, CANCELLED }

    private static final String TICKET_SELECT = """
            SELECT t.id, t.order_id, o.code AS order_code, t.sequence_no, t.status, t.row_version, t.station_id,
                   pa.code AS station_code, t.claimed_by, t.claimed_at, t.ready_at, t.estimated_ready_at,
                   o.channel, tbl.name AS dining_table_name, a.name AS account_name,
                   COALESCE(ticket_items.item_count, 0) AS item_count,
                   COALESCE(ticket_items.total_quantity, 0) AS total_quantity,
                   ticket_items.oldest_created_at
            FROM wok.kitchen_tickets t
            JOIN wok.orders o ON o.id = t.order_id
            JOIN wok.order_accounts a ON a.id = o.account_id
            LEFT JOIN wok.dining_tables tbl ON tbl.id = o.dining_table_id
            JOIN wok.preparation_areas pa ON pa.id = t.station_id
            LEFT JOIN LATERAL (
                SELECT count(*) AS item_count, COALESCE(sum(quantity), 0) AS total_quantity,
                       min(created_at) AS oldest_created_at
                FROM wok.kitchen_ticket_items ti WHERE ti.ticket_id = t.id AND ti.action <> 'CANCELLED'
            ) ticket_items ON true
            """;
    private static final org.springframework.jdbc.core.RowMapper<TicketView> TICKET_MAPPER = (rs, row) ->
            new TicketView(
                rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class), rs.getString("order_code"),
                rs.getInt("sequence_no"), rs.getString("status"), rs.getInt("row_version"),
                rs.getObject("station_id", UUID.class), rs.getString("station_code"),
                rs.getObject("claimed_by", UUID.class),
                rs.getTimestamp("claimed_at") == null ? null : rs.getTimestamp("claimed_at").toInstant(),
                rs.getTimestamp("ready_at") == null ? null : rs.getTimestamp("ready_at").toInstant(),
                rs.getTimestamp("estimated_ready_at") == null ? null : rs.getTimestamp("estimated_ready_at").toInstant(),
                rs.getString("channel"), rs.getString("dining_table_name"), rs.getString("account_name"),
                rs.getInt("item_count"), rs.getInt("total_quantity"),
                rs.getTimestamp("oldest_created_at") == null ? null : rs.getTimestamp("oldest_created_at").toInstant(),
                List.of());

    List<TicketView> queue(UUID stationId, String status) {
        return jdbc.query(TICKET_SELECT + """
            WHERE (CAST(? AS uuid) IS NULL OR t.station_id = CAST(? AS uuid))
              AND (
                    (? = 'OPEN' AND t.status IN ('QUEUED', 'PREPARING', 'RECALLED'))
                 OR t.status = ?
              )
            ORDER BY t.created_at, t.sequence_no
            """, TICKET_MAPPER, stationId, stationId, status, status).stream().map(this::withItems).toList();
    }

    List<StationLoad> load() {
        return jdbc.query("""
            SELECT pa.id AS station_id, pa.code AS station_code,
                   COALESCE(counts.queued, 0) AS queued,
                   COALESCE(counts.preparing, 0) AS preparing,
                   COALESCE(counts.ready, 0) AS ready,
                   counts.oldest_created_at
            FROM wok.preparation_areas pa
            LEFT JOIN LATERAL (
                SELECT count(*) FILTER (WHERE status = 'QUEUED') AS queued,
                       count(*) FILTER (WHERE status = 'PREPARING') AS preparing,
                       count(*) FILTER (WHERE status = 'READY') AS ready,
                       min(created_at) FILTER (WHERE status IN ('QUEUED', 'PREPARING')) AS oldest_created_at
                FROM wok.kitchen_tickets t WHERE t.station_id = pa.id
            ) counts ON true
            WHERE pa.active = true
            ORDER BY pa.code
            """, (rs, row) -> new StationLoad(rs.getObject("station_id", UUID.class), rs.getString("station_code"),
                rs.getInt("queued"), rs.getInt("preparing"), rs.getInt("ready"),
                rs.getTimestamp("oldest_created_at") == null ? null
                    : rs.getTimestamp("oldest_created_at").toInstant()));
    }

    @Transactional
    public TicketView claim(UUID actor, UUID requestId, UUID ticketId) {
        TicketStatus current = lockStatus(ticketId);
        if (current != TicketStatus.QUEUED)
            throw new AuthException(409, "La comanda ya fue tomada por otra persona.");
        int changed = jdbc.update("""
            UPDATE wok.kitchen_tickets
            SET status = 'PREPARING', claimed_by = ?, claimed_at = now(), updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND status = 'QUEUED'
            """, actor, ticketId);
        if (changed != 1) throw new AuthException(409, "La comanda ya fue tomada por otra persona.");
        record(ticketId, null, TicketStatus.PREPARING, "CLAIMED_BY_STAFF", actor, requestId);
        startOrder(actor, requestId, ticketId);
        return view(ticketId);
    }

    @Transactional
    public TicketView changeStatus(UUID actor, UUID requestId, UUID ticketId,
                                   KitchenController.TicketStatusRequest request) {
        TicketStatus current = lockStatus(ticketId);
        if (!TRANSITIONS.getOrDefault(current, List.of()).contains(request.status()))
            throw new AuthException(409, "La comanda no puede pasar de " + current + " a " + request.status() + ".");

        int changed = jdbc.update("""
            UPDATE wok.kitchen_tickets
            SET status = ?,
                ready_at = CASE WHEN ? = 'READY' THEN now() ELSE ready_at END,
                claimed_by = CASE WHEN ? = 'QUEUED' THEN NULL ELSE claimed_by END,
                claimed_at = CASE WHEN ? = 'QUEUED' THEN NULL ELSE claimed_at END,
                updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND status = ? AND row_version = ?
            """, request.status().name(), request.status().name(), request.status().name(), request.status().name(),
                ticketId, current.name(), request.expectedVersion());
        if (changed != 1) throw new AuthException(409, "La comanda cambió. Actualiza la vista y vuelve a intentarlo.");

        record(ticketId, current, request.status(), request.reason(), actor, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, 'KITCHEN_TICKET_STATUS_CHANGED', 'KITCHEN_TICKET', ?,
                    jsonb_build_object('status', ?), jsonb_build_object('status', ?), ?, 'SUCCESS', ?)
            """, actor, ticketId, current.name(), request.status().name(), request.reason(), requestId);

        if (request.status() == TicketStatus.READY) releaseOrderIfReady(actor, requestId, ticketId);
        return view(ticketId);
    }

    private void startOrder(UUID actor, UUID requestId, UUID ticketId) {
        List<UUID> affected = jdbc.query("""
            UPDATE wok.orders SET status = 'PREPARING', updated_at = now(), updated_by = ?,
                row_version = row_version + 1
            WHERE id = (SELECT order_id FROM wok.kitchen_tickets WHERE id = ?) AND status = 'SENT'
            RETURNING id
            """, (rs, row) -> rs.getObject(1, UUID.class), actor, ticketId);
        for (UUID orderId : affected) {
            jdbc.update("""
                INSERT INTO wok.order_status_history (order_id, from_status, to_status, reason, actor_user_id, request_id)
                VALUES (?, 'SENT', 'PREPARING', 'KITCHEN_STARTED', ?, ?)
                """, orderId, actor, requestId);
        }
    }

    private void releaseOrderIfReady(UUID actor, UUID requestId, UUID ticketId) {
        List<UUID> readyOrders = jdbc.query("""
            SELECT t.order_id FROM wok.kitchen_tickets t
            WHERE t.order_id = (SELECT order_id FROM wok.kitchen_tickets WHERE id = ?)
              AND t.status NOT IN ('READY', 'CANCELLED')
            """, (rs, row) -> rs.getObject("order_id", UUID.class), ticketId);
        if (!readyOrders.isEmpty()) return;
        List<UUID> promoted = jdbc.query("""
            UPDATE wok.orders SET status = 'READY', updated_at = now(), updated_by = ?,
                row_version = row_version + 1
            WHERE id = (SELECT order_id FROM wok.kitchen_tickets WHERE id = ?) AND status = 'PREPARING'
            RETURNING id
            """, (rs, row) -> rs.getObject(1, UUID.class), actor, ticketId);
        for (UUID orderId : promoted) {
            jdbc.update("""
                INSERT INTO wok.order_status_history (order_id, from_status, to_status, reason, actor_user_id, request_id)
                VALUES (?, 'PREPARING', 'READY', 'ALL_STATIONS_READY', ?, ?)
                """, orderId, actor, requestId);
            List<UUID> dispatches = jdbc.query("""
                UPDATE wok.delivery_dispatches
                SET status = 'READY_FOR_DISPATCH', updated_at = now(), row_version = row_version + 1
                WHERE order_id = ? AND status = 'AWAITING_KITCHEN'
                RETURNING id
                """, (rs, row) -> rs.getObject(1, UUID.class), orderId);
            for (UUID dispatchId : dispatches) {
                jdbc.update("""
                    INSERT INTO wok.delivery_dispatch_events
                        (dispatch_id, from_status, to_status, actor_user_id, reason, request_id)
                    VALUES (?, 'AWAITING_KITCHEN', 'READY_FOR_DISPATCH', ?, 'ALL_KITCHEN_TICKETS_READY', ?)
                    """, dispatchId, actor, requestId);
            }
        }
    }

    private void record(UUID ticketId, TicketStatus from, TicketStatus to, String reason, UUID actor, UUID requestId) {
        jdbc.update("""
            INSERT INTO wok.kitchen_ticket_status_history (ticket_id, from_status, to_status, reason, actor_user_id, request_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """, ticketId, from == null ? null : from.name(), to.name(),
                reason == null || reason.isBlank() ? null : reason.trim(), actor, requestId);
    }

    private TicketStatus lockStatus(UUID ticketId) {
        List<TicketStatus> rows = jdbc.query("""
            SELECT status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE
            """, (rs, row) -> TicketStatus.valueOf(rs.getString("status")), ticketId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la comanda.");
        return rows.getFirst();
    }

    private TicketView view(UUID ticketId) {
        return jdbc.query(TICKET_SELECT + " WHERE t.id = ?", TICKET_MAPPER, ticketId).stream().findFirst()
                .map(this::withItems).orElseThrow(() -> new AuthException(404, "No encontramos la comanda."));
    }

    private TicketView withItems(TicketView ticket) {
        List<TicketLineRow> rows = jdbc.query("""
            SELECT ti.id AS ticket_item_id, i.id AS order_item_id, i.name_snapshot, ti.quantity, ti.action,
                   i.fulfillment, i.notes
            FROM wok.kitchen_ticket_items ti
            JOIN wok.order_items i ON i.id = ti.order_item_id
            WHERE ti.ticket_id = ? AND ti.action <> 'CANCELLED'
            ORDER BY ti.created_at, ti.id
            """, (rs, row) -> new TicketLineRow(rs.getObject("ticket_item_id", UUID.class),
                rs.getObject("order_item_id", UUID.class), rs.getString("name_snapshot"), rs.getInt("quantity"),
                rs.getString("action"), rs.getString("fulfillment"), rs.getString("notes")), ticket.id());
        Map<UUID, List<TicketModifier>> modifiersByItem = new java.util.HashMap<>();
        jdbc.query("""
            SELECT selected.order_item_id, selected.group_name_snapshot, selected.modifier_name_snapshot,
                   selected.price_delta
            FROM wok.order_item_modifiers selected
            WHERE selected.order_item_id IN (
                SELECT order_item_id FROM wok.kitchen_ticket_items
                WHERE ticket_id = ? AND action <> 'CANCELLED'
            )
            ORDER BY selected.order_item_id, selected.group_name_snapshot,
                     selected.modifier_name_snapshot, selected.modifier_id
            """, (rs, row) -> new TicketModifierRow(rs.getObject("order_item_id", UUID.class), new TicketModifier(
                    rs.getString("group_name_snapshot"), rs.getString("modifier_name_snapshot"),
                    rs.getBigDecimal("price_delta"))), ticket.id()).forEach(modifier ->
                modifiersByItem.computeIfAbsent(modifier.orderItemId(), ignored -> new java.util.ArrayList<>())
                        .add(modifier.modifier()));
        List<TicketLineItem> items = rows.stream().map(item -> new TicketLineItem(item.ticketItemId(),
                item.orderItemId(), item.name(), item.quantity(), item.action(), item.fulfillment(), item.notes(),
                modifiersByItem.getOrDefault(item.orderItemId(), List.of()))).toList();
        return ticket.withItems(items);
    }

    private record TicketLineRow(UUID ticketItemId, UUID orderItemId, String name, int quantity, String action,
                                 String fulfillment, String notes) {}
    private record TicketModifierRow(UUID orderItemId, TicketModifier modifier) {}

    public record TicketView(UUID id, UUID orderId, String orderCode, int sequence, String status, int rowVersion,
                             UUID stationId, String stationCode, UUID claimedBy, Instant claimedAt, Instant readyAt,
                             Instant estimatedReadyAt, String channel, String diningTableName, String accountName,
                             int itemCount, int totalQuantity, Instant oldestItemAt, List<TicketLineItem> items) {
        public TicketView(UUID id, UUID orderId, String orderCode, int sequence, String status, int rowVersion,
                          UUID stationId, String stationCode, UUID claimedBy, Instant claimedAt, Instant readyAt,
                          Instant estimatedReadyAt, String channel, String diningTableName, String accountName,
                          int itemCount, int totalQuantity, Instant oldestItemAt) {
            this(id, orderId, orderCode, sequence, status, rowVersion, stationId, stationCode, claimedBy, claimedAt,
                    readyAt, estimatedReadyAt, channel, diningTableName, accountName, itemCount, totalQuantity,
                    oldestItemAt, List.of());
        }
        TicketView withItems(List<TicketLineItem> items) {
            return new TicketView(id, orderId, orderCode, sequence, status, rowVersion, stationId, stationCode,
                    claimedBy, claimedAt, readyAt, estimatedReadyAt, channel, diningTableName, accountName,
                    itemCount, totalQuantity, oldestItemAt, items);
        }
    }
    public record TicketLineItem(UUID ticketItemId, UUID orderItemId, String name, int quantity, String action,
                                 String fulfillment, String notes, List<TicketModifier> modifiers) {}
    public record TicketModifier(String group, String name, java.math.BigDecimal priceDelta) {}
    public record StationLoad(UUID stationId, String stationCode, int queued, int preparing, int ready,
                              Instant oldestQueuedAt) {}
}
