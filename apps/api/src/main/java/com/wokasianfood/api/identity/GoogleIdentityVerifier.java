package com.wokasianfood.api.identity;

/** Verifies Google OIDC signature, audience, issuer, expiry, nonce and stable subject before WOK issues a session. */
public interface GoogleIdentityVerifier {
    VerifiedIdentity verify(String idToken, String expectedNonce);
    record VerifiedIdentity(String subject, String email, boolean emailVerified) {}
}
