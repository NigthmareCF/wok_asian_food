package com.wokasianfood.api.integration;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

/** Deterministic mock for local flows; it never claims that a payment was captured. */
@Component
public class MockPaymentGateway implements PaymentGateway {
    private final ConcurrentMap<String, IntentEntry> intents = new ConcurrentHashMap<>();

    @Override
    public PaymentIntent createIntent(UUID orderId, BigDecimal amount, String currency, String idempotencyKey) {
        if (orderId == null || amount == null || amount.signum() <= 0 || currency == null
                || !currency.trim().matches("(?i)[a-z]{3}") || idempotencyKey == null
                || idempotencyKey.isBlank() || idempotencyKey.length() > 128) {
            throw new IllegalArgumentException("invalid payment intent");
        }
        BigDecimal normalizedAmount = amount.stripTrailingZeros();
        String normalizedCurrency = currency.trim().toUpperCase(Locale.ROOT);
        IntentEntry requested = new IntentEntry(orderId, normalizedAmount, normalizedCurrency,
                new PaymentIntent(reference(idempotencyKey), State.PENDING));
        IntentEntry result = intents.compute(idempotencyKey, (key, existing) -> {
            if (existing == null) return requested;
            if (!existing.sameRequest(requested)) {
                throw new IllegalArgumentException("idempotency key reused with a different payment intent");
            }
            return existing;
        });
        return result.intent();
    }

    private String reference(String idempotencyKey) {
        byte[] input = ("wok-mock-payment:" + idempotencyKey).getBytes(StandardCharsets.UTF_8);
        return "mock-" + UUID.nameUUIDFromBytes(input);
    }

    private record IntentEntry(UUID orderId, BigDecimal amount, String currency, PaymentIntent intent) {
        boolean sameRequest(IntentEntry other) {
            return orderId.equals(other.orderId) && amount.compareTo(other.amount) == 0
                    && Objects.equals(currency, other.currency);
        }
    }
}
