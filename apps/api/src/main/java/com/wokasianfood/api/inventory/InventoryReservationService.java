package com.wokasianfood.api.inventory;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reserva, libera y consume inventario para pedidos. Se invoca dentro de la transaccion del pedido
 * para que confirmacion, lineas, comandas y reservas sean indivisibles.
 */
@Service
public class InventoryReservationService {
    private final JdbcTemplate jdbc;

    public InventoryReservationService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public void reserve(UUID actor, UUID requestId, UUID orderId, List<Line> lines) {
        Map<UUID, BigDecimal> required = requirements(lines);
        if (required.isEmpty()) return;
        List<UUID> itemIds = new ArrayList<>(required.keySet());
        Collections.sort(itemIds);
        for (UUID itemId : itemIds) {
            jdbc.update("""
                INSERT INTO wok.inventory_balances (item_id) VALUES (?)
                ON CONFLICT (item_id) DO NOTHING
                """, itemId);
        }
        for (UUID itemId : itemIds) {
            BigDecimal onHand = lockBalance(itemId);
            BigDecimal reserved = jdbc.queryForObject("""
                SELECT COALESCE(SUM(quantity), 0) FROM wok.inventory_reservations
                WHERE item_id = ? AND status = 'ACTIVE'
                """, BigDecimal.class, itemId);
            BigDecimal held = jdbc.queryForObject("""
                SELECT COALESCE(sum(i.quantity),0) + COALESCE((SELECT sum(ri.quantity)
                 FROM wok.reservation_capacity_hold_inventory ri JOIN wok.reservation_capacity_holds rh ON rh.id=ri.hold_id
                 WHERE ri.item_id=? AND rh.status='ACTIVE' AND rh.expires_at>now()),0) FROM wok.order_capacity_hold_inventory i
                JOIN wok.order_capacity_holds h ON h.id=i.hold_id
                WHERE i.item_id=? AND h.status='ACTIVE' AND h.expires_at>now()
                """,BigDecimal.class,itemId,itemId);
            reserved = (reserved == null ? BigDecimal.ZERO : reserved).add(held);
            BigDecimal need = required.get(itemId);
            if (onHand.subtract(reserved == null ? BigDecimal.ZERO : reserved).compareTo(need) < 0)
                throw new AuthException(409, "No hay stock suficiente para " + itemName(itemId) + ".");
            int updated = jdbc.update("""
                UPDATE wok.inventory_reservations
                SET quantity = quantity + ?, updated_at = now()
                WHERE order_id = ? AND item_id = ? AND status = 'ACTIVE'
                """, need, orderId, itemId);
            if (updated == 0) {
                jdbc.update("""
                    INSERT INTO wok.inventory_reservations (order_id, item_id, quantity)
                    VALUES (?, ?, ?)
                    """, orderId, itemId, need);
            }
        }
    }

    @Transactional
    public void release(UUID orderId) {
        List<UUID> itemIds = jdbc.query("""
            SELECT item_id FROM wok.inventory_reservations
            WHERE order_id = ? AND status = 'ACTIVE' ORDER BY item_id
            """, (rs, row) -> rs.getObject(1, UUID.class), orderId);
        itemIds.forEach(this::lockBalance);
        jdbc.update("""
            UPDATE wok.inventory_reservations
            SET status = 'RELEASED', updated_at = now()
            WHERE order_id = ? AND status = 'ACTIVE'
            """, orderId);
    }

    @Transactional
    public void consume(UUID actor, UUID requestId, UUID orderId) {
        List<Reservation> reservations = jdbc.query("""
            SELECT item_id, quantity FROM wok.inventory_reservations
            WHERE order_id = ? AND status = 'ACTIVE' ORDER BY item_id
            """, (rs, row) -> new Reservation(rs.getObject("item_id", UUID.class), rs.getBigDecimal("quantity")),
            orderId);
        if (reservations.isEmpty()) return;
        for (Reservation reservation : reservations) {
            lockBalance(reservation.itemId());
            int inserted = jdbc.update("""
                INSERT INTO wok.inventory_movements
                    (item_id, movement_type, quantity_delta, reason, order_id, responsible_user_id, request_id)
                VALUES (?, 'CONSUMPTION', ?, 'Consumo por pedido', ?, ?, ?)
                ON CONFLICT (order_id, item_id) WHERE movement_type = 'CONSUMPTION' DO NOTHING
                """, reservation.itemId(), reservation.quantity().negate(), orderId, actor, requestId);
            if (inserted == 0) continue;
            int changed = jdbc.update("""
                UPDATE wok.inventory_balances
                SET quantity_on_hand = quantity_on_hand - ?, updated_at = now(), row_version = row_version + 1
                WHERE item_id = ? AND quantity_on_hand >= ?
                """, reservation.quantity(), reservation.itemId(), reservation.quantity());
            if (changed != 1)
                throw new AuthException(409, "El inventario quedó inconsistente al consumir el pedido.");
        }
        jdbc.update("""
            UPDATE wok.inventory_reservations
            SET status = 'CONSUMED', updated_at = now()
            WHERE order_id = ? AND status = 'ACTIVE'
            """, orderId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'INVENTORY_CONSUMED', 'ORDER', ?,
                    jsonb_build_object('items', ?), 'SUCCESS', ?)
            """, actor, orderId, reservations.size(), requestId);
    }

    private Map<UUID, BigDecimal> requirements(List<Line> lines) {
        return InventoryRequirements.calculate(jdbc, lines);
    }

    private BigDecimal lockBalance(UUID itemId) {
        List<BigDecimal> rows = jdbc.query("""
            SELECT quantity_on_hand FROM wok.inventory_balances WHERE item_id = ? FOR UPDATE
            """, (rs, row) -> rs.getBigDecimal(1), itemId);
        if (rows.isEmpty()) throw new AuthException(409, "El item de inventario dejó de estar disponible.");
        return rows.getFirst();
    }

    private String itemName(UUID itemId) {
        List<String> names = jdbc.query("SELECT name FROM wok.items WHERE id = ?",
                (rs, row) -> rs.getString(1), itemId);
        return names.isEmpty() ? itemId.toString() : names.getFirst();
    }

    public record Line(UUID menuItemId, int quantity, List<UUID> modifierIds) {
        public Line(UUID menuItemId,int quantity) { this(menuItemId,quantity,List.of()); }
        public Line { modifierIds=modifierIds==null?List.of():List.copyOf(modifierIds); }
    }
    private record Component(UUID itemId, BigDecimal quantity) {}
    private record Reservation(UUID itemId, BigDecimal quantity) {}
}
