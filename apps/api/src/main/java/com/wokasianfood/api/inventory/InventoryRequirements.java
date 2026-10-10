package com.wokasianfood.api.inventory;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** One resource calculation for quote holds and actual order inventory reservations. */
public final class InventoryRequirements {
    private InventoryRequirements() {}
    public static Map<UUID,BigDecimal> calculate(JdbcTemplate jdbc,List<InventoryReservationService.Line> lines) {
        Map<UUID,BigDecimal> result=new TreeMap<>();
        for(var line:lines) {
            Map<UUID,BigDecimal> perUnit=new TreeMap<>();
            jdbc.query("""
                SELECT rc.component_item_id,rc.quantity FROM wok.item_recipe_components rc
                JOIN wok.menu_items mi ON mi.item_id=rc.parent_item_id WHERE mi.id=?
                """, rs->{while(rs.next()) perUnit.merge(rs.getObject(1,UUID.class),rs.getBigDecimal(2),BigDecimal::add);return null;},line.menuItemId());
            for(UUID modifier:line.modifierIds()) jdbc.query("""
                SELECT item_id,quantity_delta FROM wok.modifier_item_impacts
                WHERE modifier_id=? AND affects_availability=true
                """,rs->{while(rs.next()) perUnit.merge(rs.getObject(1,UUID.class),rs.getBigDecimal(2),BigDecimal::add);return null;},modifier);
            for(var entry:perUnit.entrySet()) {
                if(entry.getValue().signum()<0) throw new AuthException(422,"Las opciones producen una receta inválida.");
                if(entry.getValue().signum()>0) result.merge(entry.getKey(),entry.getValue().multiply(BigDecimal.valueOf(line.quantity())),BigDecimal::add);
            }
        }
        return result;
    }
    public static void lock(JdbcTemplate jdbc,Iterable<UUID> sortedItems) {
        for(UUID item:sortedItems) {
            var active=jdbc.query("SELECT id FROM wok.items WHERE id=? AND active=true AND track_inventory=true FOR SHARE",(rs,n)->rs.getObject(1,UUID.class),item);
            if(active.isEmpty())throw new AuthException(409,"Un recurso de inventario dejó de estar disponible.");
            jdbc.update("INSERT INTO wok.inventory_balances(item_id) VALUES(?) ON CONFLICT(item_id) DO NOTHING",item);
            jdbc.queryForObject("SELECT quantity_on_hand FROM wok.inventory_balances WHERE item_id=? FOR UPDATE",BigDecimal.class,item);
        }
    }
    public static void requireAvailable(JdbcTemplate jdbc,Map<UUID,BigDecimal> required,UUID excludedHold) {
        for(var entry:required.entrySet()) {
            BigDecimal available=jdbc.queryForObject("""
                SELECT b.quantity_on_hand
                 -coalesce((SELECT sum(r.quantity) FROM wok.inventory_reservations r WHERE r.item_id=b.item_id AND r.status='ACTIVE'),0)
                 -coalesce((SELECT sum(i.quantity) FROM wok.order_capacity_hold_inventory i
                  JOIN wok.order_capacity_holds h ON h.id=i.hold_id WHERE i.item_id=b.item_id
                   AND h.status='ACTIVE' AND h.expires_at>now() AND h.id IS DISTINCT FROM ?::uuid),0)
                 -coalesce((SELECT sum(i.quantity) FROM wok.reservation_capacity_hold_inventory i
                  JOIN wok.reservation_capacity_holds h ON h.id=i.hold_id WHERE i.item_id=b.item_id
                   AND h.status='ACTIVE' AND h.expires_at>now()),0)
                FROM wok.inventory_balances b WHERE b.item_id=?
                """,BigDecimal.class,excludedHold,entry.getKey());
            if(available.compareTo(entry.getValue())<0) throw new AuthException(409,"El inventario cambió; no hay stock suficiente para continuar.");
        }
    }
}
