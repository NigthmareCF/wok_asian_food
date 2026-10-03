package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

class TokenServiceTest {
    private final AuthSecrets secrets = new AuthSecrets(Base64.getEncoder().encodeToString(new byte[32]),
            Base64.getEncoder().encodeToString(new byte[32]));

    @Test
    void accessTokenContainsOnlyWokSessionIdentityAndExpiresWithinConfiguredWindow() {
        TokenService tokens = new TokenService(
                new NimbusJwtEncoder(new ImmutableSecret<>(secrets.jwtKey().getEncoded())),
                new AuthIssuer("https://identity.wok.test"), 15, 30);
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        Instant before = Instant.now();

        var decoded = decoder().decode(tokens.access(userId, sessionId));

        assertEquals(userId.toString(), decoded.getSubject());
        assertEquals("https://identity.wok.test", decoded.getIssuer().toString());
        assertFalse(JwtValidators.createDefaultWithIssuer("https://identity.wok.test").validate(decoded).hasErrors());
        assertEquals(sessionId.toString(), decoded.getClaimAsString("sid"));
        assertTrue(Duration.between(before, decoded.getExpiresAt()).compareTo(Duration.ofMinutes(15).plusSeconds(2)) <= 0);
        assertFalse(decoded.getClaims().containsKey("email"));
        assertFalse(decoded.getClaims().containsKey("roles"));
    }

    @Test
    void refreshTokensAreOpaqueRandomValuesAndOnlyTheirDigestIsStable() {
        TokenService tokens = new TokenService(
                new NimbusJwtEncoder(new ImmutableSecret<>(secrets.jwtKey().getEncoded())),
                new AuthIssuer("https://identity.wok.test"), 10, 30);

        String first = tokens.refresh();
        String second = tokens.refresh();

        assertNotEquals(first, second);
        assertEquals(32, Base64.getUrlDecoder().decode(first).length);
        assertNotEquals(first, tokens.hash(first));
        assertEquals(64, tokens.hash(first).length());
        assertNotEquals(tokens.hash(first), tokens.hash(second));
    }

    @Test
    void rejectsInvalidTokenLifetimesAtStartup() {
        var encoder = new NimbusJwtEncoder(new ImmutableSecret<>(secrets.jwtKey().getEncoded()));

        assertThrows(IllegalArgumentException.class, () -> new TokenService(encoder, new AuthIssuer("https://identity.wok.test"), 16, 30));
        assertThrows(IllegalArgumentException.class, () -> new TokenService(encoder, new AuthIssuer("https://identity.wok.test"), 10, 0));
        assertThrows(IllegalArgumentException.class, () -> new TokenService(encoder, new AuthIssuer("wok-asian-food"), 10, 30));
        assertThrows(IllegalArgumentException.class, () -> new TokenService(encoder, new AuthIssuer("http://identity.wok.test"), 10, 30));
    }

    private JwtDecoder decoder() {
        return NimbusJwtDecoder.withSecretKey(secrets.jwtKey()).macAlgorithm(MacAlgorithm.HS256).build();
    }
}
