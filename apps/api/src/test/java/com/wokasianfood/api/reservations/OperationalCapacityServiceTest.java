package com.wokasianfood.api.reservations;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class OperationalCapacityServiceTest {
    private final OperationalCapacityService service = new OperationalCapacityService(new OccupancyEstimator());
    private static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private Instant at(int hour, int minute) {
        return LocalDateTime.of(2026, 9, 26, hour, minute).atZone(ZONE).toInstant();
    }

    @Test void rejectsLessThanThreeHoursForTableRequests() {
        var assessment = service.assessTable(2, at(18, 0), at(15, 1), false);
        assertEquals(OperationalCapacityService.Decision.REJECT, assessment.decision());
        assertTrue(assessment.reasonCodes().contains("MINIMUM_NOTICE_3_HOURS"));
    }

    @Test void exactlyThreeHoursStillRequiresEvaluationButIsNotRejectedForNotice() {
        var assessment = service.assessTable(2, at(18, 0), at(15, 0), false);
        assertNotEquals(OperationalCapacityService.Decision.REJECT, assessment.decision());
        assertTrue(assessment.reasonCodes().contains("LIVE_CAPACITY_NOT_YET_CONNECTED"));
    }

    @Test void requestsOutsideTheDineInWindowSuggestAnotherTime() {
        var beforeOpening = service.assessTable(2, at(13, 59), at(10, 0), true);
        var afterLastAdmission = service.assessTable(2, at(21, 16), at(18, 0), true);
        assertEquals(OperationalCapacityService.Decision.SUGGEST_OTHER_TIME, beforeOpening.decision());
        assertEquals(OperationalCapacityService.Decision.SUGGEST_OTHER_TIME, afterLastAdmission.decision());
        assertTrue(beforeOpening.reasonCodes().contains("OUTSIDE_TABLE_WINDOW"));
        assertTrue(afterLastAdmission.reasonCodes().contains("OUTSIDE_TABLE_WINDOW"));
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

    @Test void occupancyRangesDoNotScaleLinearlyByPartySize() {
        assertEstimate(1, 75, 105, false);
        assertEstimate(2, 90, 120, false);
        assertEstimate(4, 105, 150, false);
        assertEstimate(8, 120, 180, false);
        assertEstimate(12, 150, 210, false);
        assertEstimate(13, 180, 240, true);
    }

    private void assertEstimate(int guests, int minimum, int maximum, boolean individualReview) {
        var estimate = new OccupancyEstimator().estimate(guests);
        assertEquals(minimum, estimate.minimumMinutes(), guests + " guests minimum");
        assertEquals(maximum, estimate.maximumMinutes(), guests + " guests maximum");
        assertEquals(individualReview, estimate.requiresIndividualReview(), guests + " guests review");
    }
}
