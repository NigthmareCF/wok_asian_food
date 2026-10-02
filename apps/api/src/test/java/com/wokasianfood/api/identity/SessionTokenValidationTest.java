package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;

class SessionTokenValidationTest {
    private final SecurityConfig config = new SecurityConfig();
    private final AuthSecrets secrets = new AuthSecrets(Base64.getEncoder().encodeToString(new byte[32]),
            Base64.getEncoder().encodeToString(new byte[32]));
    private final AuthIssuer issuer = new AuthIssuer("https://identity.wok.test");
    private final UUID userId = UUID.randomUUID();
    private final UUID sessionId = UUID.randomUUID();

    @Test
    void acceptsANewSessionInTheSameSecondAsAPasswordReset() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Instant issuedAt = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Instant passwordResetAt = issuedAt.plusMillis(100);
        Instant newSessionCreatedAt = issuedAt.plusMillis(200);
        when(jdbc.queryForObject(contains("s.created_at >= u.sessions_valid_after"), eq(Boolean.class),
                eq(sessionId), eq(userId))).thenReturn(!newSessionCreatedAt.isBefore(passwordResetAt));

        assertEquals(userId.toString(), config.jwtDecoder(secrets, jdbc, issuer).decode(token(issuedAt)).getSubject());
        verify(jdbc).queryForObject(contains("s.created_at >= u.sessions_valid_after"), eq(Boolean.class),
                eq(sessionId), eq(userId));
    }

    @Test
    void rejectsSessionsCreatedBeforeTheInvalidationBoundary() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("s.created_at >= u.sessions_valid_after"), eq(Boolean.class),
                eq(sessionId), eq(userId))).thenReturn(false);

        assertThrows(JwtException.class, () -> config.jwtDecoder(secrets, jdbc, issuer).decode(token(Instant.now())));
    }

    private String token(Instant issuedAt) {
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer(issuer.value()).subject(userId.toString())
                .issuedAt(issuedAt).expiresAt(issuedAt.plusSeconds(900)).claim("sid", sessionId.toString()).build();
        return config.jwtEncoder(secrets).encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
