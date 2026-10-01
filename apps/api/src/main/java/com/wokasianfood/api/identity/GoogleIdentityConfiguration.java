package com.wokasianfood.api.identity;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.MappedJwtClaimSetConverter;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

@Configuration
public class GoogleIdentityConfiguration {
    private static final String GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
    private static final Set<String> GOOGLE_ISSUERS = Set.of("https://accounts.google.com", "accounts.google.com");

    @Bean
    GoogleIdentityVerifier googleIdentityVerifier(@Value("${wok.auth.google.client-id:}") String clientId) {
        if (clientId == null || clientId.isBlank()) return new UnavailableGoogleIdentityVerifier();

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(GOOGLE_JWKS_URI).build();
        var defaults = MappedJwtClaimSetConverter.withDefaults(Map.of());
        decoder.setClaimSetConverter(claims -> {
            var normalized = new HashMap<>(claims);
            if ("accounts.google.com".equals(normalized.get("iss"))) {
                normalized.put("iss", "https://accounts.google.com");
            }
            return defaults.convert(normalized);
        });
        OAuth2TokenValidator<Jwt> issuer = jwt -> jwt.getIssuer() != null && GOOGLE_ISSUERS.contains(jwt.getIssuer().toString())
                ? OAuth2TokenValidatorResult.success() : invalidToken();
        OAuth2TokenValidator<Jwt> audience = jwt -> jwt.getAudience().contains(clientId.trim())
                ? OAuth2TokenValidatorResult.success() : invalidToken();
        OAuth2TokenValidator<Jwt> subject = jwt -> jwt.getSubject() != null && !jwt.getSubject().isBlank()
                ? OAuth2TokenValidatorResult.success() : invalidToken();
        OAuth2TokenValidator<Jwt> issuedAt = jwt -> jwt.getIssuedAt() != null
                && !jwt.getIssuedAt().isAfter(Instant.now().plusSeconds(60))
                ? OAuth2TokenValidatorResult.success() : invalidToken();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtTimestampValidator(Duration.ofSeconds(60)), issuer, audience, subject, issuedAt));
        return new GoogleOidcIdentityVerifier(clientId, decoder);
    }

    private static OAuth2TokenValidatorResult invalidToken() {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
    }
}
