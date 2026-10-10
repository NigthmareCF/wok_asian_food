package com.wokasianfood.api.reservations;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** First conservative policy layer; future slices must supply staff, kitchen and inventory snapshots. */
@Service
public class OperationalCapacityService {
    private final OccupancyEstimator occupancy;
    private final ZoneId restaurantZone;
    private final int minimumNoticeMinutes;
    private final int additionalPairMinutes;
    private final LocalTime firstAdmission;
    private final LocalTime lastAdmission;
    private final LocalTime lateGroupReview;

    public OperationalCapacityService(OccupancyEstimator occupancy) {
        this(occupancy, "America/Guatemala", 120, 15, "14:00", "21:15", "20:30");
    }

    @Autowired
    public OperationalCapacityService(OccupancyEstimator occupancy,
            @Value("${wok.reservations.timezone:America/Guatemala}") String timezone,
            @Value("${wok.reservations.minimum-notice-minutes:120}") int minimumNoticeMinutes,
            @Value("${wok.reservations.additional-pair-minutes:15}") int additionalPairMinutes,
            @Value("${wok.reservations.first-admission:14:00}") String firstAdmission,
            @Value("${wok.reservations.last-admission:21:15}") String lastAdmission,
            @Value("${wok.reservations.late-group-review:20:30}") String lateGroupReview) {
        if (minimumNoticeMinutes < 0 || additionalPairMinutes < 0) throw new IllegalArgumentException("invalid notice");
        this.occupancy = occupancy;
        this.restaurantZone = ZoneId.of(timezone);
        this.minimumNoticeMinutes = minimumNoticeMinutes;
        this.additionalPairMinutes = additionalPairMinutes;
        this.firstAdmission = LocalTime.parse(firstAdmission);
        this.lastAdmission = LocalTime.parse(lastAdmission);
        this.lateGroupReview = LocalTime.parse(lateGroupReview);
        if (this.firstAdmission.isAfter(this.lastAdmission)) throw new IllegalArgumentException("invalid admission window");
    }

    public Assessment assessTable(int guests, Instant requestedAt, Instant now, boolean preorder) {
        if (guests < 1 || requestedAt == null || now == null) throw new IllegalArgumentException("invalid request");
        ZonedDateTime local = requestedAt.atZone(restaurantZone);
        int notice = minimumNoticeMinutes;
        if (local.toLocalDate().equals(now.atZone(restaurantZone).toLocalDate()))
            notice += ((Math.max(0, guests - 4) + 1) / 2) * additionalPairMinutes;
        if (requestedAt.isBefore(now.plus(Duration.ofMinutes(notice))))
            return new Assessment(Decision.REJECT, List.of("MINIMUM_NOTICE"), null,
                    "Este grupo requiere al menos " + notice + " minutos de anticipación.");
        LocalTime time = local.toLocalTime();
        if (time.isBefore(firstAdmission) || time.isAfter(lastAdmission))
            return new Assessment(Decision.SUGGEST_OTHER_TIME, List.of("OUTSIDE_TABLE_WINDOW"), null,
                    "Prueba con otro horario disponible.");
        var stay = occupancy.estimate(guests);
        if (stay.requiresIndividualReview() || (time.isAfter(lateGroupReview) && guests > 4))
            return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL, List.of("LARGE_OR_LATE_GROUP"), stay,
                    "Revisaremos la disponibilidad para tu grupo y confirmaremos el horario.");
        if (time.isAfter(lateGroupReview) && !preorder)
            return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL,
                    List.of("PREORDER_RECOMMENDED", "LIVE_CAPACITY_NOT_YET_CONNECTED"), stay,
                    "Para este horario recomendamos llegar puntualmente y realizar una preorden. Confirmaremos la disponibilidad.");
        return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL, List.of("LIVE_CAPACITY_NOT_YET_CONNECTED"), stay,
                "Revisaremos la disponibilidad y confirmaremos tu solicitud.");
    }

    public Policy policy() {
        return new Policy(restaurantZone.getId(), (minimumNoticeMinutes + 59) / 60,
                firstAdmission, lastAdmission, lateGroupReview, false, Instant.now(),
                minimumNoticeMinutes, additionalPairMinutes);
    }

    public record Policy(String timeZone, int minimumNoticeHours, LocalTime firstRequestTime,
                         LocalTime lastRequestTime, LocalTime preorderRecommendedAfter,
                         boolean preorderItemsSupported, Instant asOf,
                         int minimumNoticeMinutes, int additionalPairMinutes) {}

    public enum Decision { ACCEPT, ACCEPT_WITH_CONDITIONS, SUGGEST_OTHER_TIME, REQUIRES_HUMAN_APPROVAL, REJECT }
    public record Assessment(Decision decision, List<String> reasonCodes,
                             OccupancyEstimator.Estimate occupancy, String publicMessage) {}
}
