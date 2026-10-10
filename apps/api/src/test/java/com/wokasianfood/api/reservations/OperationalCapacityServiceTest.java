package com.wokasianfood.api.reservations;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class OperationalCapacityServiceTest {
    private final OperationalCapacityService service = new OperationalCapacityService(new OccupancyEstimator());
    private static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private Instant at(int hour, int minute) {
        return LocalDateTime.of(2026, 9, 26, hour, minute).atZone(ZONE).toInstant();
    }

    @Test void rejectsLessThanConfiguredTwoHoursForTableRequests() {
        var assessment = service.assessTable(2, at(18, 0), at(16, 1), false);
        assertEquals(OperationalCapacityService.Decision.REJECT, assessment.decision());
        assertTrue(assessment.reasonCodes().contains("MINIMUM_NOTICE"));
    }

    @Test void acceptsExactMinimumAndAddsNoticeForSameDayGroups() {
        assertNotEquals(OperationalCapacityService.Decision.REJECT,
                service.assessTable(4, at(18, 0), at(16, 0), false).decision());
        assertEquals(OperationalCapacityService.Decision.REJECT,
                service.assessTable(6, at(18, 0), at(16, 0), false).decision());
        assertNotEquals(OperationalCapacityService.Decision.REJECT,
                service.assessTable(6, at(18, 0), at(15, 45), false).decision());
    }

    @Test void usesConfiguredNoticeAndAdmissionWindow() {
        var configured = new OperationalCapacityService(new OccupancyEstimator(), "America/Guatemala",
                60, 10, "15:00", "20:00", "19:00");
        assertNotEquals(OperationalCapacityService.Decision.REJECT,
                configured.assessTable(2, at(18, 0), at(17, 0), true).decision());
        assertEquals(OperationalCapacityService.Decision.SUGGEST_OTHER_TIME,
                configured.assessTable(2, at(21, 0), at(17, 0), true).decision());
    }

    @Test void largeGroupAtLastAdmissionRequiresHumanApproval() {
        var assessment = service.assessTable(20, at(21, 15), at(17, 0), true);
        assertEquals(OperationalCapacityService.Decision.REQUIRES_HUMAN_APPROVAL, assessment.decision());
        assertFalse(assessment.publicMessage().contains("retirarse"));
    }

    @Test void twoPeopleAtLastAdmissionAreNotRejectedSolelyForClosingTime() {
        var assessment = service.assessTable(2, at(21, 15), at(17, 0), true);
        assertNotEquals(OperationalCapacityService.Decision.REJECT, assessment.decision());
        assertEquals(90, assessment.occupancy().minimumMinutes());
    }

    @Test void exportedPolicyDescribesConservativeRequestRulesWithoutAvailabilityPromises() {
        Instant before = Instant.now();
        var policy = service.policy();
        Instant after = Instant.now();

        assertEquals("America/Guatemala", policy.timeZone());
        assertEquals(2, policy.minimumNoticeHours());
        assertEquals(120, policy.minimumNoticeMinutes());
        assertEquals(15, policy.additionalPairMinutes());
        assertEquals(LocalTime.of(14, 0), policy.firstRequestTime());
        assertEquals(LocalTime.of(21, 15), policy.lastRequestTime());
        assertEquals(LocalTime.of(20, 30), policy.preorderRecommendedAfter());
        assertFalse(policy.preorderItemsSupported());
        assertFalse(policy.asOf().isBefore(before));
        assertFalse(policy.asOf().isAfter(after));
    }

    @Test void exportedNoticeAndInclusiveWindowMatchAssessmentBoundaries() {
        var policy = service.policy();
        ZoneId zone = ZoneId.of(policy.timeZone());
        Instant first = LocalDateTime.of(2026, 9, 26,
                policy.firstRequestTime().getHour(), policy.firstRequestTime().getMinute()).atZone(zone).toInstant();
        Instant noticeBoundary = first.minusSeconds(policy.minimumNoticeHours() * 3600L);

        assertEquals(OperationalCapacityService.Decision.REJECT,
                service.assessTable(2, first, noticeBoundary.plusSeconds(1), false).decision());
        assertFalse(service.assessTable(2, first, noticeBoundary, false).reasonCodes().contains("MINIMUM_NOTICE_3_HOURS"));
        assertFalse(service.assessTable(2, first, at(10, 0), false).reasonCodes().contains("OUTSIDE_TABLE_WINDOW"));
        assertTrue(service.assessTable(2, first.minusSeconds(1), at(10, 0), false).reasonCodes().contains("OUTSIDE_TABLE_WINDOW"));

        Instant last = LocalDateTime.of(2026, 9, 26,
                policy.lastRequestTime().getHour(), policy.lastRequestTime().getMinute()).atZone(zone).toInstant();
        assertFalse(service.assessTable(2, last, at(10, 0), true).reasonCodes().contains("OUTSIDE_TABLE_WINDOW"));
        assertTrue(service.assessTable(2, last.plusSeconds(1), at(10, 0), true).reasonCodes().contains("OUTSIDE_TABLE_WINDOW"));
    }

    @Test void exportedPreorderThresholdMatchesAdviceWithoutConfirmingCapacity() {
        var policy = service.policy();
        Instant threshold = LocalDateTime.of(2026, 9, 26,
                policy.preorderRecommendedAfter().getHour(), policy.preorderRecommendedAfter().getMinute())
                .atZone(ZoneId.of(policy.timeZone())).toInstant();

        assertFalse(service.assessTable(2, threshold, at(10, 0), false).reasonCodes().contains("PREORDER_RECOMMENDED"));
        var late = service.assessTable(2, threshold.plusSeconds(1), at(10, 0), false);
        assertTrue(late.reasonCodes().contains("PREORDER_RECOMMENDED"));
        assertTrue(late.reasonCodes().contains("LIVE_CAPACITY_NOT_YET_CONNECTED"));
        assertEquals(OperationalCapacityService.Decision.REQUIRES_HUMAN_APPROVAL, late.decision());
        assertFalse(service.assessTable(2, threshold.plusSeconds(1), at(10, 0), true)
                .reasonCodes().contains("PREORDER_RECOMMENDED"));
    }
}
