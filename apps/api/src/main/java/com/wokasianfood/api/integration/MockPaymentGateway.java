package com.wokasianfood.api.integration;

import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class MockPaymentGateway implements PaymentGateway {
    @Override public PaymentIntent createIntent(UUID orderId, BigDecimal amount, String currency, String idempotencyKey) {
        if (amount == null || amount.signum() <= 0 || idempotencyKey == null || idempotencyKey.isBlank())
            throw new IllegalArgumentException("invalid payment intent");
        return new PaymentIntent("mock-" + UUID.randomUUID(), State.PENDING);
    }
}
