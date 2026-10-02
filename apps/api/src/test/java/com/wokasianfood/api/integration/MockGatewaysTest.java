package com.wokasianfood.api.integration;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class MockGatewaysTest {
    @Test void paymentMockNeverClaimsCapture() {
        var gateway = new MockPaymentGateway();
        var orderId = UUID.randomUUID();
        var intent = gateway.createIntent(orderId, new BigDecimal("12.50"), "GTQ", "test-1");
        assertEquals(PaymentGateway.State.PENDING, intent.state());
        assertTrue(intent.providerReference().startsWith("mock-"));
        assertEquals(intent, gateway.createIntent(orderId, new BigDecimal("12.500"), "gtq", "test-1"));
        assertThrows(IllegalArgumentException.class,
                () -> gateway.createIntent(orderId, new BigDecimal("13.00"), "GTQ", "test-1"));
    }

    @Test void felMockNeverClaimsCertification() {
        var gateway = new MockFelGateway();
        var invoiceId = UUID.randomUUID();
        byte[] xml = "<xml/>".getBytes();
        var result = gateway.certify(invoiceId, xml, "test-2");
        assertEquals(FelGateway.State.PENDING_CERTIFICATION, result.state());
        assertEquals(result, gateway.certify(invoiceId, xml.clone(), "test-2"));
        assertThrows(IllegalArgumentException.class,
                () -> gateway.certify(invoiceId, "<xml>changed</xml>".getBytes(), "test-2"));
    }

    @Test void concurrentDuplicatePaymentIntentReturnsOneStableReference() throws Exception {
        var gateway = new MockPaymentGateway();
        var orderId = UUID.randomUUID();
        try (var executor = Executors.newFixedThreadPool(8)) {
            List<java.util.concurrent.Future<PaymentGateway.PaymentIntent>> calls = new ArrayList<>();
            for (int i = 0; i < 32; i++) calls.add(executor.submit(() ->
                    gateway.createIntent(orderId, new BigDecimal("21.00"), "GTQ", "concurrent-payment")));
            var expected = calls.getFirst().get();
            for (var call : calls) assertEquals(expected, call.get());
        }
    }
}
