package com.wokasianfood.api.orders;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Creates commercial orders from the catalog and sends only unsent lines to kitchen. */
@Service
public class OperationalOrderService {
    private final JdbcTemplate jdbc;

    public OperationalOrderService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public OrderReceipt create(UUID actorId, CreateOrder command) {
        if (command.lines() == null || command.lines().isEmpty() || command.lines().size() > 50) {
            throw badRequest("El pedido debe incluir entre 1 y 50 productos.");
        }
        if ("DINE_IN".equals(command.orderType()) && command.diningSessionId() == null) {
            throw badRequest("Un pedido de mesa requiere una sesión abierta.");
        }
        if (command.diningSessionId() != null) {
            Integer open = jdbc.queryForObject("""
                SELECT count(*) FROM wok.dining_sessions WHERE id = ? AND status = 'OPEN'
                """, Integer.class, command.diningSessionId());
            if (open == null || open != 1) throw conflict("La sesión de mesa no está disponible.");
        }

        List<CatalogItem> items = new ArrayList<>();
        for (CreateLine line : command.lines()) {
            if (line.quantity() < 1 || line.quantity() > 50) throw badRequest("La cantidad de cada producto debe estar entre 1 y 50.");
            List<CatalogItem> found = jdbc.query("""
                SELECT mi.id, mi.name, mi.price, mi.currency_id, mi.preparation_area_id
                FROM wok.menu_items mi
                JOIN wok.items i ON i.id = mi.item_id
                WHERE mi.id = ? AND mi.status = 'ACTIVE' AND i.active = true
                  AND mi.visibility IN ('PUBLIC', 'STAFF')
                """, (rs, row) -> new CatalogItem(rs.getObject("id", UUID.class), rs.getString("name"),
                    rs.getBigDecimal("price"), rs.getObject("currency_id", UUID.class),
                    rs.getObject("preparation_area_id", UUID.class)), line.menuItemId());
            if (found.isEmpty()) throw unprocessable("Uno de los productos ya no está disponible.");
            items.add(found.getFirst());
        }

        UUID currencyId = items.getFirst().currencyId();
        if (items.stream().anyMatch(item -> !currencyId.equals(item.currencyId()))) {
            throw unprocessable("No se pueden mezclar monedas en un pedido.");
        }
        if (command.billId() != null) {
            List<BillState> bills = jdbc.query("""
                SELECT id, dining_session_id, currency_id, status FROM wok.bills WHERE id = ? FOR UPDATE
                """, (rs, row) -> new BillState(rs.getObject("id", UUID.class), rs.getObject("dining_session_id", UUID.class),
                    rs.getObject("currency_id", UUID.class), rs.getString("status")), command.billId());
            if (bills.isEmpty() || !"OPEN".equals(bills.getFirst().status())) throw conflict("La cuenta ya no está abierta.");
            BillState bill = bills.getFirst();
            if (!currencyId.equals(bill.currencyId()) || !command.diningSessionId().equals(bill.diningSessionId())) {
                throw conflict("La cuenta no corresponde a esta mesa o moneda.");
            }
        }
        UUID orderId = jdbc.queryForObject("""
            INSERT INTO wok.orders
              (dining_session_id, table_id, channel, order_type, currency_id, comments, created_by, updated_by)
            VALUES (?, ?, 'STAFF', ?, ?, ?, ?, ?)
            RETURNING id
            """, UUID.class, command.diningSessionId(), command.tableId(), command.orderType(), currencyId,
            clean(command.comments()), actorId, actorId);

        BigDecimal total = BigDecimal.ZERO;
        List<UUID> itemIds = new ArrayList<>();
        for (int index = 0; index < command.lines().size(); index++) {
            CreateLine input = command.lines().get(index);
            CatalogItem catalog = items.get(index);
            UUID orderItemId = jdbc.queryForObject("""
                INSERT INTO wok.order_items
                  (order_id, menu_item_id, item_name_snapshot, quantity, unit_price, notes, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class, orderId, catalog.id(), catalog.name(), input.quantity(), catalog.price(),
                clean(input.notes()), actorId, actorId);
            jdbc.update("""
                INSERT INTO wok.order_item_status_history(order_item_id, to_status, reason, actor_user_id)
                VALUES (?, 'DRAFT', 'ORDER_CREATED', ?)
                """, orderItemId, actorId);
            itemIds.add(orderItemId);
            if (command.billId() != null) {
                jdbc.update("""
                    INSERT INTO wok.bill_items(bill_id, order_item_id, description_snapshot, quantity, unit_price)
                    VALUES (?, ?, ?, ?, ?)
                    """, command.billId(), orderItemId, catalog.name(), input.quantity(), catalog.price());
            }
            total = total.add(catalog.price().multiply(BigDecimal.valueOf(input.quantity())));
        }
        if (command.billId() != null) {
            jdbc.update("INSERT INTO wok.bill_orders(bill_id, order_id) VALUES (?, ?)", command.billId(), orderId);
        }
        jdbc.update("""
            INSERT INTO wok.order_status_history(order_id, to_status, reason, actor_user_id)
            VALUES (?, 'DRAFT', 'ORDER_CREATED', ?)
            """, orderId, actorId);
        return new OrderReceipt(orderId, "DRAFT", currencyId, total, List.copyOf(itemIds));
    }

    @Transactional
    public OrderReceipt submit(UUID actorId, UUID orderId) {
        OrderState order = lockOrder(orderId);
        if ("CANCELLED".equals(order.status()) || "COMPLETED".equals(order.status())) {
            throw conflict("Ese pedido ya no acepta nuevas comandas.");
        }
        List<UnsentLine> unsent = jdbc.query("""
            SELECT oi.id, oi.quantity, mi.preparation_area_id
            FROM wok.order_items oi JOIN wok.menu_items mi ON mi.id = oi.menu_item_id
            WHERE oi.order_id = ? AND oi.status = 'DRAFT'
            ORDER BY oi.created_at, oi.id
            """, (rs, row) -> new UnsentLine(rs.getObject("id", UUID.class), rs.getInt("quantity"),
                rs.getObject("preparation_area_id", UUID.class)), orderId);
        if (unsent.isEmpty()) throw conflict("No hay productos nuevos para enviar a cocina.");

        Map<UUID, List<UnsentLine>> byArea = new HashMap<>();
        for (UnsentLine line : unsent) byArea.computeIfAbsent(line.preparationAreaId(), ignored -> new ArrayList<>()).add(line);
        for (Map.Entry<UUID, List<UnsentLine>> entry : byArea.entrySet()) {
            Integer nextSequence = jdbc.queryForObject("""
                SELECT coalesce(max(sequence_number), 0) + 1
                FROM wok.kitchen_tickets WHERE order_id = ? AND preparation_area_id = ?
                """, Integer.class, orderId, entry.getKey());
            UUID ticketId = jdbc.queryForObject("""
                INSERT INTO wok.kitchen_tickets(order_id, preparation_area_id, sequence_number, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, orderId, entry.getKey(), nextSequence, actorId, actorId);
            for (UnsentLine line : entry.getValue()) {
                jdbc.update("""
                    INSERT INTO wok.kitchen_ticket_items(kitchen_ticket_id, order_item_id, quantity, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?)
                    """, ticketId, line.orderItemId(), line.quantity(), actorId, actorId);
            }
        }
        jdbc.update("""
            INSERT INTO wok.order_item_status_history(order_item_id, from_status, to_status, reason, actor_user_id)
            SELECT id, 'DRAFT', 'SENT', 'SENT_TO_KITCHEN', ? FROM wok.order_items
            WHERE order_id = ? AND status = 'DRAFT'
            """, actorId, orderId);
        jdbc.update("""
            UPDATE wok.order_items SET status = 'SENT', sent_at = now(), updated_at = now(), updated_by = ?, row_version = row_version + 1
            WHERE order_id = ? AND status = 'DRAFT'
            """, actorId, orderId);
        if ("DRAFT".equals(order.status())) transitionOrder(orderId, "DRAFT", "SUBMITTED", "SENT_TO_KITCHEN", actorId);
        return receipt(orderId);
    }

    public List<KitchenTicket> kitchenQueue() {
        return jdbc.query("""
            SELECT kt.id, kt.order_id, pa.name AS preparation_area, kt.status, kt.sequence_number, kt.sent_at,
                   count(kti.id) AS line_count
            FROM wok.kitchen_tickets kt
            JOIN wok.preparation_areas pa ON pa.id = kt.preparation_area_id
            JOIN wok.kitchen_ticket_items kti ON kti.kitchen_ticket_id = kt.id
            WHERE kt.status IN ('QUEUED', 'IN_PROGRESS')
            GROUP BY kt.id, kt.order_id, pa.name, kt.status, kt.sequence_number, kt.sent_at
            ORDER BY kt.sent_at, kt.id
            """, (rs, row) -> new KitchenTicket(rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getString("preparation_area"), rs.getString("status"), rs.getInt("sequence_number"),
                rs.getTimestamp("sent_at").toInstant(), rs.getInt("line_count")));
    }

    @Transactional
    public KitchenTicket changeTicketStatus(UUID actorId, UUID ticketId, String targetStatus) {
        List<TicketState> tickets = jdbc.query("""
            SELECT id, order_id, status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE
            """, (rs, row) -> new TicketState(rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getString("status")), ticketId);
        if (tickets.isEmpty()) throw notFound("No encontramos esa comanda.");
        TicketState ticket = tickets.getFirst();
        if (!isValidTicketTransition(ticket.status(), targetStatus)) throw conflict("El cambio de estado no es válido para esta comanda.");
        jdbc.update("""
            UPDATE wok.kitchen_tickets
            SET status = ?, started_at = CASE WHEN ? = 'IN_PROGRESS' THEN now() ELSE started_at END,
                ready_at = CASE WHEN ? = 'READY' THEN now() ELSE ready_at END,
                updated_at = now(), updated_by = ?, row_version = row_version + 1
            WHERE id = ?
            """, targetStatus, targetStatus, targetStatus, actorId, ticketId);
        String itemStatus = "IN_PROGRESS".equals(targetStatus) ? "IN_PREPARATION" : "READY";
        jdbc.update("""
            INSERT INTO wok.order_item_status_history(order_item_id, from_status, to_status, reason, actor_user_id)
            SELECT oi.id, oi.status, ?, 'KITCHEN_TICKET_' || ?, ?
            FROM wok.order_items oi JOIN wok.kitchen_ticket_items kti ON kti.order_item_id = oi.id
            WHERE kti.kitchen_ticket_id = ? AND oi.status <> 'CANCELLED'
            """, itemStatus, targetStatus, actorId, ticketId);
        jdbc.update("""
            UPDATE wok.order_items oi SET status = ?, updated_at = now(), updated_by = ?, row_version = row_version + 1
            FROM wok.kitchen_ticket_items kti
            WHERE kti.kitchen_ticket_id = ? AND kti.order_item_id = oi.id AND oi.status <> 'CANCELLED'
            """, itemStatus, actorId, ticketId);
        if ("IN_PROGRESS".equals(targetStatus)) transitionIfChanged(ticket.orderId(), "IN_PREPARATION", "KITCHEN_STARTED", actorId);
        if ("READY".equals(targetStatus)) {
            Integer pending = jdbc.queryForObject("""
                SELECT count(*) FROM wok.kitchen_tickets
                WHERE order_id = ? AND status NOT IN ('READY', 'CANCELLED')
                """, Integer.class, ticket.orderId());
            if (pending != null && pending == 0) transitionIfChanged(ticket.orderId(), "READY", "KITCHEN_READY", actorId);
        }
        return jdbc.queryForObject("""
            SELECT kt.id, kt.order_id, pa.name, kt.status, kt.sequence_number, kt.sent_at,
                   (SELECT count(*) FROM wok.kitchen_ticket_items WHERE kitchen_ticket_id = kt.id)
            FROM wok.kitchen_tickets kt JOIN wok.preparation_areas pa ON pa.id = kt.preparation_area_id WHERE kt.id = ?
            """, (rs, row) -> new KitchenTicket(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3),
                rs.getString(4), rs.getInt(5), rs.getTimestamp(6).toInstant(), rs.getInt(7)), ticketId);
    }

