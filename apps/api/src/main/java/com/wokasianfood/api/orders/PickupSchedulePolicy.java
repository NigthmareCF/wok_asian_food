package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
class PickupSchedulePolicy {
    static final Duration MAX_ADVANCE = Duration.ofHours(3);

    private final JdbcTemplate jdbc;
    private final Clock clock;

    @Autowired
    PickupSchedulePolicy(JdbcTemplate jdbc) {
        this(jdbc, Clock.systemUTC());
    }

    PickupSchedulePolicy(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    void validate(Instant requestedFor, long preparationSeconds) {
        Instant now = clock.instant();
        if (preparationSeconds > Duration.ofDays(1).toSeconds()
                || !requestedFor.isAfter(now.plusSeconds(preparationSeconds))) {
            throw new AuthException(422,
                    "El horario solicitado es anterior al tiempo mínimo de preparación indicado.");
        }
        new com.wokasianfood.api.service.ServiceHoursPolicy(jdbc).assess("PICKUP", requestedFor, now, preparationSeconds);
    }

    private record BusinessWindow(LocalTime opensAt, LocalTime closesAt, ZoneId zone) {
        boolean contains(Instant instant) {
            ZonedDateTime local = instant.atZone(zone);
            LocalTime time = local.toLocalTime();
            return !time.isBefore(opensAt) && time.isBefore(closesAt);
        }
    }
}
