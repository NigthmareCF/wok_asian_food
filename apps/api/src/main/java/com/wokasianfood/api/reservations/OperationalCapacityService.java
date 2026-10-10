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
    private static final int MINIMUM_NOTICE_HOURS = 2;
    // Solicitudes fuera de apertura pueden revisarse; esta ventana no promete apertura.
    private static final LocalTime FIRST_REQUEST_TIME = LocalTime.MIDNIGHT;
    private static final LocalTime LAST_REQUEST_TIME = LocalTime.of(21, 15);
    private static final LocalTime PREORDER_RECOMMENDED_AFTER = LocalTime.of(20, 30);
    private final OccupancyEstimator occupancy;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    public OperationalCapacityService(OccupancyEstimator occupancy) { this.occupancy = occupancy; this.jdbc=null; }
    @org.springframework.beans.factory.annotation.Autowired
    public OperationalCapacityService(OccupancyEstimator occupancy,org.springframework.jdbc.core.JdbcTemplate jdbc) {this.occupancy=occupancy;this.jdbc=jdbc;}

    public Assessment assessTable(int guests, Instant requestedAt, Instant now, boolean preorder) {
        if (guests < 1 || requestedAt == null || now == null) throw new IllegalArgumentException("invalid request");
        long minimumMinutes = com.wokasianfood.api.service.ServiceHoursPolicy.minimumReservationMinutes(guests);
        if (requestedAt.isBefore(now.plus(Duration.ofMinutes(minimumMinutes))))
            return new Assessment(Decision.REJECT, List.of("MINIMUM_NOTICE_" + minimumMinutes + "_MINUTES"), null,
                    "La solicitud no cumple la anticipación mínima para el número de comensales.");
        ZonedDateTime local = requestedAt.atZone(RESTAURANT_ZONE);
        LocalTime time = local.toLocalTime();
        LocalTime lastArrival=jdbc==null?LocalTime.of(21,15):new com.wokasianfood.api.service.ServiceHoursPolicy(jdbc).current().tableLastArrival();
        boolean open=jdbc==null?!time.isBefore(LocalTime.of(14,0)):jdbc.query("SELECT opens_at,closes_at FROM wok.business_hours WHERE service_type='RESTAURANT' AND weekday=? AND active=true",
            (rs,n)->!time.isBefore(rs.getTime(1).toLocalTime())&&time.isBefore(rs.getTime(2).toLocalTime()),local.getDayOfWeek().getValue()).stream().anyMatch(Boolean.TRUE::equals);
        if (time.isAfter(lastArrival))
            return new Assessment(Decision.SUGGEST_OTHER_TIME, List.of("OUTSIDE_TABLE_WINDOW"), null,
                    "Prueba con otro horario disponible.");
        var stay = occupancy.estimate(guests);
        if (time.equals(lastArrival) && !preorder)
            return new Assessment(Decision.REJECT, List.of("COMPLETE_PREORDER_REQUIRED"), stay,
                "Para llegar a las 21:15 necesitas una preorden completa.");
        if(!open)return new Assessment(Decision.REQUIRES_HUMAN_APPROVAL,List.of("OUTSIDE_HOURS_REVIEW"),stay,"La apertura para ese horario requiere revisión humana.");
        if (stay.requiresIndividualReview() || (time.isAfter(LocalTime.of(20, 30)) && guests > 4))
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
        LocalTime lastArrival = jdbc == null ? LAST_REQUEST_TIME
                : new com.wokasianfood.api.service.ServiceHoursPolicy(jdbc).current().tableLastArrival();
        return new Policy(RESTAURANT_ZONE.getId(), MINIMUM_NOTICE_HOURS, FIRST_REQUEST_TIME,
                lastArrival, PREORDER_RECOMMENDED_AFTER, true, Instant.now(),
                120, 4, 2, 15, lastArrival, true);
    }

    public record Policy(String timeZone, int minimumNoticeHours, LocalTime firstRequestTime,
                         LocalTime lastRequestTime, LocalTime preorderRecommendedAfter,
                         boolean preorderItemsSupported, Instant asOf, int minimumNoticeMinutes,
                         int baseGuests, int additionalGuestGroupSize, int additionalNoticeMinutes,
                         LocalTime completePreorderAt, boolean outsideHoursRequiresReview) {}

    public enum Decision { ACCEPT, ACCEPT_WITH_CONDITIONS, SUGGEST_OTHER_TIME, REQUIRES_HUMAN_APPROVAL, REJECT }
    public record Assessment(Decision decision, List<String> reasonCodes,
                             OccupancyEstimator.Estimate occupancy, String publicMessage) {}
}
