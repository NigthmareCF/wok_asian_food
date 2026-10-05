package com.wokasianfood.api.reservations;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** First conservative policy layer; future slices must supply staff, kitchen and inventory snapshots. */
@Service
public class OperationalCapacityService {
    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private final OccupancyEstimator occupancy;
    private final OperatingHoursProvider operatingHours;
    public OperationalCapacityService(OccupancyEstimator occupancy, OperatingHoursProvider operatingHours) {
        this.occupancy = occupancy;
        this.operatingHours = operatingHours;
    }

    public Assessment assessTable(int guests, Instant requestedAt, Instant now, boolean preorder) {
        if (guests < 1 || requestedAt == null || now == null) throw new IllegalArgumentException("invalid request");
        if (requestedAt.isBefore(now.plus(Duration.ofHours(3))))
            return new Assessment(Decision.REJECT, List.of("MINIMUM_NOTICE_3_HOURS"), null,
                    "Las solicitudes de mesa requieren al menos tres horas de anticipación.");
        ZonedDateTime local = requestedAt.atZone(RESTAURANT_ZONE);
        LocalTime time = local.toLocalTime();
        Optional<OperatingHoursProvider.Window> window = operatingHours.forDate(local.toLocalDate());
        if (window.isEmpty())
            return new Assessment(Decision.SUGGEST_OTHER_TIME, List.of("RESTAURANT_CLOSED"), null,
                    "El restaurante no recibe solicitudes de mesa para ese día. Prueba con otra fecha.");
        LocalTime opensAt = window.get().opensAt();
        LocalTime closesAt = window.get().closesAt();
        ZonedDateTime scheduledLocal = requestedAt.atZone(window.get().zone());
        time = scheduledLocal.toLocalTime();
        if (time.isBefore(opensAt) || !time.isBefore(closesAt))
            return new Assessment(Decision.SUGGEST_OTHER_TIME, List.of("OUTSIDE_TABLE_WINDOW"), null,
                    "Prueba con otro horario disponible.");
        LocalTime lastEntry = closesAt.isBefore(LocalTime.of(21, 15)) ? closesAt : LocalTime.of(21, 15);
        if (time.isAfter(lastEntry))
            return new Assessment(Decision.SUGGEST_OTHER_TIME, List.of("AFTER_LAST_TABLE_ENTRY"), null,
                    "Prueba con otro horario disponible.");
        var stay = occupancy.estimate(guests);
        if (stay.requiresIndividualReview() || (time.isAfter(LocalTime.of(20, 30)) && guests > 4))
            return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL, List.of("LARGE_OR_LATE_GROUP"), stay,
                    "Revisaremos la disponibilidad para tu grupo y confirmaremos el horario.");
        if (time.isAfter(LocalTime.of(20, 30)) && !preorder)
            return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL,
                    List.of("PREORDER_RECOMMENDED", "LIVE_CAPACITY_NOT_YET_CONNECTED"), stay,
                    "Para este horario recomendamos llegar puntualmente y realizar una preorden. Confirmaremos la disponibilidad.");
        return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL, List.of("LIVE_CAPACITY_NOT_YET_CONNECTED"), stay,
                "Revisaremos la disponibilidad y confirmaremos tu solicitud.");
    }

    public enum Decision { ACCEPT, ACCEPT_WITH_CONDITIONS, SUGGEST_OTHER_TIME, REQUIRES_HUMAN_APPROVAL, REJECT }
    public record Assessment(Decision decision, List<String> reasonCodes,
                             OccupancyEstimator.Estimate occupancy, String publicMessage) {}
}
