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
import java.math.BigDecimal;
import java.time.Instant;

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

    @Test
    void customerCannotReadOrCancelAnotherCustomersPickupRequest() throws Exception {
        String menuItemId = createSyntheticMenuItem();
        String ownerToken = registerAndLogin("owner");
        String otherToken = registerAndLogin("other");
        String requestIdempotencyKey = UUID.randomUUID().toString();
        String requestedFor = Instant.now().plusSeconds(900).toString();
        var submitted = postAuthorized("/api/v1/client/order-requests", ownerToken, requestIdempotencyKey, """
                {"requestedFor":"%s","customerNote":"integration owner request","items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(requestedFor, menuItemId));
        assertThat(submitted.statusCode()).as("Pickup request submission: %s", submitted.body()).isEqualTo(202);
        String ownedRequestId = json.readTree(submitted.body()).path("requestId").asText();
        assertThat(ownedRequestId).isNotBlank();

        assertThat(getWithBearer("/api/v1/client/order-requests/" + ownedRequestId, ownerToken).statusCode()).isEqualTo(200);
        assertThat(getWithBearer("/api/v1/client/order-requests/" + ownedRequestId, otherToken).statusCode()).isEqualTo(404);
        var otherHistory = getWithBearer("/api/v1/client/order-requests", otherToken);
        assertThat(otherHistory.statusCode()).isEqualTo(200);
        assertThat(json.readTree(otherHistory.body())).isEmpty();
        var unauthorizedCancel = deleteWithBearer("/api/v1/client/order-requests/" + ownedRequestId, otherToken);
        assertThat(unauthorizedCancel.statusCode()).isEqualTo(404);
        assertThat(getWithBearer("/api/v1/client/order-requests/" + ownedRequestId, ownerToken).statusCode()).isEqualTo(200);
    }

    @Test
    void passwordResetInvalidatesExistingSessionAndOldCredentials() throws Exception {
        String email = "reset-" + UUID.randomUUID() + "@example.invalid";
        String oldPassword = "WokOldPassword-2026";
        String newPassword = "WokNewPassword-2026";
        assertThat(post("/api/v1/auth/register", """
                {"email":"%s","displayName":"Reset Integration","password":"%s"}
                """.formatted(email, oldPassword)).statusCode()).isEqualTo(202);
        emailOutbox.sendNext();
        String verificationCode = codeForLatestEmail(email);
        assertThat(post("/api/v1/auth/verify", """
                {"email":"%s","code":"%s"}
                """.formatted(email, verificationCode)).statusCode()).isEqualTo(200);

        var oldLogin = post("/api/v1/auth/login", """
                {"email":"%s","password":"%s","clientType":"MOBILE"}
                """.formatted(email, oldPassword));
        assertThat(oldLogin.statusCode()).isEqualTo(200);
        JsonNode oldSession = json.readTree(oldLogin.body());

        assertThat(post("/api/v1/auth/reset/request", """
                {"email":"%s"}
                """.formatted(email)).statusCode()).isEqualTo(202);
        emailOutbox.sendNext();
        String resetCode = codeForLatestEmail(email);
        assertThat(resetCode).isNotEqualTo(verificationCode);
        assertThat(post("/api/v1/auth/reset/complete", """
                {"email":"%s","code":"%s","newPassword":"%s"}
                """.formatted(email, resetCode, newPassword)).statusCode()).isEqualTo(200);

        assertThat(getWithBearer("/api/v1/client/sessions", oldSession.path("accessToken").asText()).statusCode()).isEqualTo(401);
        assertThat(post("/api/v1/auth/refresh", """
                {"refreshToken":"%s"}
                """.formatted(oldSession.path("refreshToken").asText())).statusCode()).isEqualTo(401);
        assertThat(post("/api/v1/auth/login", """
                {"email":"%s","password":"%s","clientType":"MOBILE"}
                """.formatted(email, oldPassword)).statusCode()).isEqualTo(401);
        var newLogin = post("/api/v1/auth/login", """
                {"email":"%s","password":"%s","clientType":"MOBILE"}
                """.formatted(email, newPassword));
        assertThat(newLogin.statusCode()).isEqualTo(200);
        assertThat(getWithBearer("/api/v1/client/sessions", json.readTree(newLogin.body()).path("accessToken").asText()).statusCode())
                .isEqualTo(200);
    }

    private String codeForLatestEmail(String email) {
        var sent = emailProvider.sent().stream().filter(message -> message.recipient().equals(email)).reduce((first, second) -> second);
        assertThat(sent).isPresent();
        Matcher code = Pattern.compile("Tu código WOK es ([0-9]{6})\\.").matcher(sent.orElseThrow().body());
        assertThat(code.find()).isTrue();
        return code.group(1);
    }

    private String registerAndLogin(String prefix) throws Exception {
        String email = prefix + "-" + UUID.randomUUID() + "@example.invalid";
        String password = "WokTestPassword-2026";
        assertThat(post("/api/v1/auth/register", """
                {"email":"%s","displayName":"%s Integration","password":"%s"}
                """.formatted(email, prefix, password)).statusCode()).isEqualTo(202);
        emailOutbox.sendNext();
        var sent = emailProvider.sent().stream().filter(message -> message.recipient().equals(email)).findFirst();
        assertThat(sent).isPresent();
        Matcher code = Pattern.compile("Tu código WOK es ([0-9]{6})\\.").matcher(sent.orElseThrow().body());
        assertThat(code.find()).isTrue();
        assertThat(post("/api/v1/auth/verify", """
                {"email":"%s","code":"%s"}
                """.formatted(email, code.group(1))).statusCode()).isEqualTo(200);
        var login = post("/api/v1/auth/login", """
                {"email":"%s","password":"%s","clientType":"MOBILE"}
                """.formatted(email, password));
        assertThat(login.statusCode()).isEqualTo(200);
        return json.readTree(login.body()).path("accessToken").asText();
    }

    private String createSyntheticMenuItem() {
        UUID typeId = jdbc.queryForObject("INSERT INTO wok.item_types(code,name) VALUES ('TEST_FOOD','Test food') RETURNING id", UUID.class);
        UUID unitId = jdbc.queryForObject("INSERT INTO wok.units(code,name,dimension,factor_to_base) VALUES ('EA','Each','COUNT',1) RETURNING id", UUID.class);
        UUID itemId = jdbc.queryForObject("INSERT INTO wok.items(sku,name,item_type_id,base_unit_id,track_inventory) VALUES (upper('IT-' || gen_random_uuid()::text),'Test item',?,?,false) RETURNING id", UUID.class, typeId, unitId);
        UUID categoryId = jdbc.queryForObject("INSERT INTO wok.menu_categories(name) VALUES ('Synthetic integration menu') RETURNING id", UUID.class);
        UUID areaId = jdbc.queryForObject("INSERT INTO wok.preparation_areas(code,name) VALUES ('TEST','Test area') RETURNING id", UUID.class);
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code='GTQ'", UUID.class);
        UUID menuItemId = jdbc.queryForObject("""
                INSERT INTO wok.menu_items(item_id,category_id,preparation_area_id,name,price,currency_id,estimated_preparation_seconds)
                VALUES (?, ?, ?, 'Synthetic test plate', ?, ?, 0) RETURNING id
                """, UUID.class, itemId, categoryId, areaId, new BigDecimal("25.00"), currencyId);
        return menuItemId.toString();
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

    private HttpResponse<String> postAuthorized(String path, String token, String idempotencyKey, String body) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + serverPort + path))
                .header("Authorization", "Bearer " + token)
                .header("Idempotency-Key", idempotencyKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> deleteWithBearer(String path, String token) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + serverPort + path))
                .header("Authorization", "Bearer " + token)
                .DELETE().build(), HttpResponse.BodyHandlers.ofString());
    }
}
