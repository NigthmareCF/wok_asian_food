package com.wokasianfood.api.identity;

/** Verifies Google OIDC signature, audience, issuer, expiry and stable subject before WOK issues a session. */
public interface GoogleIdentityVerifier {
    VerifiedIdentity verify(String idToken);
    record VerifiedIdentity(String subject, String email, boolean emailVerified) {}
}
