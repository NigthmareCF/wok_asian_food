package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class ChallengeServiceTest {
    private final AuthSecrets secrets = new AuthSecrets(Base64.getEncoder().encodeToString(new byte[32]),
            Base64.getEncoder().encodeToString(new byte[32]));
    private final ChallengeService challenges = new ChallengeService(secrets);

    @Test void challengeIsPurposeBoundAndNeverStoredAsCode() {
        String code = challenges.createCode();
        String digest = challenges.hash("ACCOUNT_VERIFICATION", code);
        assertEquals(6, code.length());
        assertNotEquals(code, digest);
        assertTrue(challenges.matches("ACCOUNT_VERIFICATION", code, digest));
        assertFalse(challenges.matches("PASSWORD_RESET", code, digest));
        assertFalse(challenges.matches("ACCOUNT_VERIFICATION", "999999".equals(code) ? "000000" : "999999", digest));
    }

    @Test void rejectsMissingProductionSecrets() {
        assertThrows(IllegalArgumentException.class, () -> new AuthSecrets("", ""));
    }
}
