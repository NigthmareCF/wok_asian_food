package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@org.springframework.test.context.TestPropertySource(properties = "wok.http.trusted-proxies=127.0.0.1/32")
class VerificationChallengeIntegrationTest extends PostgresIntegrationTest {
    private static final String CODE = "482193";
    private static final String WRONG_CODE = "482194";
    @Autowired private ChallengeService challenges;
    private UUID userId;
    private UUID challengeId;
    private String email;
    private String clientIp;

    @BeforeEach
    void createPendingAccountAndChallenge() {
        userId = UUID.randomUUID();
        challengeId = UUID.randomUUID();
        email = "verification-it-" + userId + "@example.test";
        String addressSuffix = userId.toString().replace("-", "");
        clientIp = "2001:db8:" + addressSuffix.substring(0, 4) + ":" + addressSuffix.substring(4, 8)
                + ":" + addressSuffix.substring(8, 12) + ":" + addressSuffix.substring(12, 16)
                + ":" + addressSuffix.substring(16, 20) + ":" + addressSuffix.substring(20, 24);
        // Controlled fixtures isolate challenge handling from registration and email delivery.
        jdbc.update("""
                INSERT INTO wok.users (id, email, display_name, status)
                VALUES (?, ?, 'Cuenta de verificación', 'PENDING_VERIFICATION')
                """, userId, email);
        jdbc.update("""
                INSERT INTO wok.verification_challenges (id, user_id, purpose, code_hash, destination_hash, expires_at)
                VALUES (?, ?, 'ACCOUNT_VERIFICATION', ?, ?, now() + interval '15 minutes')
                """, challengeId, userId, challenges.hash("ACCOUNT_VERIFICATION", CODE),
                challenges.hash("destination", email));
        assertThat(challengeState()).containsEntry("attempt_count", 0).containsEntry("max_attempts", 5);
    }

    @Test
    void expiredCorrectCodeReturnsNeutral400AndLeavesAccountPending() {
        jdbc.update("""
                UPDATE wok.verification_challenges
                SET created_at = now() - interval '20 minutes', expires_at = now() - interval '5 minutes'
                WHERE id = ?
                """, challengeId);

        assertNeutralBadRequest(verifyCode(CODE));

        assertPendingAccount();
        assertThat(challengeState()).containsEntry("attempt_count", 0).containsEntry("consumed_at", null);
    }

    @Test
    void alreadyConsumedCodeCannotActivateAPendingAccount() {
        jdbc.update("UPDATE wok.verification_challenges SET consumed_at = now() WHERE id = ?", challengeId);
        var before = challengeState();

        assertNeutralBadRequest(verifyCode(CODE));

        assertPendingAccount();
        assertThat(challengeState()).isEqualTo(before);
    }

    @Test
    void successfulVerificationCannotBeReusedOrChangeTheVerifiedAccountAgain() {
        var first = verifyCode(CODE);
        assertThat(first.statusCode()).as(first.body()).isEqualTo(200);
        var verifiedUser = userState();
        var consumedChallenge = challengeState();
        assertThat(verifiedUser).containsEntry("status", "ACTIVE");
        assertThat(verifiedUser.get("email_verified_at")).isNotNull();
        assertThat(consumedChallenge.get("consumed_at")).isNotNull();
        assertThat(consumedChallenge).containsEntry("attempt_count", 0);

        assertNeutralBadRequest(verifyCode(CODE));

        assertThat(userState()).isEqualTo(verifiedUser);
        assertThat(challengeState()).isEqualTo(consumedChallenge);
    }

    @Test
    void fiveFailedAttemptsPersistAndPreventActivationEvenWithTheCorrectCode() {
        for (int attempt = 1; attempt <= 5; attempt++) {
            assertNeutralBadRequest(verifyCode(WRONG_CODE));
            // Each HTTP transaction has finished; this independent DB read proves failures were committed.
            assertThat(challengeState()).containsEntry("attempt_count", attempt)
                    .containsEntry("max_attempts", 5).containsEntry("consumed_at", null);
            assertPendingAccount();
        }
        var exhaustedChallenge = challengeState();

        assertNeutralBadRequest(verifyCode(CODE));

        assertPendingAccount();
        assertThat(challengeState()).isEqualTo(exhaustedChallenge);
    }

    private HttpResponse<String> verifyCode(String code) {
        return post("/api/v1/auth/verify", null,
                "{\"email\":\"" + email + "\",\"code\":\"" + code + "\"}",
                Map.of("X-Forwarded-For", clientIp));
    }

    private void assertNeutralBadRequest(HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(response.body()).isEqualTo("{\"message\":\"Código inválido o vencido.\"}");
    }

    private void assertPendingAccount() {
        assertThat(userState()).containsEntry("status", "PENDING_VERIFICATION")
                .containsEntry("email_verified_at", null);
    }

    private Map<String, Object> userState() {
        return jdbc.queryForMap("SELECT status, email_verified_at, updated_at FROM wok.users WHERE id = ?", userId);
    }

    private Map<String, Object> challengeState() {
        return jdbc.queryForMap("""
                SELECT attempt_count, max_attempts, consumed_at, revoked_at, expires_at
                FROM wok.verification_challenges WHERE id = ?
                """, challengeId);
    }
}
