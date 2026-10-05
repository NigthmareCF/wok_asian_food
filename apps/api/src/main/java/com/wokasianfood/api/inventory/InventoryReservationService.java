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

    /** Applies selected catalog option inventory deltas on top of recipe reservations. */
    @Transactional
    public void reserveModifierImpacts(UUID actor, UUID requestId, UUID orderId, UUID orderRequestId) {
        List<Adjustment> adjustments = jdbc.query("""
            SELECT impact.item_id, sum(impact.quantity_delta * request_item.quantity) AS quantity_delta
            FROM wok.order_request_items request_item
            JOIN wok.order_request_item_modifiers selected ON selected.order_request_item_id = request_item.id
            JOIN wok.modifier_item_impacts impact ON impact.modifier_id = selected.modifier_id
                AND impact.affects_availability = true
            WHERE request_item.order_request_id = ?
            GROUP BY impact.item_id
            HAVING sum(impact.quantity_delta * request_item.quantity) <> 0
            ORDER BY impact.item_id
            """, (rs, row) -> new Adjustment(rs.getObject("item_id", UUID.class),
                rs.getBigDecimal("quantity_delta")), orderRequestId);
        for (Adjustment adjustment : adjustments) {
            jdbc.update("""
                INSERT INTO wok.inventory_balances (item_id) VALUES (?)
                ON CONFLICT (item_id) DO NOTHING
                """, adjustment.itemId());
            BigDecimal onHand = lockBalance(adjustment.itemId());
            BigDecimal currentlyReserved = jdbc.queryForObject("""
                SELECT COALESCE(sum(quantity), 0) FROM wok.inventory_reservations
                WHERE order_id = ? AND item_id = ? AND status = 'ACTIVE'
                """, BigDecimal.class, orderId, adjustment.itemId());
            BigDecimal nextQuantity = currentlyReserved.add(adjustment.quantityDelta());
            if (nextQuantity.signum() < 0)
                throw new AuthException(422, "La configuración de inventario de una opción seleccionada no es válida.");
            if (adjustment.quantityDelta().signum() > 0) {
                BigDecimal reservedAcrossOrders = jdbc.queryForObject("""
                    SELECT COALESCE(sum(quantity), 0) FROM wok.inventory_reservations
                    WHERE item_id = ? AND status = 'ACTIVE'
                    """, BigDecimal.class, adjustment.itemId());
                if (onHand.subtract(reservedAcrossOrders == null ? BigDecimal.ZERO : reservedAcrossOrders)
                        .compareTo(adjustment.quantityDelta()) < 0)
                    throw new AuthException(409, "No hay stock suficiente para " + itemName(adjustment.itemId()) + ".");
            }
            if (currentlyReserved.signum() == 0 && nextQuantity.signum() > 0) {
                jdbc.update("""
                    INSERT INTO wok.inventory_reservations (order_id, item_id, quantity)
                    VALUES (?, ?, ?)
                    """, orderId, adjustment.itemId(), nextQuantity);
            } else if (currentlyReserved.signum() > 0) {
                jdbc.update("""
                    UPDATE wok.inventory_reservations
                    SET quantity = ?, status = CASE WHEN ? = 0 THEN 'RELEASED' ELSE 'ACTIVE' END, updated_at = now()
                    WHERE order_id = ? AND item_id = ? AND status = 'ACTIVE'
                    """, nextQuantity, nextQuantity, orderId, adjustment.itemId());
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
        Map<UUID, BigDecimal> required = new LinkedHashMap<>();
        for (Line line : lines) {
            List<Component> components = jdbc.query("""
                SELECT rc.component_item_id, rc.quantity
                FROM wok.item_recipe_components rc
                JOIN wok.menu_items mi ON mi.item_id = rc.parent_item_id
                WHERE mi.id = ?
                """, (rs, row) -> new Component(rs.getObject("component_item_id", UUID.class),
                    rs.getBigDecimal("quantity")), line.menuItemId());
            for (Component component : components) {
                BigDecimal needed = component.quantity().multiply(BigDecimal.valueOf(line.quantity()));
                required.merge(component.itemId(), needed, BigDecimal::add);
            }
        }
        return required;
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

    public record Line(UUID menuItemId, int quantity) {}
    private record Adjustment(UUID itemId, BigDecimal quantityDelta) {}
    private record Component(UUID itemId, BigDecimal quantity) {}
    private record Reservation(UUID itemId, BigDecimal quantity) {}
}
