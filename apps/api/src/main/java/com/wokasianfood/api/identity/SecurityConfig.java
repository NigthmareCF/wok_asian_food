package com.wokasianfood.api.identity;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean
    JwtEncoder jwtEncoder(AuthSecrets secrets) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(secrets.jwtKey().getEncoded()));
    }

    @Bean
    JwtDecoder jwtDecoder(AuthSecrets secrets, JdbcTemplate jdbc,
                          @Value("${wok.auth.issuer}") String issuer) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(secrets.jwtKey())
                .macAlgorithm(MacAlgorithm.HS256).build();
        var standard = JwtValidators.createDefaultWithIssuer(issuer);
        decoder.setJwtValidator(jwt -> {
            var result = standard.validate(jwt);
            if (result.hasErrors()) return result;
            UUID sessionId;
            UUID userId;
            try {
                sessionId = UUID.fromString(jwt.getClaimAsString("sid"));
                userId = UUID.fromString(jwt.getSubject());
            } catch (IllegalArgumentException malformedIdentity) {
                return OAuth2TokenValidatorResult.failure(new org.springframework.security.oauth2.core.OAuth2Error("session_invalid"));
            }
            Instant issuedAt = jwt.getIssuedAt();
            if (issuedAt == null) return OAuth2TokenValidatorResult.failure(
                    new org.springframework.security.oauth2.core.OAuth2Error("session_invalid"));
            Boolean valid = jdbc.queryForObject("""
                SELECT EXISTS (
                  SELECT 1 FROM wok.auth_sessions s JOIN wok.users u ON u.id = s.user_id
                  WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL
                    AND s.expires_at > now() AND u.status = 'ACTIVE'
                    AND u.sessions_valid_after <= ?
                )
                """, Boolean.class, sessionId, userId, Timestamp.from(issuedAt));
            if (Boolean.TRUE.equals(valid)) return OAuth2TokenValidatorResult.success();
            return OAuth2TokenValidatorResult.failure(new org.springframework.security.oauth2.core.OAuth2Error("session_invalid"));
        });
        return decoder;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder decoder, JdbcTemplate jdbc) throws Exception {
        return http
            .csrf(csrf -> csrf.disable()) // Bearer-only API; web refresh cookies require a separate CSRF design.
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health/**", "/api/v1/openapi/**", "/swagger-ui/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/verify", "/api/v1/auth/login",
                    "/api/v1/auth/refresh", "/api/v1/auth/reset/request", "/api/v1/auth/reset/complete", "/api/v1/auth/google").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/public/**").permitAll()
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.decoder(decoder)
                .jwtAuthenticationConverter(token -> authorities(token, jdbc))))
            .build();
    }

    private AbstractAuthenticationToken authorities(Jwt jwt, JdbcTemplate jdbc) {
        UUID userId = UUID.fromString(jwt.getSubject());
        List<SimpleGrantedAuthority> roles = jdbc.query("""
            SELECT DISTINCT 'ROLE_' || r.code AS code FROM wok.user_roles ur
            JOIN wok.roles r ON r.id = ur.role_id
            WHERE ur.user_id = ? AND ur.revoked_at IS NULL AND r.active
            UNION
            SELECT DISTINCT p.code FROM wok.user_roles ur
            JOIN wok.roles r ON r.id = ur.role_id
            JOIN wok.role_permissions rp ON rp.role_id = r.id
            JOIN wok.permissions p ON p.id = rp.permission_id
            WHERE ur.user_id = ? AND ur.revoked_at IS NULL AND r.active
            """, (rs, row) -> new SimpleGrantedAuthority(rs.getString("code")), userId, userId);
        return new JwtAuthenticationToken(jwt, roles, jwt.getSubject());
    }
}
