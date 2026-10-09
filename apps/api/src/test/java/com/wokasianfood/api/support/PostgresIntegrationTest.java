package com.wokasianfood.api.support;

import com.wokasianfood.api.identity.TokenService;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers(disabledWithoutDocker = true)
public abstract class PostgresIntegrationTest {

    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");

    protected static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:18-alpine")
            .withDatabaseName("wok")
            .withUsername("wok")
            .withPassword("wok_test_password");

    static {
        if (DockerClientFactory.instance().isDockerAvailable()) {
            DATABASE.start();
        }
    }

    @LocalServerPort
    protected int port;

    @Autowired
    protected JdbcTemplate jdbc;

    @Autowired
    protected TokenService tokens;

    private final HttpClient http = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", DATABASE::getUsername);
        properties.add("spring.datasource.password", DATABASE::getPassword);
        properties.add("wok.auth.jwt-secret-base64",
                () -> "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
        properties.add("wok.auth.challenge-pepper-base64",
                () -> "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=");
        properties.add("wok.auth.issuer", () -> "https://identity.wok.test");
        properties.add("wok.email.poll-ms", () -> "3600000");
        properties.add("wok.fiscal.poll-ms", () -> "3600000");
        properties.add("wok.payments.poll-ms", () -> "3600000");
        properties.add("wok.orders.capacity-hold-poll-ms", () -> "3600000");
    }

    protected UUID createUserWithRole(String email, String roleCode) {
        UUID userId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.users (id, email, display_name, status, email_verified_at)
            VALUES (?, ?, ?, 'ACTIVE', now())
            """, userId, email, roleCode);
        if (roleCode != null) {
            jdbc.update("""
                INSERT INTO wok.user_roles (user_id, role_id)
                SELECT ?, id FROM wok.roles WHERE code = ?
                """, userId, roleCode);
        }
        return userId;
    }

    /** Opens today's and tomorrow's remote-service windows for schedule-independent tests. */
    protected void allowRemoteRequestsAtAnyTimeToday() {
        LocalDate today = LocalDate.now(RESTAURANT_ZONE);
        for (LocalDate date = today; !date.isAfter(today.plusDays(1)); date = date.plusDays(1)) {
            setHours("PICKUP", date.getDayOfWeek().getValue(), LocalTime.MIDNIGHT, LocalTime.of(23, 59, 59));
            setHours("DELIVERY", date.getDayOfWeek().getValue(), LocalTime.MIDNIGHT, LocalTime.of(23, 59, 59));
        }
    }

    /** Restores the configured baseline for today after a schedule-independent test. */
    protected void restoreBaselineRemoteHoursToday() {
        LocalDate today = LocalDate.now(RESTAURANT_ZONE);
        for (LocalDate date = today; !date.isAfter(today.plusDays(1)); date = date.plusDays(1)) {
            int weekday = date.getDayOfWeek().getValue();
            if (weekday == 1) {
                jdbc.update("DELETE FROM wok.business_hours WHERE weekday = ? AND service_type IN ('PICKUP', 'DELIVERY')", weekday);
            } else {
                setHours("PICKUP", weekday, LocalTime.of(14, 0), LocalTime.of(21, 30));
                setHours("DELIVERY", weekday, LocalTime.of(14, 0), LocalTime.of(21, 0));
            }
        }
    }

    private void setTodayHours(String serviceType, LocalTime opensAt, LocalTime closesAt) {
        setHours(serviceType, LocalDate.now(RESTAURANT_ZONE).getDayOfWeek().getValue(), opensAt, closesAt);
    }

    private void setHours(String serviceType, int weekday, LocalTime opensAt, LocalTime closesAt) {
        jdbc.update("""
            INSERT INTO wok.business_hours (service_type, weekday, opens_at, closes_at, timezone_name, active)
            VALUES (?, ?, ?, ?, 'America/Guatemala', true)
            ON CONFLICT (service_type, weekday) DO UPDATE
            SET opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at,
                timezone_name = EXCLUDED.timezone_name, active = true
            """, serviceType, weekday, opensAt, closesAt);
    }

    protected UUID openSession(UUID userId) {
        UUID sessionId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.auth_sessions (id, user_id, client_type, expires_at)
            VALUES (?, ?, 'WEB', now() + interval '1 hour')
            """, sessionId, userId);
        return sessionId;
    }

    protected String tokenForRole(String roleCode) {
        return tokenFor(createUserWithRole(roleCode.toLowerCase() + "-" + UUID.randomUUID() + "@wok.test", roleCode));
    }

    protected String tokenFor(UUID userId) {
        return tokens.access(userId, openSession(userId));
    }

    protected HttpResponse<String> get(String path, String token) {
        return send("GET", path, token, null, Map.of());
    }

    protected HttpResponse<String> post(String path, String token, String body) {
        return post(path, token, body, Map.of());
    }

    protected HttpResponse<String> post(String path, String token, String body, Map<String, String> headers) {
        return send("POST", path, token, body, headers);
    }

    protected HttpResponse<String> patch(String path, String token, String body) {
        return send("PATCH", path, token, body, Map.of());
    }

    protected HttpResponse<String> patch(String path, String token, String body, Map<String, String> headers) {
        return send("PATCH", path, token, body, headers);
    }

    protected HttpResponse<String> send(String method, String path, String token, String body,
                                        Map<String, String> headers) {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl() + path));
        request.header("Content-Type", "application/json");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        headers.forEach(request::header);
        request.method(method, body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body));
        try {
            return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        } catch (IOException failure) {
            throw new IllegalStateException(failure);
        }
    }

    protected String baseUrl() {
        return "http://127.0.0.1:" + port;
    }
}
