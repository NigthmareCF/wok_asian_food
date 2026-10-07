package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Estimates completion from each station's active queue and locks stations in a stable order when accepting work. */
@Service
public class KitchenQueueEstimator {
    private final JdbcTemplate jdbc;

    public KitchenQueueEstimator(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Estimate estimate(Map<UUID, Long> preparationSecondsByStation, boolean lockStations) {
        if (preparationSecondsByStation == null || preparationSecondsByStation.isEmpty())
            return new Estimate(List.of(), 0);
        List<StationEstimate> stations = preparationSecondsByStation.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(Comparator.comparing(UUID::toString)))
                .map(entry -> {
                    UUID stationId = entry.getKey();
                    if (lockStations) lockStation(stationId);
                    Long delay = jdbc.queryForObject("""
                            SELECT COALESCE(GREATEST(0,
                                CEIL(EXTRACT(EPOCH FROM (MAX(estimated_ready_at) - now())))::bigint), 0)
                            FROM wok.kitchen_tickets
                            WHERE station_id = ? AND status IN ('QUEUED', 'PREPARING')
                            """, Long.class, stationId);
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
