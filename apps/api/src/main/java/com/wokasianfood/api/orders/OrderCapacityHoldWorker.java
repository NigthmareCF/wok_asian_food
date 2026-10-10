package com.wokasianfood.api.orders;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Reclaims expired station capacity without relying on another customer request. */
@Component
public class OrderCapacityHoldWorker {
    private final OrderCapacityHoldService holds;

    public OrderCapacityHoldWorker(OrderCapacityHoldService holds) { this.holds = holds; }

    @Scheduled(fixedDelayString = "${wok.orders.capacity-hold-poll-ms:5000}")
    public void expireDue() { holds.expireDue(); }
}
