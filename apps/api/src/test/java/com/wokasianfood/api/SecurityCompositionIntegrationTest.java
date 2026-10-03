package com.wokasianfood.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.email.EmailOutboxWorker;
import com.wokasianfood.api.email.MockEmailProvider;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Base64;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class SecurityCompositionIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Autowired
    private EmailOutboxWorker emailOutbox;

    @Autowired
    private MockEmailProvider emailProvider;

    @Test
    void exposesHealthOpenApiAndPublicMenuButProtectsOperationalQueue() throws Exception {
        assertThat(get("/actuator/health", null).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/openapi", null).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/public/menu", null).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/admin/users", null).statusCode()).isEqualTo(401);
        assertThat(get("/api/v1/operational/tables", null).statusCode()).isEqualTo(401);
    }

    @Test
    void issuesShortLivedServerSideGoogleNonceAndStoresOnlyItsHash() throws Exception {
        var response = post("/api/v1/auth/google/nonce", null, "{}");

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = json.readTree(response.body());
        String nonce = body.path("nonce").asText();
        assertThat(nonce).matches("[A-Za-z0-9_-]{43}");
        assertThat(body.path("expiresInSeconds").asInt()).isEqualTo(300);
        String storedHash = jdbc.queryForObject("""
                SELECT nonce_hash FROM wok.google_oidc_nonce_challenges
                WHERE consumed_at IS NULL AND expires_at > now()
                ORDER BY created_at DESC LIMIT 1
                """, String.class);
        assertThat(storedHash).hasSize(64).isNotEqualTo(nonce);
    }

    @Test
    void registersVerifiesLogsInRotatesRefreshAndRevokesReusedSession() throws Exception {
        String email = "security-it-" + UUID.randomUUID() + "@example.invalid";
        String password = "WokTestPassword-2026";
        var registration = post("/api/v1/auth/register", null, """
                {"email":"%s","displayName":"Integration Client","password":"%s"}
                """.formatted(email, password));
        assertThat(registration.statusCode()).isEqualTo(202);

        emailOutbox.sendNext();
        var sent = emailProvider.sent().stream().filter(message -> message.recipient().equals(email)).findFirst();
        assertThat(sent).isPresent();
        Matcher code = Pattern.compile("Tu código WOK es ([0-9]{6})\\.").matcher(sent.orElseThrow().body());
        assertThat(code.find()).isTrue();

        var verification = post("/api/v1/auth/verify", null, """
                {"email":"%s","code":"%s"}
                """.formatted(email, code.group(1)));
        assertThat(verification.statusCode()).isEqualTo(200);

        var login = post("/api/v1/auth/login", null, """
                {"email":"%s","password":"%s","clientType":"MOBILE"}
                """.formatted(email, password));
        assertThat(login.statusCode()).isEqualTo(200);
        JsonNode issued = json.readTree(login.body());
        String accessToken = issued.path("accessToken").asText();
        String firstRefreshToken = issued.path("refreshToken").asText();
        assertThat(accessToken).isNotBlank();
        assertThat(firstRefreshToken).isNotBlank();

        String sessionId = json.readTree(new String(Base64.getUrlDecoder().decode(accessToken.split("\\.")[1])))
                .path("sid").asText();
        var sessionState = jdbc.queryForMap("""
                SELECT s.revoked_at, s.expires_at, u.status, u.sessions_valid_after, s.created_at
                FROM wok.auth_sessions s JOIN wok.users u ON u.id = s.user_id WHERE s.id = ?::uuid
                """, sessionId);
        var clientSessions = get("/api/v1/client/sessions", accessToken);
        assertThat(clientSessions.statusCode())
                .as("Session %s (%s), body %s", sessionId, sessionState, clientSessions.body())
                .isEqualTo(200);
        assertThat(get("/api/v1/admin/users", accessToken).statusCode()).isEqualTo(403);

        var refresh = post("/api/v1/auth/refresh", null, """
                {"refreshToken":"%s"}
                """.formatted(firstRefreshToken));
        assertThat(refresh.statusCode()).isEqualTo(200);
        String rotatedRefreshToken = json.readTree(refresh.body()).path("refreshToken").asText();
        assertThat(rotatedRefreshToken).isNotEqualTo(firstRefreshToken);

        var reuse = post("/api/v1/auth/refresh", null, """
                {"refreshToken":"%s"}
                """.formatted(firstRefreshToken));
        assertThat(reuse.statusCode()).isEqualTo(401);
        assertThat(get("/api/v1/client/sessions", accessToken).statusCode()).isEqualTo(401);
    }
}
