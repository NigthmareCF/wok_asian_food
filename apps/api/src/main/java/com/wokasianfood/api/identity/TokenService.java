package com.wokasianfood.api.identity;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
    private final JwtEncoder encoder;
    private final SecureRandom random = new SecureRandom();
    private final String issuer;
    private final Duration accessLifetime;
    private final Duration refreshLifetime;

    public TokenService(JwtEncoder encoder, @Value("${wok.auth.issuer}") String issuer,
                        @Value("${wok.auth.access-minutes}") long accessMinutes,
                        @Value("${wok.auth.refresh-days}") long refreshDays) {
        if (accessMinutes < 1 || accessMinutes > 15) throw new IllegalArgumentException("Access token lifetime must be 1–15 minutes");
        this.encoder = encoder;
        this.issuer = issuer;
        this.accessLifetime = Duration.ofMinutes(accessMinutes);
        this.refreshLifetime = Duration.ofDays(refreshDays);
    }

    public String access(UUID userId, UUID sessionId) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer(issuer).subject(userId.toString())
                .id(UUID.randomUUID().toString()).issuedAt(now).expiresAt(now.plus(accessLifetime))
                .claim("sid", sessionId.toString()).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }

    public String refresh() {
        byte[] value = new byte[32];
        random.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    public String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public Instant refreshExpiry() { return Instant.now().plus(refreshLifetime); }
    public long accessSeconds() { return accessLifetime.toSeconds(); }
}
