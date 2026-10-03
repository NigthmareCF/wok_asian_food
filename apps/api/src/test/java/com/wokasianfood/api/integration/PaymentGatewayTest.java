package com.wokasianfood.api.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class PaymentGatewayTest {
    @Test
    void mockReturnsPendingAndReplaysOnlyTheSameIntent() {
        MockPaymentGateway gateway = new MockPaymentGateway();
        UUID orderId = UUID.randomUUID();

        PaymentGateway.PaymentIntent first = gateway.createIntent(orderId, new BigDecimal("12.50"), "GTQ", "key-1");

        assertEquals(PaymentGateway.State.PENDING, first.state());
        assertTrue(first.providerReference().startsWith("mock-"));
        assertEquals(first, gateway.createIntent(orderId, new BigDecimal("12.500"), " gtq ", "key-1"));
        assertThrows(IllegalArgumentException.class,
                () -> gateway.createIntent(orderId, new BigDecimal("13.00"), "GTQ", "key-1"));
    }

    @Test
    void concurrentRequestsWithSameKeyReturnOneStableIntent() throws Exception {
        MockPaymentGateway gateway = new MockPaymentGateway();
        UUID orderId = UUID.randomUUID();
        try (var executor = Executors.newFixedThreadPool(8)) {
            List<java.util.concurrent.Future<PaymentGateway.PaymentIntent>> calls = new ArrayList<>();
            for (int index = 0; index < 32; index++) {
                calls.add(executor.submit(() -> gateway.createIntent(orderId, new BigDecimal("21.00"),
                        "GTQ", "concurrent-key")));
            }
            PaymentGateway.PaymentIntent expected = calls.getFirst().get();
            for (var call : calls) assertEquals(expected, call.get());
        }
    }

    @Test
    void rejectsInvalidProviderRequestValues() {
        MockPaymentGateway gateway = new MockPaymentGateway();
        UUID orderId = UUID.randomUUID();
        assertThrows(IllegalArgumentException.class,
                () -> gateway.createIntent(orderId, BigDecimal.ZERO, "GTQ", "key"));
        assertThrows(IllegalArgumentException.class,
                () -> gateway.createIntent(orderId, BigDecimal.ONE, "QUETZALES", "key"));
        assertThrows(IllegalArgumentException.class,
                () -> gateway.createIntent(orderId, BigDecimal.ONE, "GTQ", " "));
    }
}
