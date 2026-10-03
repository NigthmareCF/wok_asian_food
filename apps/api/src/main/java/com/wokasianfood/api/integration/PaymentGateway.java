package com.wokasianfood.api.integration;

import java.math.BigDecimal;
import java.util.UUID;

/** A created intent is not a captured payment; verified webhooks and reconciliation own final state. */
public interface PaymentGateway {
    PaymentIntent createIntent(UUID orderId, BigDecimal amount, String currency, String idempotencyKey);

    record PaymentIntent(String providerReference, State state) {}

    enum State {
        CREATED, PENDING, REQUIRES_ACTION, AUTHORIZED, CAPTURED, FAILED, CANCELLED, UNKNOWN, REFUNDED
    }
}
