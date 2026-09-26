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
}
