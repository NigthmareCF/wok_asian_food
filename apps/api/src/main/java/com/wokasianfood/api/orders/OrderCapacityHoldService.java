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
        List<UUID> stations = preparationByStation.keySet().stream()
                .sorted(Comparator.comparing(UUID::toString)).toList();
        lockStations(stations);
        UUID holdId = jdbc.queryForObject("""
                INSERT INTO wok.order_capacity_holds (quote_id, order_request_id, requested_for, expires_at)
                VALUES (?, ?, ?, now() + make_interval(mins => ?)) RETURNING id
                """, UUID.class, quoteId, requestId, OffsetDateTime.ofInstant(requestedFor, java.time.ZoneOffset.UTC), holdMinutes);
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
                WHERE order_request_id = ? AND status = 'ACTIVE' FOR UPDATE
                """, (rs, row) -> new Hold(rs.getObject("id", UUID.class), rs.getBoolean("unexpired")), requestId);
        if (activeHolds.isEmpty()) return;
        Hold hold = activeHolds.getFirst();
        UUID holdId = hold.id();
        if (!hold.unexpired()) {
            jdbc.update("UPDATE wok.order_capacity_holds SET status = 'EXPIRED', ended_at = now() WHERE id = ?", holdId);
            return;
        }
        List<UUID> stations = jdbc.query("""
                SELECT station_id FROM wok.order_capacity_hold_stations
                WHERE hold_id = ? ORDER BY station_id
                """, (rs, row) -> rs.getObject(1, UUID.class), holdId);
        lockStations(stations);
        jdbc.update("""
                UPDATE wok.order_capacity_holds SET status = ?, ended_at = now()
                WHERE id = ? AND status = 'ACTIVE'
                """, endState.name(), holdId);
    }

    @Transactional
    public int expireDue() {
        return jdbc.update("""
                UPDATE wok.order_capacity_holds SET status = 'EXPIRED', ended_at = now()
                WHERE status = 'ACTIVE' AND expires_at <= now()
                """);
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
