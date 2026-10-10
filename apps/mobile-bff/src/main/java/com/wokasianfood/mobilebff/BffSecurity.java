package com.wokasianfood.mobilebff;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

@Configuration
class BffSecurity {
    @Bean
    SecurityFilterChain security(HttpSecurity http, CoreApiClient core, ClientRoutes routes, JsonMapper json,
                                 RequestLimits limits, @Value("${wok.bff.allowed-origins}") String origins) throws Exception {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
        cors.setExposedHeaders(List.of("X-Request-Id", "Retry-After"));
        cors.setAllowCredentials(false);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        return http.csrf(csrf -> csrf.disable()) // Bearer-only; no cookie session is accepted or forwarded.
                .cors(config -> config.configurationSource(source))
                .httpBasic(config -> config.disable()).formLogin(config -> config.disable())
                .logout(config -> config.disable()).requestCache(config -> config.disable())
                .sessionManagement(config -> config.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(config -> config
                        .requestMatchers(request -> request.getMethod().equals("GET")
                                && request.getRequestURI().equals("/actuator/health")).permitAll()
                        .requestMatchers(request -> {
                            var route = routes.find(request.getMethod(), request.getRequestURI());
                            return route != null && route.publicAccess();
                        }).permitAll().anyRequest().hasRole("CLIENT"))
                .addFilterBefore(new AccessFilter(core, routes, json, limits), AnonymousAuthenticationFilter.class)
                .build();
    }

    private static final class AccessFilter extends OncePerRequestFilter {
        private final CoreApiClient core;
        private final ClientRoutes routes;
        private final JsonMapper json;
        private final RequestLimits limits;

        AccessFilter(CoreApiClient core, ClientRoutes routes, JsonMapper json, RequestLimits limits) {
            this.core = core; this.routes = routes; this.json = json; this.limits = limits;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            String requestId = UUID.randomUUID().toString();
            request.setAttribute("bff.requestId", requestId);
            response.setHeader("X-Request-Id", requestId);
            response.setHeader("Cache-Control", "no-store");
            try {
                String path = request.getRequestURI();
                if (path.equals("/actuator/health") && request.getMethod().equals("GET")) {
                    chain.doFilter(request, response);
                    return;
                }
                var route = routes.find(request.getMethod(), path);
                if (route == null) throw new BffFailure(404);
                if (request.getQueryString() != null) throw new BffFailure(400);
                if (route.publicAccess()) {
                    limits.check("public:" + request.getRemoteAddr(), 120);
                } else {
                    String authorization = request.getHeader("Authorization");
                    if (authorization == null || !authorization.matches("Bearer [A-Za-z0-9._~-]{1,8192}")) {
                        throw new BffFailure(401);
                    }
                    // Core checks signature, expiry, revocation, active account and CLIENT role on every request.
                    var profile = core.exchange("GET", "/api/v1/client/profile", authorization, null,
                            new byte[0], requestId, request.getRemoteAddr());
                    if (profile.status() != 200) throw new BffFailure(503);
                    String userId;
                    try { userId = UUID.fromString(json.readTree(profile.body()).path("userId").asString("")).toString(); }
                    catch (RuntimeException invalidCoreResponse) { throw new BffFailure(503); }
                    limits.check("client:" + userId, 120);
                    if (path.startsWith("/api/v1/client/conversations") && request.getMethod().equals("POST")) {
                        limits.check("chat:" + userId, 30);
                    }
                    request.setAttribute("bff.profile", profile);
                    SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                            userId, null, List.of(new SimpleGrantedAuthority("ROLE_CLIENT"))));
                }
                chain.doFilter(request, response);
            } catch (BffFailure failure) {
                response.setStatus(failure.status);
                response.setContentType("application/json");
                if (failure.status == 429) response.setHeader("Retry-After", "60");
                response.getOutputStream().write(json.writeValueAsBytes(failure.body(requestId)));
            }
        }
    }
}
