package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.Instant;
import java.sql.Timestamp;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Estimates completion from each station's active queue and locks stations in a stable order when accepting work. */
@Service
public class KitchenQueueEstimator {
    private final JdbcTemplate jdbc;

    public KitchenQueueEstimator(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Estimate estimate(Map<UUID, Long> preparationSecondsByStation, boolean lockStations) {
        return estimate(preparationSecondsByStation, lockStations, null);
    }

    /** Remote scheduled requests include only holds for an earlier/equal slot on the same Guatemala service date.
     * Unscheduled in-house work ignores remote holds so the restaurant keeps its local-first priority. */
    public Estimate estimate(Map<UUID, Long> preparationSecondsByStation, boolean lockStations, Instant requestedFor) {
        return estimate(preparationSecondsByStation, lockStations, requestedFor, null);
    }

    /** Excludes a request's own hold when rechecking it at operational acceptance. */
    public Estimate estimate(Map<UUID, Long> preparationSecondsByStation, boolean lockStations,
            Instant requestedFor, UUID excludedOrderRequestId) {
        if (preparationSecondsByStation == null || preparationSecondsByStation.isEmpty())
            return new Estimate(List.of(), 0);
        List<StationEstimate> stations = preparationSecondsByStation.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(Comparator.comparing(UUID::toString)))
                .map(entry -> {
                    UUID stationId = entry.getKey();
                    if (lockStations) lockStation(stationId);
                    Long delay = jdbc.queryForObject("""
                            SELECT COALESCE(GREATEST(0,
                                       CEIL(EXTRACT(EPOCH FROM (MAX(ticket.estimated_ready_at) - now())))::bigint), 0)
                                   + COALESCE((
                                       SELECT sum(allocation.preparation_seconds)::bigint
                                       FROM wok.order_capacity_hold_stations allocation
                                       JOIN wok.order_capacity_holds hold ON hold.id = allocation.hold_id
                                       WHERE allocation.station_id = ? AND hold.status = 'ACTIVE' AND hold.expires_at > now()
                                         AND ?::timestamptz IS NOT NULL
                                         AND hold.requested_for <= ?
                                         AND (hold.requested_for AT TIME ZONE 'America/Guatemala')::date
                                             = (? AT TIME ZONE 'America/Guatemala')::date
                                         AND hold.order_request_id IS DISTINCT FROM ?
                                   ), 0)
                            FROM wok.kitchen_tickets ticket
                            WHERE ticket.station_id = ? AND ticket.status IN ('QUEUED', 'PREPARING')
                            """, Long.class, stationId, requestedFor == null ? null : Timestamp.from(requestedFor),
                            requestedFor == null ? null : Timestamp.from(requestedFor),
                            requestedFor == null ? null : Timestamp.from(requestedFor), excludedOrderRequestId, stationId);
                    long queueDelay = delay == null ? 0 : delay;
                    long preparation = Math.max(0, entry.getValue() == null ? 0 : entry.getValue());
                    return new StationEstimate(stationId, queueDelay, preparation,
                            Math.addExact(queueDelay, preparation));
                }).toList();
        return new Estimate(stations, stations.stream().mapToLong(StationEstimate::readyInSeconds).max().orElse(0));
    }

    private void lockStation(UUID stationId) {
        List<UUID> stations = jdbc.query("SELECT id FROM wok.preparation_areas WHERE id = ? AND active = true FOR UPDATE",
                (rs, row) -> rs.getObject(1, UUID.class), stationId);
        if (stations.isEmpty()) throw new AuthException(422, "El área de preparación ya no está disponible.");
    }

    public record Estimate(List<StationEstimate> stations, long overallReadySeconds) {}
    public record StationEstimate(UUID stationId, long queueDelaySeconds, long preparationSeconds,
                                  long readyInSeconds) {}
}
