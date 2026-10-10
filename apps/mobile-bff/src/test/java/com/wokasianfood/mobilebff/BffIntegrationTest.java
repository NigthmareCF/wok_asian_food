package com.wokasianfood.mobilebff;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BffIntegrationTest {
    private static final String USER = "cd5c9911-6e16-46d6-a348-71ef581c7275";
    private static final String CONVERSATION = "e4028e1f-dcac-4d32-9f24-120ac9d38c03";
    private static final Map<String, Stub> responses = new ConcurrentHashMap<>();
    private static final List<Received> received = new CopyOnWriteArrayList<>();
    private static final HttpServer core = startCore();
    private final HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
    @LocalServerPort int port;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry properties) {
        properties.add("wok.bff.core-base-url", () -> "http://127.0.0.1:" + core.getAddress().getPort());
    }

    @BeforeEach
    void resetCore() {
        responses.clear(); received.clear();
        responses.put("GET /api/v1/client/profile", new Stub(200, "{\"userId\":\"" + USER + "\"}"));
        responses.put("GET /api/v1/client/conversations", new Stub(200,
                "[{\"conversationId\":\"" + CONVERSATION + "\",\"handlingMode\":\"HUMAN\"}]"));
    }

    @AfterAll static void stopCore() { core.stop(0); }

    @Test
    void loginForcesMobileAndChecksClientBeforeReturningTokens() throws Exception {
        String tokens = "{\"accessToken\":\"issued-access\",\"refreshToken\":\"issued-refresh\",\"tokenType\":\"Bearer\",\"expiresInSeconds\":900}";
        responses.put("POST /api/v1/auth/login", new Stub(200, tokens));
        var response = send("POST", "/api/v1/auth/login", null, null,
                "{\"email\":\"client@example.com\",\"password\":\"test\",\"clientType\":\"WEB\"}");
        assertEquals(200, response.statusCode());
        assertEquals(tokens, response.body());
        assertTrue(received.getFirst().body().contains("\"clientType\":\"MOBILE\""));
        assertEquals("Bearer issued-access", received.getLast().authorization());
        assertEquals("GET /api/v1/client/profile", received.getLast().route());
    }

    @Test
    void loginAndRefreshDoNotExposeNonClientTokens() throws Exception {
        String tokens = "{\"accessToken\":\"issued-access\",\"refreshToken\":\"issued-refresh\",\"tokenType\":\"Bearer\",\"expiresInSeconds\":900}";
        responses.put("GET /api/v1/client/profile", new Stub(403, "{\"trace\":\"private\"}"));
        for (String endpoint : List.of("login", "refresh")) {
            received.clear();
            responses.put("POST /api/v1/auth/" + endpoint, new Stub(200, tokens));
            var response = send("POST", "/api/v1/auth/" + endpoint, null, null, "{}");
            assertEquals(403, response.statusCode());
            assertFalse(response.body().contains("issued-access"));
            assertFalse(response.body().contains("issued-refresh"));
            assertEquals("POST /api/v1/auth/logout", received.getLast().route());
            assertEquals("Bearer issued-access", received.getLast().authorization());
        }
    }

    @Test
    void googleAndMalformedTokensRemainUnavailable() throws Exception {
        assertEquals(404, send("POST", "/api/v1/auth/google", null, null, "{}").statusCode());
        assertTrue(received.isEmpty());
        responses.put("POST /api/v1/auth/refresh", new Stub(200, "{}"));
        assertEquals(503, send("POST", "/api/v1/auth/refresh", null, null, "{}").statusCode());
        assertEquals(1, received.size());
    }

    @Test
    void identityCodesKeepNeutralResponsesAndDoNotForwardCredentials() throws Exception {
        String neutral = "{\"message\":\"Si la cuenta puede registrarse, recibirás un código de verificación.\"}";
        for (String endpoint : List.of("register", "verify/resend", "reset/request")) {
            received.clear();
            responses.put("POST /api/v1/auth/" + endpoint, new Stub(202, neutral));
            var response = send("POST", "/api/v1/auth/" + endpoint, "Bearer ignored", null, "{\"email\":\"client@example.com\"}");
            assertEquals(202, response.statusCode());
            assertEquals(neutral, response.body());
            assertNull(received.getFirst().authorization());
            assertNull(received.getFirst().cookie());
        }
        for (String endpoint : List.of("verify", "reset/complete")) {
            responses.put("POST /api/v1/auth/" + endpoint, new Stub(400, "{\"trace\":\"invalid-private-code\"}"));
            var response = send("POST", "/api/v1/auth/" + endpoint, null, null, "{}");
            assertEquals(400, response.statusCode());
            assertFalse(response.body().contains("invalid-private-code"));
        }
    }

    @Test
    void clientProfileUpdatesPreserveOptimisticVersionAndCoreConflict() throws Exception {
        String body = "{\"displayName\":\"Ana\",\"phone\":\"\",\"expectedVersion\":2}";
        responses.put("PUT /api/v1/client/profile", new Stub(409, "{\"trace\":\"private-version\"}"));
        var response = send("PUT", "/api/v1/client/profile", "Bearer test-client", null, body);
        assertEquals(409, response.statusCode());
        assertEquals(body, received.getLast().body());
        assertFalse(response.body().contains("private-version"));
    }

    @Test
    void healthDoesNotRequireCoreOrDatabase() throws Exception {
        assertEquals(200, send("GET", "/actuator/health", null, null, "").statusCode());
        assertTrue(received.isEmpty());
    }

    @Test
    void publicMenuForwardsNeitherCredentialsNorCookiesAndDoesNotCache() throws Exception {
        var response = send("GET", "/api/v1/public/menu", "Bearer not-used", null, "");
        assertEquals(200, response.statusCode());
        assertEquals(1, received.size());
        assertNull(received.getFirst().authorization());
        assertNull(received.getFirst().cookie());
        assertEquals("no-store", response.headers().firstValue("Cache-Control").orElseThrow());
        assertTrue(response.headers().firstValue("Set-Cookie").isEmpty());
    }

    @Test
    void browserOriginsMustBeExplicitlyAllowed() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/public/menu"))
                .header("Origin", "https://untrusted.example").GET().build();
        assertEquals(403, http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
        assertTrue(received.isEmpty());
        var allowed = HttpRequest.newBuilder(request.uri()).header("Origin", "http://localhost:8081").GET().build();
        var response = http.send(allowed, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertEquals("http://localhost:8081", response.headers().firstValue("Access-Control-Allow-Origin").orElseThrow());
        assertTrue(response.headers().firstValue("Access-Control-Allow-Credentials").isEmpty());
    }

    @Test
    void outOfScopeRoutesNeverReachCore() throws Exception {
        for (String path : List.of("/api/v1/admin/users", "/api/v1/operational/orders", "/api/v1/client/delivery-requests",
                "/api/v1/payments", "/api/v1/ai/chat", "/api/v1/client/addresses", "/api/v1/public/unknown")) {
            assertEquals(404, send("GET", path, "Bearer test-client", null, "").statusCode(), path);
        }
        assertEquals(404, send("POST", "/api/v1/public/menu", null, null, "{}").statusCode());
        assertTrue(received.isEmpty());
    }

    @Test
    void reservationPolicyForwardsOnlyAfterCoreVerifiesTheClient() throws Exception {
        String path = "/api/v1/client/reservations/policy";
        String policy = "{\"timeZone\":\"America/Guatemala\",\"minimumNoticeHours\":3,"
                + "\"firstRequestTime\":\"14:00:00\",\"lastRequestTime\":\"21:15:00\","
                + "\"preorderRecommendedAfter\":\"20:30:00\",\"preorderItemsSupported\":false,"
                + "\"asOf\":\"2026-10-07T18:00:00Z\"}";
        responses.put("GET " + path, new Stub(200, policy));

        var response = send("GET", path, "Bearer test-client", null, "");
        assertEquals(200, response.statusCode());
        assertEquals(policy, response.body());
        assertEquals(List.of("GET /api/v1/client/profile", "GET " + path),
                received.stream().map(Received::route).toList());
        assertEquals("Bearer test-client", received.getLast().authorization());
        assertNull(received.getLast().cookie());
        assertNull(received.getLast().key());
        assertEquals("no-store", response.headers().firstValue("Cache-Control").orElseThrow());
        assertTrue(response.headers().firstValue("Set-Cookie").isEmpty());
    }

    @Test
    void reservationPolicyRejectsGuestsAndDeniedClientProfilesBeforeForwarding() throws Exception {
        String path = "/api/v1/client/reservations/policy";
        assertEquals(401, send("GET", path, null, null, "").statusCode());
        assertTrue(received.isEmpty());
        for (int status : List.of(401, 403)) {
            received.clear();
            responses.put("GET /api/v1/client/profile", new Stub(status, "{\"trace\":\"private-profile\"}"));
            var response = send("GET", path, "Bearer test-client", null, "");
            assertEquals(status, response.statusCode());
            assertFalse(response.body().contains("private-profile"));
            assertEquals(List.of("GET /api/v1/client/profile"), received.stream().map(Received::route).toList());
        }
    }

    @Test
    void reservationPolicyPreservesSafeCoreErrorsWithoutRetryOrDetails() throws Exception {
        String path = "/api/v1/client/reservations/policy";
        for (int status : List.of(400, 404, 429, 500)) {
            received.clear();
            responses.put("GET " + path, new Stub(status, "{\"trace\":\"private-policy\"}"));
            var response = send("GET", path, "Bearer test-client", null, "");
            assertEquals(status == 500 ? 503 : status, response.statusCode());
            assertFalse(response.body().contains("private-policy"));
            assertEquals(List.of("GET /api/v1/client/profile", "GET " + path),
                    received.stream().map(Received::route).toList());
        }
    }

    @Test
    void reservationPolicyAllowsOnlyTheExactReadRoute() throws Exception {
        String path = "/api/v1/client/reservations/policy";
        assertEquals(404, send("POST", path, "Bearer test-client", null, "{}").statusCode());
        assertEquals(404, send("GET", path + "/other", "Bearer test-client", null, "").statusCode());
        assertEquals(400, send("GET", path + "?url=https://example.com", "Bearer test-client", null, "").statusCode());
        assertTrue(received.isEmpty());
    }

    @Test
    void reservationPolicyCorsRejectsUntrustedOriginsBeforeCore() throws Exception {
        String path = "/api/v1/client/reservations/policy";
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Origin", "https://untrusted.example").header("Authorization", "Bearer test-client").GET().build();
        assertEquals(403, http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
        assertTrue(received.isEmpty());

        var allowed = HttpRequest.newBuilder(request.uri()).header("Origin", "http://localhost:8081")
                .header("Authorization", "Bearer test-client").GET().build();
        var response = http.send(allowed, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertEquals("http://localhost:8081", response.headers().firstValue("Access-Control-Allow-Origin").orElseThrow());
        assertTrue(response.headers().firstValue("Access-Control-Allow-Credentials").isEmpty());
        assertEquals(List.of("GET /api/v1/client/profile", "GET " + path),
                received.stream().map(Received::route).toList());
    }

    @Test
    void queryInjectionIsRejectedBeforeCore() throws Exception {
        assertEquals(400, send("GET", "/api/v1/public/menu?url=https://example.com", null, null, "").statusCode());
        assertTrue(received.isEmpty());
    }

    @Test
    void missingSessionIsRejected() throws Exception {
        assertEquals(401, send("GET", "/api/v1/client/order-requests", null, null, "").statusCode());
        assertTrue(received.isEmpty());
    }

    @Test
    void revokedSessionOrNonClientCannotReachPrivateEndpoints() throws Exception {
        for (int status : List.of(401, 403)) {
            received.clear();
            responses.put("GET /api/v1/client/profile", new Stub(status, "{\"trace\":\"private\"}"));
            var response = send("GET", "/api/v1/client/order-requests", "Bearer test-client", null, "");
            assertEquals(status, response.statusCode());
            assertFalse(response.body().contains("private"));
            assertEquals(List.of("GET /api/v1/client/profile"), received.stream().map(Received::route).toList());
        }
    }

    @Test
    void ownershipDenialFromCoreIsPreservedWithoutDetails() throws Exception {
        String path = "/api/v1/client/order-requests/" + UUID.randomUUID();
        responses.put("GET " + path, new Stub(404, "{\"otherCustomer\":\"secret\"}"));
        var response = send("GET", path, "Bearer test-client", null, "");
        assertEquals(404, response.statusCode());
        assertFalse(response.body().contains("secret"));
    }

    @Test
    void pickupPreservesPayloadIdempotencyAndPendingStatusWithoutRetry() throws Exception {
        String path = "/api/v1/client/order-requests";
        String payload = "{\"items\":[{\"menuItemId\":\"" + UUID.randomUUID() + "\",\"quantity\":1}]}";
        String key = UUID.randomUUID().toString();
        responses.put("POST " + path, new Stub(202, "{\"status\":\"PENDING_REVIEW\"}"));
        assertEquals(202, send("POST", path, "Bearer test-client", key, payload).statusCode());
        var forwarded = received.stream().filter(item -> item.route().equals("POST " + path)).toList();
        assertEquals(1, forwarded.size());
        assertEquals(payload, forwarded.getFirst().body());
        assertEquals(key, forwarded.getFirst().key());
        assertEquals("Bearer test-client", forwarded.getFirst().authorization());
        assertNotEquals("spoofed", forwarded.getFirst().forwardedFor());
    }

    @Test
    void invalidOrMissingIdempotencyDoesNotWrite() throws Exception {
        for (String key : List.of("", "bad-key")) {
            assertEquals(400, send("POST", "/api/v1/client/order-requests", "Bearer test-client", key, "{}").statusCode());
        }
        assertTrue(received.stream().noneMatch(item -> item.route().startsWith("POST")));
    }

    @Test
    void malformedOrOversizedBodyDoesNotWrite() throws Exception {
        assertEquals(400, send("POST", "/api/v1/auth/login", null, null, "not-json").statusCode());
        assertEquals(413, send("POST", "/api/v1/auth/login", null, null, "x".repeat(65_537)).statusCode());
        assertTrue(received.isEmpty());
    }

    @Test
    void chatRejectsAttachmentsSenderSpoofingEmptyAndOversizedMessages() throws Exception {
        String path = "/api/v1/client/conversations/" + CONVERSATION + "/messages";
        for (String payload : List.of("{\"body\":\"Hi\",\"senderType\":\"HUMAN\"}",
                "{\"body\":\"Hi\",\"attachment\":\"file\"}", "{\"body\":\" \"}",
                "{\"body\":\"" + "x".repeat(4001) + "\"}")) {
            assertEquals(400, send("POST", path, "Bearer test-client", UUID.randomUUID().toString(), payload).statusCode());
        }
        assertTrue(received.stream().noneMatch(item -> item.route().startsWith("POST")));
    }

    @Test
    void chatOnlyForwardsOwnedHumanConversations() throws Exception {
        String path = "/api/v1/client/conversations/" + CONVERSATION + "/messages";
        for (String conversations : List.of("[]", "[{\"conversationId\":\"" + CONVERSATION
                + "\",\"handlingMode\":\"AI\"}]")) {
            responses.put("GET /api/v1/client/conversations", new Stub(200, conversations));
            assertEquals(404, send("POST", path, "Bearer test-client", UUID.randomUUID().toString(), "{\"body\":\"Hi\"}").statusCode());
        }
        assertTrue(received.stream().noneMatch(item -> item.route().startsWith("POST")));
    }

    @Test
    void chatNeverReturnsAiMessages() throws Exception {
        String path = "/api/v1/client/conversations/" + CONVERSATION + "/messages";
        responses.put("GET " + path, new Stub(200,
                "[{\"senderType\":\"HUMAN\",\"body\":\"Equipo\"},{\"senderType\":\"AI\",\"body\":\"ai-secret\"}]"));
        var response = send("GET", path, "Bearer test-client", null, "");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("Equipo"));
        assertFalse(response.body().contains("ai-secret"));
    }

    @Test
    void humanChatPreservesIdempotencyAndDoesNotSendAuthoredSenderMetadata() throws Exception {
        String path = "/api/v1/client/conversations/" + CONVERSATION + "/messages";
        String key = UUID.randomUUID().toString();
        String payload = "{\"body\":\"Necesito ayuda\"}";
        responses.put("POST " + path, new Stub(200, "{\"messageId\":\"" + UUID.randomUUID() + "\",\"status\":\"SENT\"}"));
        assertEquals(200, send("POST", path, "Bearer test-client", key, payload).statusCode());
        var writes = received.stream().filter(item -> item.route().equals("POST " + path)).toList();
        assertEquals(1, writes.size());
        assertEquals(key, writes.getFirst().key());
        assertEquals(payload, writes.getFirst().body());
    }

    @Test
    void conversationListAndOpenCannotExposeAiMode() throws Exception {
        responses.put("GET /api/v1/client/conversations", new Stub(200,
                "[{\"handlingMode\":\"AI\",\"conversationId\":\"ai-secret\"},{\"handlingMode\":\"HUMAN\"}]"));
        assertFalse(send("GET", "/api/v1/client/conversations", "Bearer test-client", null, "").body().contains("ai-secret"));
        responses.put("POST /api/v1/client/conversations", new Stub(200, "{\"handlingMode\":\"AI\"}"));
        assertEquals(409, send("POST", "/api/v1/client/conversations", "Bearer test-client", null, "").statusCode());
    }

    @Test
    void oversizedCoreResponseIsRejected() throws Exception {
        responses.put("GET /api/v1/public/menu", new Stub(200, "x".repeat(2 * 1024 * 1024 + 1)));
        assertEquals(503, send("GET", "/api/v1/public/menu", null, null, "").statusCode());
    }

    @Test
    void upstreamRedirectAndServerErrorsAreSanitizedAndNotRetried() throws Exception {
        for (int status : List.of(302, 500)) {
            received.clear();
            responses.put("GET /api/v1/public/menu", new Stub(status, "{\"trace\":\"secret\"}"));
            var response = send("GET", "/api/v1/public/menu", null, null, "");
            assertEquals(503, response.statusCode());
            assertFalse(response.body().contains("secret"));
            assertEquals(1, received.size());
        }
    }

    private HttpResponse<String> send(String method, String path, String authorization, String key, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json").header("Cookie", "session=not-forwarded")
                .header("X-Forwarded-For", "spoofed");
        if (authorization != null) request.header("Authorization", authorization);
        if (key != null && !key.isEmpty()) request.header("Idempotency-Key", key);
        return http.send(request.method(method, HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private static HttpServer startCore() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                String route = exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath();
                var headers = exchange.getRequestHeaders();
                received.add(new Received(route, headers.getFirst("Authorization"), headers.getFirst("Cookie"),
                        headers.getFirst("Idempotency-Key"), headers.getFirst("X-Forwarded-For"),
                        new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
                var stub = responses.getOrDefault(route, new Stub(200, "{}"));
                byte[] bytes = stub.body().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.getResponseHeaders().add("Set-Cookie", "server-private=secret");
                exchange.getResponseHeaders().add("Location", "http://127.0.0.1:1/forbidden");
                exchange.sendResponseHeaders(stub.status(), bytes.length);
                exchange.getResponseBody().write(bytes);
                exchange.close();
            });
            server.start(); return server;
        } catch (java.io.IOException failed) { throw new IllegalStateException(failed); }
    }

    private record Stub(int status, String body) {}
    private record Received(String route, String authorization, String cookie, String key, String forwardedFor, String body) {}
}
