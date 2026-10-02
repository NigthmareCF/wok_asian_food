package com.wokasianfood.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.email.EmailOutboxWorker;
import com.wokasianfood.api.email.MockEmailProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers(disabledWithoutDocker = true)
class SecurityCompositionIntegrationTest {
    @Container
    private static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:18-alpine")
            .withDatabaseName("wok")
            .withUsername("wok")
            .withPassword("wok_test_password");

    @Value("${local.server.port}")
    private int serverPort;

    private final ObjectMapper json = new ObjectMapper();

    @Autowired
    private EmailOutboxWorker emailOutbox;

    @Autowired
    private MockEmailProvider emailProvider;

    @Autowired
    private JdbcTemplate jdbc;

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
        properties.add("wok.email.poll-ms", () -> "3600000");
    }

    @Test
    void exposesHealthOpenApiAndPublicMenuButProtectsOperationalQueue() throws Exception {
        assertThat(get("/actuator/health").statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/openapi").statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/public/menu").statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/admin/users").statusCode()).isEqualTo(401);
    }

    @Test
    void registersVerifiesLogsInRotatesRefreshAndRevokesReusedSession() throws Exception {
        String email = "security-it-" + UUID.randomUUID() + "@example.invalid";
        String password = "WokTestPassword-2026";
        var registration = post("/api/v1/auth/register", """
                {"email":"%s","displayName":"Integration Client","password":"%s"}
                """.formatted(email, password));
        assertThat(registration.statusCode()).isEqualTo(202);

        emailOutbox.sendNext();
        var sent = emailProvider.sent().stream().filter(message -> message.recipient().equals(email)).findFirst();
        assertThat(sent).isPresent();
        Matcher code = Pattern.compile("Tu código WOK es ([0-9]{6})\\.").matcher(sent.orElseThrow().body());
        assertThat(code.find()).isTrue();

        var verification = post("/api/v1/auth/verify", """
                {"email":"%s","code":"%s"}
                """.formatted(email, code.group(1)));
        assertThat(verification.statusCode()).isEqualTo(200);

        var login = post("/api/v1/auth/login", """
                {"email":"%s","password":"%s","clientType":"MOBILE"}
                """.formatted(email, password));
        assertThat(login.statusCode()).isEqualTo(200);
        JsonNode firstSession = json.readTree(login.body());
        String accessToken = firstSession.path("accessToken").asText();
        String firstRefreshToken = firstSession.path("refreshToken").asText();
        assertThat(accessToken).isNotBlank();
        assertThat(firstRefreshToken).isNotBlank();
        String sessionId = json.readTree(new String(java.util.Base64.getUrlDecoder().decode(accessToken.split("\\.")[1])))
                .path("sid").asText();
        var sessionState = jdbc.queryForMap("""
                SELECT s.revoked_at, s.expires_at, u.status, u.sessions_valid_after,
                       s.created_at, s.id, s.user_id
                FROM wok.auth_sessions s JOIN wok.users u ON u.id = s.user_id WHERE s.id = ?::uuid
                """, sessionId);
        var clientSessions = getWithBearer("/api/v1/client/sessions", accessToken);
        assertThat(clientSessions.statusCode()).as("Session %s (%s), body %s", sessionId, sessionState, clientSessions.body()).isEqualTo(200);
        assertThat(getWithBearer("/api/v1/admin/users", accessToken).statusCode()).isEqualTo(403);

        var refresh = post("/api/v1/auth/refresh", """
                {"refreshToken":"%s"}
                """.formatted(firstRefreshToken));
        assertThat(refresh.statusCode()).isEqualTo(200);
        String rotatedRefreshToken = json.readTree(refresh.body()).path("refreshToken").asText();
        assertThat(rotatedRefreshToken).isNotEqualTo(firstRefreshToken);

        var reuse = post("/api/v1/auth/refresh", """
                {"refreshToken":"%s"}
                """.formatted(firstRefreshToken));
        assertThat(reuse.statusCode()).isEqualTo(401);
        assertThat(getWithBearer("/api/v1/client/sessions", accessToken).statusCode()).isEqualTo(401);
    }

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + serverPort + path))
                .GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> post(String path, String body) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + serverPort + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> getWithBearer(String path, String token) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + serverPort + path))
                .header("Authorization", "Bearer " + token)
                .GET().build(), HttpResponse.BodyHandlers.ofString());
    }
}
