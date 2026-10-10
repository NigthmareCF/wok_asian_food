package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.Instant;
import java.time.OffsetDateTime;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Short-lived station workload reserved while a submitted customer request awaits review. */
@Service
public class OrderCapacityHoldService {
    private final JdbcTemplate jdbc;
    private final int holdMinutes;

    public OrderCapacityHoldService(JdbcTemplate jdbc,
            @Value("${wok.orders.capacity-hold-minutes:12}") int holdMinutes) {
        this.jdbc = jdbc;
        if (holdMinutes < 1 || holdMinutes > 60) throw new IllegalArgumentException("Capacity hold must be 1–60 minutes.");
        this.holdMinutes = holdMinutes;
    }

    @Transactional
    public void create(UUID quoteId, UUID requestId, Instant requestedFor, Map<UUID, Long> preparationByStation) {
        var requirements = quoteRequirements(quoteId);
        com.wokasianfood.api.inventory.InventoryRequirements.lock(jdbc, requirements.keySet());
        com.wokasianfood.api.inventory.InventoryRequirements.requireAvailable(jdbc,requirements,null);
        List<UUID> stations = preparationByStation.keySet().stream()
                .sorted(Comparator.comparing(UUID::toString)).toList();
        lockStations(stations);
        UUID holdId = jdbc.queryForObject("""
                INSERT INTO wok.order_capacity_holds (quote_id, order_request_id, requested_for, expires_at)
                VALUES (?, ?, ?, now() + make_interval(mins => ?)) RETURNING id
                """, UUID.class, quoteId, requestId, OffsetDateTime.ofInstant(requestedFor, java.time.ZoneOffset.UTC),
                new com.wokasianfood.api.service.ServiceHoursPolicy(jdbc).current().holdMinutes());
        for (var resource : requirements.entrySet()) jdbc.update(
            "INSERT INTO wok.order_capacity_hold_inventory(hold_id,item_id,quantity) VALUES(?,?,?)",
            holdId,resource.getKey(),resource.getValue());
        for (UUID stationId : stations) {
            long seconds = preparationByStation.get(stationId);
            if (seconds <= 0) continue;
            if (seconds > 86_400) throw new AuthException(422, "La carga supera el tiempo operativo máximo.");
            jdbc.update("""
                    INSERT INTO wok.order_capacity_hold_stations (hold_id, station_id, preparation_seconds)
                    VALUES (?, ?, ?)
                    """, holdId, stationId, Math.toIntExact(seconds));
        }
    }

    /** Releases or converts a pending hold while preserving station lock order with quote/acceptance. */
    @Transactional
    public void finish(UUID requestId, EndState endState) {
        List<Hold> activeHolds = jdbc.query("""
                SELECT id, expires_at > now() AS unexpired FROM wok.order_capacity_holds
                WHERE order_request_id = ? AND status = 'ACTIVE'
                """, (rs, row) -> new Hold(rs.getObject("id", UUID.class), rs.getBoolean("unexpired")), requestId);
        if (activeHolds.isEmpty()) return;
        lockInventory(requestId);
        Hold hold = activeHolds.getFirst();
        UUID holdId = hold.id();
        if (!hold.unexpired()) {
            if (endState == EndState.CONVERTED) throw new AuthException(409,"El hold venció. Revalida con una nueva cotización antes de aceptar.");
            jdbc.update("UPDATE wok.order_capacity_holds SET status = 'EXPIRED', ended_at = now() WHERE id = ?", holdId);
            return;
        }
        List<UUID> stations = jdbc.query("""
                SELECT station_id FROM wok.order_capacity_hold_stations
                WHERE hold_id = ? ORDER BY station_id
                """, (rs, row) -> rs.getObject(1, UUID.class), holdId);
        lockStations(stations);
        int finished=jdbc.update("""
                UPDATE wok.order_capacity_holds SET status = ?, ended_at = now()
                WHERE id = ? AND status = 'ACTIVE' AND (expires_at>now() OR ?='RELEASED')
                """, endState.name(), holdId,endState.name());
        if(endState==EndState.CONVERTED&&finished!=1)throw new AuthException(409,"El hold venció durante la aceptación.");
    }

    @Transactional
    public int expireDue() {
        jdbc.update("UPDATE wok.order_substitution_requests SET status='EXPIRED',row_version=row_version+1 WHERE status IN ('PENDING_CONSENT','CONSENTED') AND expires_at<=now()");
        jdbc.update("UPDATE wok.order_quotes SET status='EXPIRED' WHERE status='ACTIVE' AND expires_at<=now()");
        return jdbc.update("""
                UPDATE wok.order_capacity_holds SET status = 'EXPIRED', ended_at = now()
                WHERE status = 'ACTIVE' AND expires_at <= now()
                """);
    }

    public Map<UUID,java.math.BigDecimal> quoteRequirements(UUID quoteId) {
        List<com.wokasianfood.api.inventory.InventoryReservationService.Line> lines=jdbc.query("""
            SELECT qi.menu_item_id,qi.quantity,ARRAY(SELECT modifier_id FROM wok.order_quote_item_modifiers m
             WHERE m.order_quote_item_id=qi.id ORDER BY modifier_id) AS modifiers
            FROM wok.order_quote_items qi WHERE qi.order_quote_id=? ORDER BY qi.menu_item_id
            """,(rs,n)->new com.wokasianfood.api.inventory.InventoryReservationService.Line(
                rs.getObject(1,UUID.class),rs.getInt(2),java.util.Arrays.asList((UUID[])rs.getArray(3).getArray())),quoteId);
        return com.wokasianfood.api.inventory.InventoryRequirements.calculate(jdbc,lines);
    }

    public void lockInventory(UUID requestId) {
        List<UUID> items=jdbc.query("""
            SELECT i.item_id FROM wok.order_capacity_hold_inventory i JOIN wok.order_capacity_holds h ON h.id=i.hold_id
            WHERE h.order_request_id=? ORDER BY i.item_id
            """,(rs,n)->rs.getObject(1,UUID.class),requestId);
        com.wokasianfood.api.inventory.InventoryRequirements.lock(jdbc,items);
    }

    private void lockStations(List<UUID> stations) {
        for (UUID stationId : stations) {
            List<UUID> active = jdbc.query("""
                    SELECT id FROM wok.preparation_areas WHERE id = ? AND active = true FOR UPDATE
                    """, (rs, row) -> rs.getObject(1, UUID.class), stationId);
            if (active.isEmpty()) throw new AuthException(409, "El área de preparación ya no está disponible.");
        }
    }

    public enum EndState { RELEASED, CONVERTED }
    private record Hold(UUID id, boolean unexpired) {}
}
