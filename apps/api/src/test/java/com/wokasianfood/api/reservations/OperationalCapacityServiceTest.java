package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.LocalTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class OperationalCapacityServiceTest {
    private static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private final OperationalCapacityService capacity = new OperationalCapacityService(new OccupancyEstimator(),
            date -> Optional.of(new OperatingHoursProvider.Window(LocalTime.of(14, 0), LocalTime.of(22, 0), ZONE)));

    private Instant at(int hour, int minute) {
        return LocalDateTime.of(2026, 9, 26, hour, minute).atZone(ZONE).toInstant();
    }

    @Test
    void rejectsLessThanThreeHoursForTableRequests() {
        var result = capacity.assessTable(2, at(18, 0), at(15, 1), false);
        assertThat(result.decision()).isEqualTo(OperationalCapacityService.Decision.REJECT);
        assertThat(result.reasonCodes()).contains("MINIMUM_NOTICE_3_HOURS");
    }

    @Test
    void threeHourNoticeRejectsOneSecondEarlyAndAllowsExactBoundaryForReview() {
        Instant now = Instant.parse("2026-10-05T20:00:00Z");
        Instant exactBoundary = Instant.parse("2026-10-05T23:00:00Z");

        var early = capacity.assessTable(2, exactBoundary.minusSeconds(1), now, false);
        var exact = capacity.assessTable(2, exactBoundary, now, false);

        assertThat(early.decision()).isEqualTo(OperationalCapacityService.Decision.REJECT);
        assertThat(early.reasonCodes()).contains("MINIMUM_NOTICE_3_HOURS");
        assertThat(exact.decision()).isEqualTo(OperationalCapacityService.Decision.REQUIRES_HUMAN_APPROVAL);
        assertThat(exact.reasonCodes()).doesNotContain("MINIMUM_NOTICE_3_HOURS");
    }

    @Test
    void lateSmallPartyMayBeReviewedButLargePartyIsNeverAutoAccepted() {
        Instant now = Instant.parse("2026-10-05T18:00:00Z");
        Instant lastEntry = Instant.parse("2026-10-06T03:15:00Z");

        var smallParty = capacity.assessTable(2, lastEntry, now, false);
        var largeParty = capacity.assessTable(20, lastEntry, now, true);

        assertThat(smallParty.decision()).isEqualTo(OperationalCapacityService.Decision.REQUIRES_HUMAN_APPROVAL);
        assertThat(largeParty.decision()).isEqualTo(OperationalCapacityService.Decision.REQUIRES_HUMAN_APPROVAL);
        assertThat(largeParty.reasonCodes()).contains("LARGE_OR_LATE_GROUP");
        assertThat(smallParty.publicMessage()).doesNotContain("22:00");
        assertThat(largeParty.publicMessage()).doesNotContain("22:00");
    }

    @Test
    void largeGroupAtLastAdmissionRequiresHumanApprovalWithoutClosingCommand() {
        var result = capacity.assessTable(20, at(21, 15), at(17, 0), true);
        assertThat(result.decision()).isEqualTo(OperationalCapacityService.Decision.REQUIRES_HUMAN_APPROVAL);
        assertThat(result.publicMessage()).doesNotContain("retirarse");
    }

    @Test
    void twoPeopleAtLastAdmissionAreNotRejectedSolelyForClosingTime() {
        var result = capacity.assessTable(2, at(21, 15), at(17, 0), true);
        assertThat(result.decision()).isNotEqualTo(OperationalCapacityService.Decision.REJECT);
        assertThat(result.occupancy().minimumMinutes()).isEqualTo(90);
    }

    @Test
    void closedWeekdaySuggestsAnotherDateInsteadOfOpeningARequest() {
        var closed = new OperationalCapacityService(new OccupancyEstimator(), date -> Optional.empty());
        var result = closed.assessTable(2, at(18, 0), at(14, 0), false);
        assertThat(result.decision()).isEqualTo(OperationalCapacityService.Decision.SUGGEST_OTHER_TIME);
        assertThat(result.reasonCodes()).contains("RESTAURANT_CLOSED");
    }

    @Test
    void configuredOpeningAndClosingTimesControlTheEvaluationWindow() {
        var configured = new OperationalCapacityService(new OccupancyEstimator(), date ->
                Optional.of(new OperatingHoursProvider.Window(LocalTime.of(16, 0), LocalTime.of(20, 0), ZONE)));
        var beforeOpen = configured.assessTable(2, at(15, 59), at(10, 0), false);
        var afterConfiguredClose = configured.assessTable(2, at(20, 0), at(14, 0), false);
        assertThat(beforeOpen.reasonCodes()).contains("OUTSIDE_TABLE_WINDOW");
        assertThat(afterConfiguredClose.reasonCodes()).contains("OUTSIDE_TABLE_WINDOW");
    }
}
