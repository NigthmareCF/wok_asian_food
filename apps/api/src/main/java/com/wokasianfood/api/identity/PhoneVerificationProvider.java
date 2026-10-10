package com.wokasianfood.api.identity;

import java.time.Instant;
import java.util.UUID;

/** An authorized transport must deliver this transient code to the exact number.
 * Test transports MUST return false from provesRealPossession(). Never log the code. */
public interface PhoneVerificationProvider {
    boolean available();
    boolean provesRealPossession();
    void send(UUID challengeId, String phone, String code, Instant expiresAt);
}
