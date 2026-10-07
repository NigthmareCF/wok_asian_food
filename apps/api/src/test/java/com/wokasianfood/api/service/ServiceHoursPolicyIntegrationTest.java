package com.wokasianfood.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ServiceHoursPolicyIntegrationTest extends PostgresIntegrationTest {
    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private ServiceHoursPolicy policy;

    @BeforeEach
    void createPolicy() { policy = new ServiceHoursPolicy(jdbc); }

    @Test
    void validatesPickupAndDeliveryCutoffsUsingGuatemalaLocalTime() {
        LocalDate openDate = LocalDate.now(RESTAURANT_ZONE).with(TemporalAdjusters.next(DayOfWeek.WEDNESDAY));

        policy.requireSlot("PICKUP", at(openDate, LocalTime.of(14, 0)), false);
        policy.requireSlot("PICKUP", at(openDate, LocalTime.of(21, 29)), true);
        policy.requireSlot("DELIVERY", at(openDate, LocalTime.of(20, 59)), true);

        assertOutOfHours("PICKUP", at(openDate, LocalTime.of(13, 59)));
        assertOutOfHours("PICKUP", at(openDate, LocalTime.of(21, 30)));
        assertOutOfHours("DELIVERY", at(openDate, LocalTime.of(21, 0)));
    }

    @Test
    void missingMondayScheduleIsClosedByDefault() {
        LocalDate monday = LocalDate.now(RESTAURANT_ZONE).with(TemporalAdjusters.next(DayOfWeek.MONDAY));
        assertOutOfHours("PICKUP", at(monday, LocalTime.of(15, 0)));
    }

    private void assertOutOfHours(String service, Instant slot) {
        assertThatThrownBy(() -> policy.requireSlot(service, slot, false))
                .isInstanceOf(AuthException.class)
                .extracting("status").isEqualTo(422);
    }

    private Instant at(LocalDate date, LocalTime time) {
        return ZonedDateTime.of(date, time, RESTAURANT_ZONE).toInstant();
    }
}
