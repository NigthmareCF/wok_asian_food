package com.wokasianfood.api.identity;

import java.util.Base64;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AuthSecrets {
    private final SecretKey jwtKey;
    private final SecretKey challengeKey;

    public AuthSecrets(@Value("${wok.auth.jwt-secret-base64}") String jwt,
                       @Value("${wok.auth.challenge-pepper-base64}") String challenge) {
        jwtKey = decode(jwt, "WOK_AUTH_JWT_SECRET_BASE64");
        challengeKey = decode(challenge, "WOK_AUTH_CHALLENGE_PEPPER_BASE64");
    }

    private SecretKey decode(String encoded, String name) {
        try {
            byte[] bytes = Base64.getDecoder().decode(encoded);
            if (bytes.length < 32) throw new IllegalArgumentException(name + " must contain at least 32 bytes");
            return new SecretKeySpec(bytes, "HmacSHA256");
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException(name + " must be a base64-encoded 32+ byte secret", error);
        }
    }

    public SecretKey jwtKey() { return jwtKey; }
    public SecretKey challengeKey() { return challengeKey; }
}
