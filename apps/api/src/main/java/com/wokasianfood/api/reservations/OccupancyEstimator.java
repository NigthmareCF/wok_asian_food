package com.wokasianfood.api.reservations;

import org.springframework.stereotype.Component;

/** Configurable defaults are intentionally conservative until real dwell-time data is available. */
@Component
public class OccupancyEstimator {
    public Estimate estimate(int guests) {
        if (guests < 1) throw new IllegalArgumentException("guest count must be positive");
        if (guests == 1) return new Estimate(75, 105, false);
        if (guests == 2) return new Estimate(90, 120, false);
        if (guests <= 4) return new Estimate(105, 150, false);
        if (guests <= 8) return new Estimate(120, 180, false);
        if (guests <= 12) return new Estimate(150, 210, false);
        return new Estimate(180, 240, true);
    }
    public record Estimate(int minimumMinutes, int maximumMinutes, boolean requiresIndividualReview) {}
}
