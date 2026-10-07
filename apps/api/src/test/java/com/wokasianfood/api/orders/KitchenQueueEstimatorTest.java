package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class KitchenQueueEstimatorTest {
    @Test
    void reportsMaximumStationQueueAndPreparationSeparatelyFromCriticalPathEta() {
        JdbcTemplate jdbc = org.mockito.Mockito.mock(JdbcTemplate.class);
        UUID sushi = UUID.randomUUID();
        UUID hotKitchen = UUID.randomUUID();
        when(jdbc.queryForObject(org.mockito.ArgumentMatchers.contains("MAX(estimated_ready_at)"),
                org.mockito.ArgumentMatchers.eq(Long.class), org.mockito.ArgumentMatchers.eq(sushi))).thenReturn(30L);
        when(jdbc.queryForObject(org.mockito.ArgumentMatchers.contains("MAX(estimated_ready_at)"),
                org.mockito.ArgumentMatchers.eq(Long.class), org.mockito.ArgumentMatchers.eq(hotKitchen))).thenReturn(50L);

        KitchenQueueEstimator.Estimate estimate = new KitchenQueueEstimator(jdbc)
                .estimate(Map.of(sushi, 20L, hotKitchen, 40L), false);

        assertThat(estimate.stations()).hasSize(2);
        assertThat(estimate.overallReadySeconds()).isEqualTo(90L);
        assertThat(estimate.stations()).extracting(KitchenQueueEstimator.StationEstimate::queueDelaySeconds)
                .containsExactlyInAnyOrder(30L, 50L);
        assertThat(estimate.stations()).extracting(KitchenQueueEstimator.StationEstimate::preparationSeconds)
                .containsExactlyInAnyOrder(20L, 40L);
    }
}
