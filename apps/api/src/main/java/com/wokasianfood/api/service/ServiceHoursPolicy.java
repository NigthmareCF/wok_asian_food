package com.wokasianfood.api.service;

import com.wokasianfood.api.identity.AuthException;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Fixed restaurant policy, shared by clients and operational revalidation. Not a rule engine. */
@Service
public class ServiceHoursPolicy {
    public static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private final JdbcTemplate jdbc;
    public ServiceHoursPolicy(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Policy current() {
        return jdbc.queryForObject("""
            SELECT version, hold_minutes, table_last_arrival, delivery_review_from,
                pickup_last_arrival, pickup_new_preparation_until FROM wok.service_policy WHERE id=1
            """, (rs,n) -> new Policy(rs.getLong(1),rs.getInt(2),rs.getTime(3).toLocalTime(),
                rs.getTime(4).toLocalTime(),rs.getTime(5).toLocalTime(),rs.getTime(6).toLocalTime()));
    }

    public static long minimumReservationMinutes(int guests) {
        if (guests < 1 || guests > 50) throw new IllegalArgumentException("Invalid party size");
        return 120L + 15L * ((Math.max(guests - 4, 0) + 1) / 2);
    }

    public Assessment assess(String service, Instant requestedFor, Instant receivedAt, long etaSeconds) {
        if (requestedFor == null || receivedAt == null || etaSeconds < 0 || etaSeconds > 86400
                || !requestedFor.isAfter(receivedAt.plusSeconds(etaSeconds)))
            throw new AuthException(422,"El horario solicitado no cumple el tiempo de preparación.");
        var policy = current();
        var slot = requestedFor.atZone(ZONE);
        var received = receivedAt.atZone(ZONE);
        boolean open = jdbc.query("""
            SELECT opens_at, closes_at FROM wok.business_hours
            WHERE service_type='RESTAURANT' AND weekday=? AND active=true
            """, (rs,n) -> !slot.toLocalTime().isBefore(rs.getTime(1).toLocalTime())
                && slot.toLocalTime().isBefore(rs.getTime(2).toLocalTime()),
            slot.getDayOfWeek().getValue()).stream().anyMatch(Boolean.TRUE::equals);
        if ("PICKUP".equals(service)) {
            if (slot.toLocalTime().isAfter(policy.pickupLastArrival()))
                throw new AuthException(422,"La recogida supera el cutoff operativo.");
            boolean latePreparation = received.toLocalDate().equals(slot.toLocalDate())
                && received.toLocalTime().isAfter(policy.pickupNewPreparationUntil());
            return new Assessment(!open || latePreparation,
                latePreparation ? List.of("NEW_PREPARATION_CUTOFF_REVIEW") : open ? List.of() : List.of("OUTSIDE_HOURS_REVIEW"));
        }
        if ("DELIVERY".equals(service)) {
            boolean late = !received.toLocalTime().isBefore(policy.deliveryReviewFrom());
            return new Assessment(late || !open, late ? List.of("DELIVERY_RECEIVED_AFTER_CUTOFF")
                : open ? List.of() : List.of("OUTSIDE_HOURS_REVIEW"));
        }
        throw new IllegalArgumentException("Unsupported service");
    }

    public void requireSlot(String service, Instant requestedFor, boolean ignoredOverride) {
        assess(service, requestedFor, Instant.now(), 0);
    }
    public record Policy(long version, int holdMinutes, LocalTime tableLastArrival,
        LocalTime deliveryReviewFrom, LocalTime pickupLastArrival, LocalTime pickupNewPreparationUntil) {}
    public record Assessment(boolean requiresHumanReview, List<String> reasonCodes) {}
}
