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
        Map<UUID, Map<UUID, BigDecimal>> byOrderItem = requirementsByOrderItem(lines);
        Map<UUID, BigDecimal> required = new LinkedHashMap<>();
        byOrderItem.values().forEach(resources -> resources.forEach(
                (itemId, quantity) -> required.merge(itemId, quantity, BigDecimal::add)));
        byOrderItem.forEach((orderItemId, resources) -> resources.forEach(
                (itemId, quantity) -> recordResourceDelta(orderItemId, itemId, quantity)));
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

    /** Applies modifier inventory deltas for newly inserted operational order lines only. */
    @Transactional
    public void reserveOperationalModifierImpacts(UUID actor, UUID requestId, UUID orderId, List<UUID> orderItemIds) {
        if (orderItemIds == null || orderItemIds.isEmpty()) return;
        String placeholders = String.join(",", Collections.nCopies(orderItemIds.size(), "?"));
        List<LineAdjustment> lineAdjustments = jdbc.query("""
            SELECT item.id AS order_item_id, impact.item_id,
                   sum(impact.quantity_delta * item.quantity) AS quantity_delta
            FROM wok.order_items item
            JOIN wok.order_item_modifiers selected ON selected.order_item_id = item.id
            JOIN wok.modifier_item_impacts impact ON impact.modifier_id = selected.modifier_id
                AND impact.affects_availability = true
            WHERE item.id IN (%s)
            GROUP BY item.id, impact.item_id
            HAVING sum(impact.quantity_delta * item.quantity) <> 0
            ORDER BY item.id, impact.item_id
            """.formatted(placeholders), (rs, row) -> new LineAdjustment(
                rs.getObject("order_item_id", UUID.class), rs.getObject("item_id", UUID.class),
                rs.getBigDecimal("quantity_delta")), orderItemIds.toArray());
        Map<UUID, BigDecimal> aggregate = new LinkedHashMap<>();
        lineAdjustments.forEach(line -> aggregate.merge(line.itemId(), line.quantityDelta(), BigDecimal::add));
        applyModifierAdjustments(orderId, aggregate.entrySet().stream()
                .map(entry -> new Adjustment(entry.getKey(), entry.getValue())).toList());
        lineAdjustments.forEach(line -> recordResourceDelta(line.orderItemId(), line.itemId(), line.quantityDelta()));
    }

    @Transactional
    public void completeResourceSnapshots(List<UUID> orderItemIds) {
        if (orderItemIds == null || orderItemIds.isEmpty()) return;
        String placeholders = String.join(",", Collections.nCopies(orderItemIds.size(), "?"));
        jdbc.update("UPDATE wok.order_items SET resource_snapshot_complete = true WHERE id IN (%s)"
                .formatted(placeholders), orderItemIds.toArray());
    }

    @Transactional
    public List<ResourceDelta> releaseOrderItem(UUID orderId, UUID orderItemId) {
        List<ResourceDelta> deltas = jdbc.query("""
            SELECT item_id, quantity_delta FROM wok.order_item_resource_reservations
            WHERE order_item_id = ? ORDER BY item_id
            """, (rs, row) -> new ResourceDelta(rs.getObject("item_id", UUID.class),
                rs.getBigDecimal("quantity_delta")), orderItemId);
        for (ResourceDelta delta : deltas) lockBalance(delta.itemId());
        for (ResourceDelta delta : deltas) {
            if (delta.quantityDelta().signum() == 0) continue;
            List<BigDecimal> reservedRows = jdbc.query("""
                SELECT quantity FROM wok.inventory_reservations
                WHERE order_id = ? AND item_id = ? AND status = 'ACTIVE' FOR UPDATE
                """, (rs, row) -> rs.getBigDecimal(1), orderId, delta.itemId());
            BigDecimal current = reservedRows.isEmpty() ? BigDecimal.ZERO : reservedRows.getFirst();
            BigDecimal next = current.subtract(delta.quantityDelta());
            if (next.signum() < 0)
                throw new AuthException(409, "La reserva de inventario ya no coincide con el detalle del pedido.");
            if (next.compareTo(current) > 0) {
                BigDecimal onHand = lockBalance(delta.itemId());
                BigDecimal reservedAcrossOrders = jdbc.queryForObject("""
                    SELECT COALESCE(sum(quantity), 0) FROM wok.inventory_reservations
                    WHERE item_id = ? AND status = 'ACTIVE'
                    """, BigDecimal.class, delta.itemId());
                if (onHand.subtract(reservedAcrossOrders == null ? BigDecimal.ZERO : reservedAcrossOrders)
                        .compareTo(next.subtract(current)) < 0)
                    throw new AuthException(409, "No hay stock disponible para ajustar la reserva de este pedido.");
            }
            if (reservedRows.isEmpty() && next.signum() > 0) {
                jdbc.update("""
                    INSERT INTO wok.inventory_reservations(order_id, item_id, quantity, status)
                    VALUES (?, ?, ?, 'ACTIVE')
                    """, orderId, delta.itemId(), next);
            } else if (!reservedRows.isEmpty()) {
                jdbc.update("""
                    UPDATE wok.inventory_reservations SET quantity = ?,
                        status = CASE WHEN ? = 0 THEN 'RELEASED' ELSE 'ACTIVE' END, updated_at = now()
                    WHERE order_id = ? AND item_id = ? AND status = 'ACTIVE'
                    """, next, next, orderId, delta.itemId());
            }
        }
        return deltas;
    }

    /** Adjusts the captured per-line resource snapshot proportionally, without re-reading mutable recipes. */
    @Transactional
    public List<ResourceDelta> adjustOrderItemQuantity(UUID orderId, UUID orderItemId, int previousQuantity,
            int nextQuantity) {
        if (previousQuantity <= 0 || nextQuantity <= 0 || previousQuantity == nextQuantity)
            throw new AuthException(422, "La cantidad solicitada no es válida.");
        List<ResourceDelta> current = jdbc.query("""
            SELECT item_id, quantity_delta FROM wok.order_item_resource_reservations
            WHERE order_item_id = ? ORDER BY item_id
            """, (rs, row) -> new ResourceDelta(rs.getObject("item_id", UUID.class), rs.getBigDecimal("quantity_delta")),
            orderItemId);
        List<ResourceDelta> adjusted = current.stream().map(delta -> new ResourceDelta(delta.itemId(),
                delta.quantityDelta().multiply(BigDecimal.valueOf(nextQuantity))
                        .divide(BigDecimal.valueOf(previousQuantity), 6, java.math.RoundingMode.HALF_UP))).toList();
        for (ResourceDelta delta : adjusted) lockBalance(delta.itemId());
        for (int index = 0; index < current.size(); index++) {
            ResourceDelta before = current.get(index);
            BigDecimal after = adjusted.get(index).quantityDelta();
            BigDecimal change = after.subtract(before.quantityDelta());
            if (change.signum() == 0) continue;
            List<BigDecimal> rows = jdbc.query("""
                SELECT quantity FROM wok.inventory_reservations
                WHERE order_id = ? AND item_id = ? AND status = 'ACTIVE' FOR UPDATE
                """, (rs, row) -> rs.getBigDecimal(1), orderId, before.itemId());
            BigDecimal reserved = rows.isEmpty() ? BigDecimal.ZERO : rows.getFirst();
            BigDecimal nextReserved = reserved.add(change);
            if (nextReserved.signum() < 0)
                throw new AuthException(409, "La reserva de inventario ya no coincide con la línea del pedido.");
            if (change.signum() > 0) {
                BigDecimal onHand = lockBalance(before.itemId());
                BigDecimal reservedAcrossOrders = jdbc.queryForObject("""
                    SELECT COALESCE(sum(quantity), 0) FROM wok.inventory_reservations
                    WHERE item_id = ? AND status = 'ACTIVE'
                    """, BigDecimal.class, before.itemId());
                if (onHand.subtract(reservedAcrossOrders == null ? BigDecimal.ZERO : reservedAcrossOrders).compareTo(change) < 0)
                    throw new AuthException(409, "No hay stock suficiente para " + itemName(before.itemId()) + ".");
            }
            if (rows.isEmpty() && nextReserved.signum() > 0) {
                jdbc.update("""
                    INSERT INTO wok.inventory_reservations(order_id, item_id, quantity) VALUES (?, ?, ?)
                    """, orderId, before.itemId(), nextReserved);
            } else if (!rows.isEmpty()) {
                jdbc.update("""
                    UPDATE wok.inventory_reservations SET quantity = ?,
                        status = CASE WHEN ? = 0 THEN 'RELEASED' ELSE 'ACTIVE' END, updated_at = now()
                    WHERE order_id = ? AND item_id = ? AND status = 'ACTIVE'
                    """,
                    nextReserved, nextReserved, orderId, before.itemId());
            }
            jdbc.update("""
                UPDATE wok.order_item_resource_reservations SET quantity_delta = ?
                WHERE order_item_id = ? AND item_id = ?
                """, after, orderItemId, before.itemId());
        }
        return adjusted;
    }

    private void applyModifierAdjustments(UUID orderId, List<Adjustment> adjustments) {
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

    /** Material reserved before kitchen start is released; material reserved after start is accounted as waste. */
    @Transactional
    public void consumeAsWaste(UUID actor, UUID requestId, UUID orderId) {
        List<Reservation> reservations = jdbc.query("""
            SELECT item_id, quantity FROM wok.inventory_reservations
            WHERE order_id = ? AND status = 'ACTIVE' ORDER BY item_id
            """, (rs, row) -> new Reservation(rs.getObject("item_id", UUID.class), rs.getBigDecimal("quantity")),
            orderId);
        for (Reservation reservation : reservations) lockBalance(reservation.itemId());
        for (Reservation reservation : reservations) {
            int inserted = jdbc.update("""
                INSERT INTO wok.inventory_movements
                    (item_id, movement_type, quantity_delta, reason, order_id, responsible_user_id, request_id)
                VALUES (?, 'WASTE', ?, 'Merma por cancelación después del inicio de cocina', ?, ?, ?)
                ON CONFLICT (order_id, item_id, request_id)
                    WHERE movement_type = 'WASTE' AND order_id IS NOT NULL AND request_id IS NOT NULL
                DO NOTHING
                """, reservation.itemId(), reservation.quantity().negate(), orderId, actor, requestId);
            if (inserted == 0) continue;
            int changed = jdbc.update("""
                UPDATE wok.inventory_balances
                SET quantity_on_hand = quantity_on_hand - ?, updated_at = now(), row_version = row_version + 1
                WHERE item_id = ? AND quantity_on_hand >= ?
                """, reservation.quantity(), reservation.itemId(), reservation.quantity());
            if (changed != 1) throw new AuthException(409, "El inventario quedó inconsistente al registrar la merma.");
        }
        jdbc.update("""
            UPDATE wok.inventory_reservations
            SET status = 'CONSUMED', updated_at = now()
            WHERE order_id = ? AND status = 'ACTIVE'
            """, orderId);
        if (!reservations.isEmpty()) jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, reason, result, request_id)
            VALUES (?, 'INVENTORY_WASTED', 'ORDER', ?, jsonb_build_object('items', ?),
                    'CANCELLED_AFTER_KITCHEN_START', 'SUCCESS', ?)
            """, actor, orderId, reservations.size(), requestId);
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

    private Map<UUID, Map<UUID, BigDecimal>> requirementsByOrderItem(List<Line> lines) {
        Map<UUID, Map<UUID, BigDecimal>> byOrderItem = new LinkedHashMap<>();
        for (Line line : lines) {
            if (line.orderItemId() == null) throw new AuthException(422, "Falta vincular el recurso con su línea de pedido.");
            List<UUID> menuItems = jdbc.query("""
                SELECT id FROM wok.menu_items WHERE id = ? FOR SHARE
                """, (rs, row) -> rs.getObject("id", UUID.class), line.menuItemId());
            if (menuItems.isEmpty()) throw new AuthException(409, "El producto dejó de estar disponible.");
            List<Component> components = jdbc.query("""
                SELECT rc.component_item_id, rc.quantity
                FROM wok.item_recipe_components rc
                JOIN wok.menu_items mi ON mi.item_id = rc.parent_item_id
                WHERE mi.id = ? AND mi.recipe_status = 'ACTIVE'
                """, (rs, row) -> new Component(rs.getObject("component_item_id", UUID.class),
                    rs.getBigDecimal("quantity")), line.menuItemId());
            for (Component component : components) {
                BigDecimal needed = component.quantity().multiply(BigDecimal.valueOf(line.quantity()));
                byOrderItem.computeIfAbsent(line.orderItemId(), ignored -> new LinkedHashMap<>())
                        .merge(component.itemId(), needed, BigDecimal::add);
            }
        }
        return byOrderItem;
    }

    private void recordResourceDelta(UUID orderItemId, UUID itemId, BigDecimal delta) {
        jdbc.update("""
            INSERT INTO wok.order_item_resource_reservations(order_item_id, item_id, quantity_delta)
            VALUES (?, ?, ?)
            ON CONFLICT (order_item_id, item_id) DO UPDATE
            SET quantity_delta = order_item_resource_reservations.quantity_delta + EXCLUDED.quantity_delta
            """, orderItemId, itemId, delta);
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

    public record Line(UUID orderItemId, UUID menuItemId, int quantity) {}
    public record ResourceDelta(UUID itemId, BigDecimal quantityDelta) {}
    private record Adjustment(UUID itemId, BigDecimal quantityDelta) {}
    private record LineAdjustment(UUID orderItemId, UUID itemId, BigDecimal quantityDelta) {}
    private record Component(UUID itemId, BigDecimal quantity) {}
    private record Reservation(UUID itemId, BigDecimal quantity) {}
}