    @Transactional
    public BillReceipt openBill(UUID actorId, OpenBill command) {
        Integer open = jdbc.queryForObject("""
            SELECT count(*) FROM wok.dining_sessions WHERE id = ? AND status = 'OPEN'
            """, Integer.class, command.diningSessionId());
        if (open == null || open != 1) throw conflict("La sesión de mesa no está disponible.");
        UUID billId = jdbc.queryForObject("""
            INSERT INTO wok.bills(dining_session_id, currency_id, name, created_by, updated_by)
            VALUES (?, (SELECT id FROM wok.currencies WHERE code = 'GTQ'), ?, ?, ?) RETURNING id
            """, UUID.class, command.diningSessionId(), clean(command.name()), actorId, actorId);
        return new BillReceipt(billId, "OPEN", command.diningSessionId(), clean(command.name()));
    }

    private OrderState lockOrder(UUID orderId) {
        List<OrderState> found = jdbc.query("""
            SELECT id, status FROM wok.orders WHERE id = ? FOR UPDATE
            """, (rs, row) -> new OrderState(rs.getObject("id", UUID.class), rs.getString("status")), orderId);
        if (found.isEmpty()) throw notFound("No encontramos ese pedido.");
        return found.getFirst();
    }

    private void transitionIfChanged(UUID orderId, String toStatus, String reason, UUID actorId) {
        List<String> current = jdbc.query("SELECT status FROM wok.orders WHERE id = ? FOR UPDATE", (rs, row) -> rs.getString(1), orderId);
        if (current.isEmpty() || toStatus.equals(current.getFirst())) return;
        transitionOrder(orderId, current.getFirst(), toStatus, reason, actorId);
    }

