package com.wokasianfood.api.reservations;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import org.springframework.stereotype.Service;

/** First conservative policy layer; future slices must supply staff, kitchen and inventory snapshots. */
@Service
public class OperationalCapacityService {
    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private static final int MINIMUM_NOTICE_HOURS = 3;
    private static final LocalTime FIRST_REQUEST_TIME = LocalTime.of(14, 0);
    private static final LocalTime LAST_REQUEST_TIME = LocalTime.of(21, 15);
    private static final LocalTime PREORDER_RECOMMENDED_AFTER = LocalTime.of(20, 30);
    private final OccupancyEstimator occupancy;
    public OperationalCapacityService(OccupancyEstimator occupancy) { this.occupancy = occupancy; }

    public Assessment assessTable(int guests, Instant requestedAt, Instant now, boolean preorder) {
        if (guests < 1 || requestedAt == null || now == null) throw new IllegalArgumentException("invalid request");
        if (requestedAt.isBefore(now.plus(Duration.ofHours(MINIMUM_NOTICE_HOURS))))
            return new Assessment(Decision.REJECT, List.of("MINIMUM_NOTICE_3_HOURS"), null,
                    "Las solicitudes de mesa requieren al menos tres horas de anticipación.");
        ZonedDateTime local = requestedAt.atZone(RESTAURANT_ZONE);
        LocalTime time = local.toLocalTime();
        if (time.isBefore(FIRST_REQUEST_TIME) || time.isAfter(LAST_REQUEST_TIME))
            return new Assessment(Decision.SUGGEST_OTHER_TIME, List.of("OUTSIDE_TABLE_WINDOW"), null,
                    "Prueba con otro horario disponible.");
        var stay = occupancy.estimate(guests);
        if (stay.requiresIndividualReview() || (time.isAfter(PREORDER_RECOMMENDED_AFTER) && guests > 4))
            return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL, List.of("LARGE_OR_LATE_GROUP"), stay,
                    "Revisaremos la disponibilidad para tu grupo y confirmaremos el horario.");
        if (time.isAfter(PREORDER_RECOMMENDED_AFTER) && !preorder)
            return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL,
                    List.of("PREORDER_RECOMMENDED", "LIVE_CAPACITY_NOT_YET_CONNECTED"), stay,
                    "Para este horario recomendamos llegar puntualmente y realizar una preorden. Confirmaremos la disponibilidad.");
        return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL, List.of("LIVE_CAPACITY_NOT_YET_CONNECTED"), stay,
                "Revisaremos la disponibilidad y confirmaremos tu solicitud.");
    }

    public Policy policy() {
        return new Policy(RESTAURANT_ZONE.getId(), MINIMUM_NOTICE_HOURS, FIRST_REQUEST_TIME,
                LAST_REQUEST_TIME, PREORDER_RECOMMENDED_AFTER, false, Instant.now());
    }

    public record Policy(String timeZone, int minimumNoticeHours, LocalTime firstRequestTime,
                         LocalTime lastRequestTime, LocalTime preorderRecommendedAfter,
                         boolean preorderItemsSupported, Instant asOf) {}

    public enum Decision { ACCEPT, ACCEPT_WITH_CONDITIONS, SUGGEST_OTHER_TIME, REQUIRES_HUMAN_APPROVAL, REJECT }
    public record Assessment(Decision decision, List<String> reasonCodes,
                             OccupancyEstimator.Estimate occupancy, String publicMessage) {}
}
