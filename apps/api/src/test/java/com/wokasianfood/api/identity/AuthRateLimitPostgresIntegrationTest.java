package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

@Import(AuthRateLimitPostgresIntegrationTest.RemoteAddressTestConfiguration.class)
@org.springframework.test.context.TestPropertySource(properties = "wok.http.trusted-proxies=127.0.0.1/32")
@Execution(ExecutionMode.SAME_THREAD)
class AuthRateLimitPostgresIntegrationTest extends PostgresIntegrationTest {
    private static final String PATH = "/api/v1/auth/verify/resend";
    private static final String INVALID_REMOTE_HEADER = "X-Test-Invalid-Remote-Address";

    @BeforeEach
    @AfterEach
    void clearResendAttempts() {
        // The shared Testcontainers database contains test data only.
        jdbc.update("DELETE FROM wok.auth_rate_limit_events WHERE action = 'RESEND'");
        jdbc.update("""
                DELETE FROM wok.security_events
                WHERE event_type = 'AUTH_RATE_LIMITED' AND details->>'action' = 'RESEND'
                """);
    }

    static Stream<Arguments> addresses() {
        return Stream.of(
                Arguments.of("203.0.113.7", false, "203.0.113.7", "203.0.113.7"),
                Arguments.of("2001:db8::7", false, "2001:db8:0:0:0:0:0:7", "2001:db8::7"),
                Arguments.of("invalid-forwarded-address", false, "127.0.0.1", "127.0.0.1"),
                Arguments.of("invalid-forwarded-address", true, "UNKNOWN", null));
    }

    @ParameterizedTest
    @MethodSource("addresses")
    void enforcesIpLimitAcrossEmailsAndPersistsInetOrNull(String forwarded, boolean invalidRemote,
                                                         String counterIp, String storedIp) {
        String run = UUID.randomUUID().toString();
        for (int attempt = 1; attempt <= 10; attempt++) {
            assertAccepted(resend(run + "-" + attempt + "@example.test", forwarded, invalidRemote));
        }
        assertThat(counter("IP", counterIp)).isEqualTo(10);
        assertThat(securityEventCount()).isZero();

        assertLimited(resend(run + "-11@example.test", forwarded, invalidRemote));

        assertThat(counter("IP", counterIp)).isEqualTo(11);
        assertThat(jdbc.queryForObject("""
                SELECT count(DISTINCT subject) FROM wok.auth_rate_limit_events
                WHERE action = 'RESEND' AND scope = 'IDENTIFIER'
                """, Integer.class)).isEqualTo(11);
        assertThat(counter("IDENTIFIER", run + "-11@example.test")).isEqualTo(1);
        assertPersistedEvent(storedIp);
    }

    @ParameterizedTest
    @MethodSource("addresses")
    void enforcesEmailLimitBeforeIpLimitAndPersistsInetOrNull(String forwarded, boolean invalidRemote,
                                                             String counterIp, String storedIp) {
        String email = "client-" + UUID.randomUUID() + "@example.test";
        for (int attempt = 1; attempt <= 5; attempt++) {
            assertAccepted(resend(email, forwarded, invalidRemote));
        }
        assertThat(counter("IDENTIFIER", email)).isEqualTo(5);
        assertThat(securityEventCount()).isZero();

        assertLimited(resend(email, forwarded, invalidRemote));

        assertThat(counter("IDENTIFIER", email)).isEqualTo(6);
        assertThat(counter("IP", counterIp)).isEqualTo(6);
        assertPersistedEvent(storedIp);
    }

    private HttpResponse<String> resend(String email, String forwarded, boolean invalidRemote) {
        return post(PATH, null, "{\"email\":\"" + email + "\"}", Map.of(
                "X-Forwarded-For", forwarded,
                INVALID_REMOTE_HEADER, Boolean.toString(invalidRemote)));
    }

    private void assertAccepted(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(202);
    }

    private void assertLimited(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(429);
        assertThat(response.body()).isEqualTo("{\"message\":\"Demasiados intentos. Intenta más tarde.\"}");
    }

    private int counter(String scope, String subject) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM wok.auth_rate_limit_events
                WHERE action = 'RESEND' AND scope = ? AND subject = ?
                """, Integer.class, scope, subject);
    }

    private int securityEventCount() {
        return jdbc.queryForObject("""
                SELECT count(*) FROM wok.security_events
                WHERE event_type = 'AUTH_RATE_LIMITED' AND details->>'action' = 'RESEND'
                """, Integer.class);
    }

    private void assertPersistedEvent(String expectedIp) {
        var events = jdbc.queryForList("""
                SELECT host(ip_address) AS address, ip_address IS NULL AS unknown,
                       pg_typeof(ip_address)::text AS address_type, severity, details->>'scope' AS scope
                FROM wok.security_events
                WHERE event_type = 'AUTH_RATE_LIMITED' AND details->>'action' = 'RESEND'
                """);
        assertThat(events).hasSize(1);
        assertThat(events.getFirst()).containsEntry("address", expectedIp)
                .containsEntry("unknown", expectedIp == null)
                .containsEntry("address_type", "inet")
                .containsEntry("severity", "WARNING")
                .containsEntry("scope", "AUTH");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class RemoteAddressTestConfiguration {
        @Bean
        Filter invalidRemoteAddressFilter() {
            // A TCP peer always has a valid address. Only this test context injects the invalid case;
            // HTTP, security, controller, limiter, transactions and PostgreSQL remain real.
            return (request, response, chain) -> {
                if (request instanceof HttpServletRequest http && PATH.equals(http.getRequestURI())
                        && "true".equals(http.getHeader(INVALID_REMOTE_HEADER))) {
                    chain.doFilter(new HttpServletRequestWrapper(http) {
                        @Override
                        public String getRemoteAddr() { return "invalid-remote-address"; }
                    }, response);
                } else {
                    chain.doFilter(request, response);
                }
            };
        }
    }
}
