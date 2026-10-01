package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

class GoogleOidcIdentityVerifierTest {
    private static final String CLIENT_ID = "wok-mobile.apps.googleusercontent.com";
    private final JwtDecoder decoder = mock(JwtDecoder.class);
    private final GoogleOidcIdentityVerifier verifier = new GoogleOidcIdentityVerifier(CLIENT_ID, decoder);

    @Test
    void returnsStableSubjectOnlyAfterAudienceIssuerAndNonceMatch() {
        when(decoder.decode("signed-token")).thenReturn(identityToken(
                "https://accounts.google.com", CLIENT_ID, "google-subject-123", "nonce-123", true));

        var identity = verifier.verify("signed-token", "nonce-123");

        assertEquals("google-subject-123", identity.subject());
        assertEquals("customer@example.com", identity.email());
        assertTrue(identity.emailVerified());
    }

    @Test
    void acceptsTheDocumentedLegacyIssuerButRequiresTheExpectedAudience() {
        when(decoder.decode("legacy-token")).thenReturn(identityToken(
                "accounts.google.com", CLIENT_ID, "google-subject-123", "nonce-123", true));
        assertEquals("google-subject-123", verifier.verify("legacy-token", "nonce-123").subject());

        when(decoder.decode("wrong-audience")).thenReturn(identityToken(
                "https://accounts.google.com", "another-client", "google-subject-123", "nonce-123", true));
        assertEquals(401, assertThrows(AuthException.class,
                () -> verifier.verify("wrong-audience", "nonce-123")).status());
    }

    @Test
    void rejectsWrongNonceIssuerAndUnverifiedEmail() {
        when(decoder.decode("wrong-nonce")).thenReturn(identityToken(
                "https://accounts.google.com", CLIENT_ID, "google-subject-123", "nonce-other", true));
        when(decoder.decode("wrong-issuer")).thenReturn(identityToken(
                "https://attacker.example", CLIENT_ID, "google-subject-123", "nonce-123", true));
        when(decoder.decode("unverified-email")).thenReturn(identityToken(
                "https://accounts.google.com", CLIENT_ID, "google-subject-123", "nonce-123", false));

        assertEquals(401, assertThrows(AuthException.class,
                () -> verifier.verify("wrong-nonce", "nonce-123")).status());
        assertEquals(401, assertThrows(AuthException.class,
                () -> verifier.verify("wrong-issuer", "nonce-123")).status());
        assertFalse(verifier.verify("unverified-email", "nonce-123").emailVerified());
    }

    @Test
    void disabledConfigurationAndJwksNetworkFailureAreUnavailable() {
        var disabled = new GoogleOidcIdentityVerifier(" ", decoder);
        assertEquals(503, assertThrows(AuthException.class,
                () -> disabled.verify("token", "nonce")).status());

        when(decoder.decode("network-error")).thenThrow(new JwtException("JWKS unavailable", new IOException("offline")));
        assertEquals(503, assertThrows(AuthException.class,
                () -> verifier.verify("network-error", "nonce-123")).status());
    }

    private Jwt identityToken(String issuer, String audience, String subject, String nonce, boolean verified) {
        Instant now = Instant.now();
        return new Jwt("test-token", now.minusSeconds(10), now.plusSeconds(60),
                Map.of("alg", "RS256"), Map.of("iss", issuer, "sub", subject, "aud", List.of(audience),
                "nonce", nonce, "email", "customer@example.com", "email_verified", verified,
                "iat", now.minusSeconds(10), "exp", now.plusSeconds(60)));
    }
}
