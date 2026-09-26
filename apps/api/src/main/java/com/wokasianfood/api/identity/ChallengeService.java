package com.wokasianfood.api.identity;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import javax.crypto.Mac;
import org.springframework.stereotype.Service;

@Service
public class ChallengeService {
    private final AuthSecrets secrets;
    private final SecureRandom random = new SecureRandom();

    public ChallengeService(AuthSecrets secrets) { this.secrets = secrets; }

    public String createCode() { return "%06d".formatted(random.nextInt(1_000_000)); }

    public String hash(String purpose, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(secrets.challengeKey());
            return HexFormat.of().formatHex(mac.doFinal((purpose + ":" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException("Challenge hashing failed", e); }
    }

    public boolean matches(String purpose, String submitted, String stored) {
        return MessageDigest.isEqual(hash(purpose, submitted).getBytes(StandardCharsets.US_ASCII),
                stored.getBytes(StandardCharsets.US_ASCII));
    }
}
