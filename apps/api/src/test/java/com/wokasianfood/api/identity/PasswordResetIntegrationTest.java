package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

@org.springframework.test.context.TestPropertySource(properties = "wok.http.trusted-proxies=127.0.0.1/32")
class PasswordResetIntegrationTest extends PostgresIntegrationTest {
    private static final String OLD_PASSWORD = "IntegrationPassword!2026";
    private static final String NEW_PASSWORD = "ReplacementPassword!2026";
    private static final String CODE = "482193";
    private final ObjectMapper json = new ObjectMapper();
    @Autowired private PasswordEncoder passwords;
    @Autowired private ChallengeService challenges;

    @Test
    void successfulResetRevokesAllPreviousSessionsAndLeavesAnotherUserUnaffected() throws Exception {
        Account account = createAccount();
        Account other = createAccount();
        Session first = login(account, OLD_PASSWORD, "WEB");
        Session second = login(account, OLD_PASSWORD, "MOBILE");
        Session otherSession = login(other, OLD_PASSWORD, "WEB");
        assertThat(first.id()).isNotEqualTo(second.id());
        assertThat(first.refresh()).isNotEqualTo(second.refresh());
        for (Session session : List.of(first, second)) assertMe(session, account);
        assertMe(otherSession, other);

        var previousSessions = sessionState(account);
        var previousTokens = refreshState(account);
        assertThat(previousSessions).hasSize(2).allSatisfy(row ->
                assertThat(row).containsEntry("revoked_at", null).containsEntry("revocation_reason", null));
        assertThat(previousTokens).hasSize(2).allSatisfy(row ->
                assertThat(row).containsEntry("revoked_at", null).containsEntry("used_at", null));
        var otherUserBefore = userState(other);
        var otherCredentialsBefore = credentialState(other);
        var otherSessionsBefore = sessionState(other);
        var otherTokensBefore = refreshState(other);
        var credentialsBefore = credentialState(account);
        var userBefore = userState(account);

        // Controlled challenge fixture isolates reset completion from email delivery.
        UUID challengeId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.verification_challenges
                    (id, user_id, purpose, code_hash, destination_hash, expires_at)
                VALUES (?, ?, 'PASSWORD_RESET', ?, ?, now() + interval '15 minutes')
                """, challengeId, account.id(), challenges.hash("PASSWORD_RESET", CODE),
                challenges.hash("destination", account.email()));
        var reset = post("/api/v1/auth/reset/complete", null, json.createObjectNode()
                .put("email", account.email()).put("code", CODE).put("newPassword", NEW_PASSWORD).toString());
        assertThat(reset.statusCode()).as(reset.body()).isEqualTo(200);
        assertThat(json.readTree(reset.body())).isEqualTo(json.createObjectNode()
                .put("message", "Contraseña actualizada. Inicia sesión de nuevo."));

        var challenge = jdbc.queryForMap("""
                SELECT consumed_at, revoked_at, attempt_count FROM wok.verification_challenges WHERE id = ?
                """, challengeId);
        assertThat(challenge.get("consumed_at")).isNotNull();
        assertThat(challenge).containsEntry("revoked_at", null).containsEntry("attempt_count", 0);
        var credentialsAfter = credentialState(account);
        assertThat(credentialsAfter.get("password_hash")).isNotEqualTo(credentialsBefore.get("password_hash"));
        assertThat(passwords.matches(NEW_PASSWORD, (String) credentialsAfter.get("password_hash"))).isTrue();
        assertThat(passwords.matches(OLD_PASSWORD, (String) credentialsAfter.get("password_hash"))).isFalse();
        assertThat(credentialsAfter).containsEntry("must_change_password", false);
        assertThat(credentialsAfter.get("password_changed_at")).isNotNull();
        assertThat((java.sql.Timestamp) userState(account).get("sessions_valid_after"))
                .isAfter((java.sql.Timestamp) userBefore.get("sessions_valid_after"));

        var revokedSessions = sessionState(account);
        var revokedTokens = refreshState(account);
        assertThat(revokedSessions).hasSize(2).allSatisfy(row -> {
            assertThat(row.get("revoked_at")).isNotNull();
            assertThat(row).containsEntry("revocation_reason", "PASSWORD_RESET");
        });
        // Refresh tokens store revoked_at; their revocation reason belongs to the owning session.
        assertThat(revokedTokens).hasSize(2).allSatisfy(row -> {
            assertThat(row.get("revoked_at")).isNotNull();
            assertThat(row).containsEntry("used_at", null).containsEntry("parent_token_id", null);
        });
        for (Session session : List.of(first, second)) {
            var me = get("/api/v1/auth/me", session.access());
            assertThat(me.statusCode()).as(me.body()).isEqualTo(401);
            var rejected = refresh(session);
            assertThat(rejected.statusCode()).as(rejected.body()).isEqualTo(401);
            assertThat(json.readTree(rejected.body())).isEqualTo(
                    json.createObjectNode().put("message", "Sesión inválida."));
        }
        assertThat(sessionState(account)).isEqualTo(revokedSessions);
        assertThat(refreshState(account)).isEqualTo(revokedTokens);
        var oldLogin = loginResponse(account, OLD_PASSWORD, "WEB");
        assertThat(oldLogin.statusCode()).as(oldLogin.body()).isEqualTo(401);
        Session replacement = login(account, NEW_PASSWORD, "WEB");
        assertThat(replacement.id()).isNotIn(first.id(), second.id());
        assertMe(replacement, account);

        // Compare before exercising the control user's own successful login/rotation.
        assertThat(userState(other)).isEqualTo(otherUserBefore);
        assertThat(credentialState(other)).isEqualTo(otherCredentialsBefore);
        assertThat(sessionState(other)).isEqualTo(otherSessionsBefore);
        assertThat(refreshState(other)).isEqualTo(otherTokensBefore);
        assertMe(otherSession, other);
        var otherRefresh = refresh(otherSession);
        assertThat(otherRefresh.statusCode()).as(otherRefresh.body()).isEqualTo(200);
        Session rotated = readSession(otherRefresh.body());
        assertThat(rotated.id()).isEqualTo(otherSession.id());
        assertThat(rotated.refresh()).isNotEqualTo(otherSession.refresh());
        assertMe(rotated, other);
        assertMe(login(other, OLD_PASSWORD, "WEB"), other);
    }

    @Test
    void expiredCodeIsRejectedWithoutChangingEitherAccount() throws Exception {
        ResetFixture fixture = createResetFixture();
        jdbc.update("""
                UPDATE wok.verification_challenges
                SET created_at = now() - interval '20 minutes', expires_at = now() - interval '5 minutes'
                WHERE id = ?
                """, fixture.challengeId());
        var before = protectedState(fixture);
        var challengeBefore = challengeState(fixture.challengeId());

        assertNeutralRejection(completeReset(fixture, CODE, NEW_PASSWORD));

        assertThat(challengeState(fixture.challengeId())).isEqualTo(challengeBefore)
                .containsEntry("attempt_count", 0).containsEntry("consumed_at", null);
        assertThat(protectedState(fixture)).isEqualTo(before);
        assertSessionsUsable(fixture);
    }

    @Test
    void consumedCodeCannotResetPasswordAgainOrRevokeNewSessions() throws Exception {
        ResetFixture fixture = createResetFixture();
        var otherBefore = accountState(fixture.other());
        var otherChallengeBefore = challengeState(fixture.otherChallengeId());
        var success = completeReset(fixture, CODE, NEW_PASSWORD);
        assertThat(success.statusCode()).as(success.body()).isEqualTo(200);
        assertThat(accountState(fixture.other())).isEqualTo(otherBefore);
        assertThat(challengeState(fixture.otherChallengeId())).isEqualTo(otherChallengeBefore);
        var consumed = challengeState(fixture.challengeId());
        assertThat(consumed.get("consumed_at")).isNotNull();
        assertThat(consumed).containsEntry("attempt_count", 0).containsEntry("revoked_at", null);
        // New live sessions make an accidental second revocation observable.
        fixture = new ResetFixture(fixture.account(), fixture.other(), fixture.challengeId(),
                fixture.otherChallengeId(), List.of(login(fixture.account(), NEW_PASSWORD, "WEB"),
                login(fixture.account(), NEW_PASSWORD, "MOBILE")), fixture.otherSession(), fixture.clientIp());
        var before = protectedState(fixture);

        assertNeutralRejection(completeReset(fixture, CODE, OLD_PASSWORD));

        assertThat(challengeState(fixture.challengeId())).isEqualTo(consumed);
        assertThat(protectedState(fixture)).isEqualTo(before);
        assertSessionsUsable(fixture);
    }

    @Test
    void fiveIncorrectAttemptsPersistAndCorrectCodeRemainsRejectedAfterExhaustion() throws Exception {
        ResetFixture fixture = createResetFixture();
        var before = protectedState(fixture);
        var initialChallenge = challengeState(fixture.challengeId());
        for (int attempt = 1; attempt <= 5; attempt++) {
            assertNeutralRejection(completeReset(fixture, "482194", NEW_PASSWORD));
            // Independent reads after each HTTP transaction prove the failed attempt was committed.
            var expected = new java.util.HashMap<>(initialChallenge);
            expected.put("attempt_count", attempt);
            assertThat(challengeState(fixture.challengeId())).isEqualTo(expected)
                    .containsEntry("max_attempts", 5).containsEntry("consumed_at", null)
                    .containsEntry("revoked_at", null);
            assertThat(protectedState(fixture)).isEqualTo(before);
        }
        var exhausted = challengeState(fixture.challengeId());

        // Expire only the transport limiter's window so the sixth request reaches the
        // exhausted challenge. Its persisted attempts and expiry remain untouched.
        assertThat(jdbc.update("""
                UPDATE wok.auth_rate_limit_events SET created_at = now() - interval '16 minutes'
                WHERE action = 'RESET_COMPLETE' AND scope = 'IDENTIFIER' AND subject = ?
                """, fixture.account().email())).isEqualTo(5);

        assertNeutralRejection(completeReset(fixture, CODE, NEW_PASSWORD));

        assertThat(challengeState(fixture.challengeId())).isEqualTo(exhausted);
        assertThat(protectedState(fixture)).isEqualTo(before);
        assertSessionsUsable(fixture);
    }

    private ResetFixture createResetFixture() throws Exception {
        Account account = createAccount();
        Account other = createAccount();
        List<Session> sessions = List.of(login(account, OLD_PASSWORD, "WEB"),
                login(account, OLD_PASSWORD, "MOBILE"));
        Session otherSession = login(other, OLD_PASSWORD, "WEB");
        UUID challengeId = createResetChallenge(account);
        UUID otherChallengeId = createResetChallenge(other);
        assertThat(challengeState(challengeId)).containsEntry("attempt_count", 0)
                .containsEntry("max_attempts", 5).containsEntry("consumed_at", null)
                .containsEntry("revoked_at", null);
        assertThat(sessionState(account)).hasSize(2).allSatisfy(row ->
                assertThat(row).containsEntry("revoked_at", null));
        return new ResetFixture(account, other, challengeId, otherChallengeId, sessions, otherSession, clientIp(account));
    }

    private UUID createResetChallenge(Account account) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.verification_challenges
                    (id, user_id, purpose, code_hash, destination_hash, expires_at)
                VALUES (?, ?, 'PASSWORD_RESET', ?, ?, now() + interval '15 minutes')
                """, id, account.id(), challenges.hash("PASSWORD_RESET", CODE),
                challenges.hash("destination", account.email()));
        return id;
    }

    private HttpResponse<String> completeReset(ResetFixture fixture, String code, String newPassword) {
        return post("/api/v1/auth/reset/complete", null, json.createObjectNode()
                .put("email", fixture.account().email()).put("code", code)
                .put("newPassword", newPassword).toString(), Map.of("X-Forwarded-For", fixture.clientIp()));
    }

    private void assertNeutralRejection(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(json.readTree(response.body())).isEqualTo(
                json.createObjectNode().put("message", "Código inválido o vencido."));
    }

    private Map<String, Object> challengeState(UUID id) {
        return jdbc.queryForMap("SELECT * FROM wok.verification_challenges WHERE id = ?", id);
    }

    private Map<String, Object> accountState(Account account) {
        return Map.of("user", userState(account), "credentials", credentialState(account),
                "sessions", sessionState(account), "refreshTokens", refreshState(account));
    }

    private Map<String, Object> protectedState(ResetFixture fixture) {
        return Map.of("account", accountState(fixture.account()), "other", accountState(fixture.other()),
                "otherChallenge", challengeState(fixture.otherChallengeId()));
    }

    private void assertSessionsUsable(ResetFixture fixture) throws Exception {
        for (Session session : fixture.sessions()) assertMe(session, fixture.account());
        assertMe(fixture.otherSession(), fixture.other());
    }

    private record ResetFixture(Account account, Account other, UUID challengeId, UUID otherChallengeId,
                                List<Session> sessions, Session otherSession, String clientIp) {}

    private Account createAccount() {
        String email = "reset-it-" + UUID.randomUUID() + "@example.test";
        UUID id = createUserWithRole(email, "CLIENT");
        jdbc.update("INSERT INTO wok.user_credentials (user_id, password_hash) VALUES (?, ?)",
                id, passwords.encode(OLD_PASSWORD));
        return new Account(id, email);
    }

    private HttpResponse<String> loginResponse(Account account, String password, String clientType) {
        return post("/api/v1/auth/login", null, json.createObjectNode().put("email", account.email())
                .put("password", password).put("clientType", clientType).toString(),
                Map.of("X-Forwarded-For", clientIp(account)));
    }

    private String clientIp(Account account) {
        // Keep this account's HTTP counters isolated from other tests sharing PostgreSQL.
        String suffix = account.id().toString().replace("-", "");
        return "2001:db8:" + suffix.substring(0, 4) + ":" + suffix.substring(4, 8)
                + ":" + suffix.substring(8, 12) + ":" + suffix.substring(12, 16)
                + ":" + suffix.substring(16, 20) + ":" + suffix.substring(20, 24);
    }

    private Session login(Account account, String password, String clientType) throws Exception {
        var response = loginResponse(account, password, clientType);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return readSession(response.body());
    }

    private Session readSession(String body) throws Exception {
        var pair = json.readTree(body);
        String access = pair.path("accessToken").asText();
        String refresh = pair.path("refreshToken").asText();
        assertThat(access).isNotBlank();
        assertThat(refresh).isNotBlank();
        UUID id = jdbc.queryForObject("SELECT session_id FROM wok.refresh_tokens WHERE token_hash = ?",
                UUID.class, tokens.hash(refresh));
        return new Session(id, access, refresh);
    }

    private void assertMe(Session session, Account account) throws Exception {
        var response = get("/api/v1/auth/me", session.access());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(json.readTree(response.body()).path("userId").asText()).isEqualTo(account.id().toString());
    }

    private HttpResponse<String> refresh(Session session) {
        return post("/api/v1/auth/refresh", null,
                json.createObjectNode().put("refreshToken", session.refresh()).toString());
    }

    private Map<String, Object> userState(Account account) {
        return jdbc.queryForMap("SELECT * FROM wok.users WHERE id = ?", account.id());
    }

    private Map<String, Object> credentialState(Account account) {
        return jdbc.queryForMap("SELECT * FROM wok.user_credentials WHERE user_id = ?", account.id());
    }

    private List<Map<String, Object>> sessionState(Account account) {
        return jdbc.queryForList("SELECT * FROM wok.auth_sessions WHERE user_id = ? ORDER BY id", account.id());
    }

    private List<Map<String, Object>> refreshState(Account account) {
        return jdbc.queryForList("""
                SELECT rt.* FROM wok.refresh_tokens rt JOIN wok.auth_sessions s ON s.id = rt.session_id
                WHERE s.user_id = ? ORDER BY rt.id
                """, account.id());
    }

    private record Account(UUID id, String email) {}
    private record Session(UUID id, String access, String refresh) {}
}