    private void transitionOrder(UUID orderId, String fromStatus, String toStatus, String reason, UUID actorId) {
        jdbc.update("""
            UPDATE wok.orders SET status = ?, accepted_at = CASE WHEN ? = 'ACCEPTED' THEN now() ELSE accepted_at END,
                updated_at = now(), updated_by = ?, row_version = row_version + 1 WHERE id = ?
            """, toStatus, toStatus, actorId, orderId);
        jdbc.update("""
            INSERT INTO wok.order_status_history(order_id, from_status, to_status, reason, actor_user_id)
            VALUES (?, ?, ?, ?, ?)
            """, orderId, fromStatus, toStatus, reason, actorId);
    }

    private OrderReceipt receipt(UUID orderId) {
        return jdbc.queryForObject("""
            SELECT o.id, o.status, o.currency_id, coalesce(sum(oi.unit_price * oi.quantity), 0) AS total
            FROM wok.orders o JOIN wok.order_items oi ON oi.order_id = o.id
            WHERE o.id = ? GROUP BY o.id, o.status, o.currency_id
            """, (rs, row) -> new OrderReceipt(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getObject("currency_id", UUID.class), rs.getBigDecimal("total"), List.of()), orderId);
    }

    private boolean isValidTicketTransition(String from, String to) {
        return ("QUEUED".equals(from) && "IN_PROGRESS".equals(to)) || ("IN_PROGRESS".equals(from) && "READY".equals(to));
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException unprocessable(String message) { return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, message); }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private ResponseStatusException notFound(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }

    public record CreateOrder(UUID diningSessionId, UUID billId, UUID tableId, String orderType, String comments, List<CreateLine> lines) {}
    public record CreateLine(UUID menuItemId, int quantity, String notes) {}
    public record OrderReceipt(UUID orderId, String status, UUID currencyId, BigDecimal total, List<UUID> orderItemIds) {}
    public record OpenBill(UUID diningSessionId, String name) {}
    public record BillReceipt(UUID billId, String status, UUID diningSessionId, String name) {}
    public record KitchenTicket(UUID ticketId, UUID orderId, String preparationArea, String status, int sequenceNumber,
                                Instant sentAt, int lineCount) {}
    private record CatalogItem(UUID id, String name, BigDecimal price, UUID currencyId, UUID preparationAreaId) {}
    private record UnsentLine(UUID orderItemId, int quantity, UUID preparationAreaId) {}
    private record OrderState(UUID id, String status) {}
    private record TicketState(UUID id, UUID orderId, String status) {}
    private record BillState(UUID id, UUID diningSessionId, UUID currencyId, String status) {}
}
