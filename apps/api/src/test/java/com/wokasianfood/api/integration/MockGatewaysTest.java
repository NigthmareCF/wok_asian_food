package com.wokasianfood.api.integration;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MockGatewaysTest {
    @Test void paymentMockNeverClaimsCapture() {
        var intent = new MockPaymentGateway().createIntent(UUID.randomUUID(), new BigDecimal("12.50"), "GTQ", "test-1");
        assertEquals(PaymentGateway.State.PENDING, intent.state());
        assertTrue(intent.providerReference().startsWith("mock-"));
    }

    @Test void felMockNeverClaimsCertification() {
        var result = new MockFelGateway().certify(UUID.randomUUID(), "<xml/>".getBytes(), "test-2");
        assertEquals(FelGateway.State.PENDING_CERTIFICATION, result.state());
    }
}
