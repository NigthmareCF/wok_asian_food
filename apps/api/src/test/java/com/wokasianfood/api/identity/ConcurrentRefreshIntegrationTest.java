package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestReporter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

class ConcurrentRefreshIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();
    @Autowired private DataSource dataSource;
    @Autowired private PasswordEncoder passwords;

    @Test
    void concurrentRefreshCreatesOneChildThenReuseRevokesTheEntireSession(TestReporter reporter) throws Exception {
        String email = "refresh-race-" + UUID.randomUUID() + "@example.test";
        String password = "ConcurrentRefresh!2026";
        UUID userId = createUserWithRole(email, "CLIENT");
        jdbc.update("INSERT INTO wok.user_credentials (user_id, password_hash) VALUES (?, ?)",
                userId, passwords.encode(password));
        var login = post("/api/v1/auth/login", null, """
                {"email":"%s","password":"%s","clientType":"WEB"}
                """.formatted(email, password));
        assertThat(login.statusCode()).isEqualTo(200);
        var initial = json.readTree(login.body());
        String originalRefresh = initial.path("refreshToken").asText();
        assertThat(originalRefresh).isNotBlank();
        var root = jdbc.queryForMap("SELECT id, session_id FROM wok.refresh_tokens WHERE token_hash = ?",
                tokens.hash(originalRefresh));
        UUID rootId = (UUID) root.get("id");
        UUID sessionId = (UUID) root.get("session_id");
        assertThat(get("/api/v1/auth/me", initial.path("accessToken").asText()).statusCode()).isEqualTo(200);

        List<HttpResponse<String>> responses = race(originalRefresh, rootId);
        reporter.publishEntry("concurrentRefreshHttpStatuses",
                responses.stream().map(response -> Integer.toString(response.statusCode())).toList().toString());
        assertThat(responses).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200, 401);

        var success = responses.stream().filter(response -> response.statusCode() == 200).findFirst().orElseThrow();
        var rejected = responses.stream().filter(response -> response.statusCode() == 401).findFirst().orElseThrow();
        assertThat(rejected.body()).isEqualTo("{\"message\":\"Sesión inválida.\"}");
        var replacement = json.readTree(success.body());
        String nextAccess = replacement.path("accessToken").asText();
        String nextRefresh = replacement.path("refreshToken").asText();
        assertThat(nextAccess).isNotBlank();
        assertThat(nextRefresh).isNotBlank().isNotEqualTo(originalRefresh);

        assertRevokedChain(sessionId, rootId, tokens.hash(nextRefresh));
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.security_events
                WHERE session_id = ? AND actor_user_id = ?
                  AND event_type = 'REFRESH_TOKEN_REUSE' AND severity = 'CRITICAL'
                """, Integer.class, sessionId, userId)).isEqualTo(1);

        int originalAccessStatus = get("/api/v1/auth/me", initial.path("accessToken").asText()).statusCode();
        int nextAccessStatus = get("/api/v1/auth/me", nextAccess).statusCode();
        int nextRefreshStatus = post("/api/v1/auth/refresh", null,
                "{\"refreshToken\":\"" + nextRefresh + "\"}").statusCode();
        reporter.publishEntry("afterReuseHttpStatuses", "originalAccess=" + originalAccessStatus
                + ", resultingAccess=" + nextAccessStatus + ", resultingRefresh=" + nextRefreshStatus);
        assertThat(originalAccessStatus).isEqualTo(401);
        assertThat(nextAccessStatus).isEqualTo(401);
        assertThat(nextRefreshStatus).isEqualTo(401);
        assertRevokedChain(sessionId, rootId, tokens.hash(nextRefresh));
    }

    private List<HttpResponse<String>> race(String refresh, UUID rootId) throws Exception {
        var barrier = new CyclicBarrier(3);
        var request = HttpRequest.newBuilder(URI.create(baseUrl() + "/api/v1/auth/refresh"))
                .timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"refreshToken\":\"" + refresh + "\"}")).build();
        try (var client = HttpClient.newHttpClient(); var workers = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<HttpResponse<String>> renew = () -> {
                barrier.await(10, TimeUnit.SECONDS);
                return client.send(request, HttpResponse.BodyHandlers.ofString());
            };
            // Hold the parent row until both real HTTP transactions are waiting in PostgreSQL.
            // This proves overlap instead of relying on scheduling or an arbitrary delay.
            try (Connection lock = dataSource.getConnection()) {
                lock.setAutoCommit(false);
                try {
                    try (var statement = lock.prepareStatement("SELECT id FROM wok.refresh_tokens WHERE id = ? FOR UPDATE")) {
                        statement.setObject(1, rootId);
                        try (var row = statement.executeQuery()) { assertThat(row.next()).isTrue(); }
                    }
                    var first = workers.submit(renew);
                    var second = workers.submit(renew);
                    barrier.await(10, TimeUnit.SECONDS);
                    awaitBothDatabaseWaiters();
                    lock.commit();
                    return List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
                } finally {
                    lock.rollback();
                }
            }
        }
    }

    private void awaitBothDatabaseWaiters() throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
        int waiting = 0;
        while (System.nanoTime() < deadline) {
            waiting = jdbc.queryForObject("""
                    SELECT count(*) FROM pg_stat_activity
                    WHERE datname = current_database() AND state = 'active' AND wait_event_type = 'Lock'
                      AND query LIKE '%FOR UPDATE OF rt, s%'
                    """, Integer.class);
            if (waiting == 2) return;
            Thread.sleep(20);
        }
        assertThat(waiting).as("Both refresh HTTP transactions must overlap while waiting for the parent row")
                .isEqualTo(2);
    }

    private void assertRevokedChain(UUID sessionId, UUID rootId, String childHash) {
        var session = jdbc.queryForMap("""
                SELECT revoked_at IS NOT NULL AS revoked, revocation_reason FROM wok.auth_sessions WHERE id = ?
                """, sessionId);
        assertThat(session).containsEntry("revoked", true).containsEntry("revocation_reason", "REFRESH_REUSE");
        var rows = jdbc.queryForList("""
                SELECT rt.id, rt.parent_token_id, rt.token_hash, rt.used_at IS NOT NULL AS used,
                       rt.revoked_at IS NOT NULL AS revoked, rt.expires_at = s.expires_at AS same_expiry
                FROM wok.refresh_tokens rt JOIN wok.auth_sessions s ON s.id = rt.session_id
                WHERE rt.session_id = ?
                """, sessionId);
        assertThat(rows).hasSize(2);
        assertThat(rows).allSatisfy(row -> assertThat(row)
                .containsEntry("revoked", true).containsEntry("same_expiry", true));
        assertThat(rows.stream().filter(row -> rootId.equals(row.get("id"))).toList()).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("parent_token_id", null).containsEntry("used", true));
        assertThat(rows.stream().filter(row -> rootId.equals(row.get("parent_token_id"))).toList()).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("token_hash", childHash).containsEntry("used", false));
        assertThat(rows).extracting(row -> row.get("token_hash")).doesNotHaveDuplicates();
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM (
                    SELECT parent_token_id FROM wok.refresh_tokens
                    WHERE session_id = ? AND parent_token_id IS NOT NULL
                    GROUP BY parent_token_id HAVING count(*) > 1
                ) duplicated_children
                """, Integer.class, sessionId)).isZero();
    }
}
