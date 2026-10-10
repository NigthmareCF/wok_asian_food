package com.wokasianfood.api.support;

import com.wokasianfood.api.identity.TokenService;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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

    /** Explicit core fixtures. Verification rows here are synthetic database setup, never a production adapter. */
    private final java.util.Map<String,String> quotedFixtureBodies=new java.util.concurrent.ConcurrentHashMap<>();
    protected static java.time.Instant nextServiceSlot() {
        return java.time.LocalDate.now(java.time.ZoneId.of("America/Guatemala")).plusDays(1).atTime(18,0).atZone(java.time.ZoneId.of("America/Guatemala")).toInstant();
    }
    protected UUID fixturePrincipal(String token) {
        try{return UUID.fromString(new com.fasterxml.jackson.databind.ObjectMapper().readTree(java.util.Base64.getUrlDecoder().decode(token.split("\\.")[1])).path("sub").asText());}
        catch(Exception e){throw new IllegalStateException(e);}
    }
    protected synchronized String withCoreQuote(String token,String payload,String type) {
        String cacheKey=token+"|"+type+"|"+payload;
        if(quotedFixtureBodies.containsKey(cacheKey))return quotedFixtureBodies.get(cacheKey);
        try {
            var json=new com.fasterxml.jackson.databind.ObjectMapper();var data=(com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(payload);
            var quote=json.createObjectNode();
            if(type.equals("RESERVATION")){quote.put("guests",data.path("guests").asInt());quote.put("requestedAt",data.path("requestedAt").asText());quote.put("preorder",data.path("preorder").asBoolean());quote.set("items",data.has("items")?data.path("items"):json.createArrayNode());}
            else {quote.put("fulfillmentType",type);quote.set("requestedFor",data.path("requestedFor"));quote.set("items",data.path("items"));}
            var result=post(type.equals("RESERVATION")?"/api/v1/client/reservation-quotes":"/api/v1/client/order-quotes",token,quote.toString(),Map.of("Idempotency-Key",UUID.randomUUID().toString()));
            if(result.statusCode()<200||result.statusCode()>299)return payload;
            data.put("quoteId",json.readTree(result.body()).path("quoteId").asText());
            if(type.equals("RESERVATION")&&!data.has("items"))data.set("items",json.createArrayNode());
            String body=data.toString();quotedFixtureBodies.put(cacheKey,body);return body;
        }catch(Exception e){throw new IllegalStateException(e);}
    }
    protected void verifiedPhoneFixture(String token,String phone) {
        UUID user=fixturePrincipal(token);String exact=com.wokasianfood.api.identity.PhoneVerificationService.normalize(phone);
        jdbc.update("UPDATE wok.users SET phone=? WHERE id=?",phone,user);
        jdbc.update("INSERT INTO wok.phone_verifications(user_id,phone,verified_at,real_possession) VALUES(?,?,now(),true) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,verified_at=excluded.verified_at,real_possession=true",user,exact);
    }
    protected void authorizeReviewFixture(UUID requestId) {
        UUID admin=createUserWithRole("review-fixture-"+UUID.randomUUID()+"@wok.test","ADMIN");String token=tokenFor(admin);
        var type=jdbc.queryForObject("SELECT fulfillment_type FROM wok.order_requests WHERE id=?",String.class,requestId);
        if("DELIVERY".equals(type))assertFixtureSuccess(post("/api/v1/operational/order-requests/"+requestId+"/logistics-confirmation",token,"{\"reason\":\"Logística sintética de prueba\"}",Map.of("Idempotency-Key",UUID.randomUUID().toString())));
        assertFixtureSuccess(post("/api/v1/operational/order-requests/"+requestId+"/override",token,"{\"reason\":\"Revisión sintética de prueba\"}",Map.of("Idempotency-Key",UUID.randomUUID().toString())));
    }
    private void assertFixtureSuccess(HttpResponse<String> result){if(result.statusCode()<200||result.statusCode()>299)throw new IllegalStateException(result.body());}
    protected String baseUrl() {
        return "http://127.0.0.1:" + port;
    }
}
