package com.wokasianfood.api.identity;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Issues opaque OIDC nonces and stores only their hashes for one-time validation. */
@Service
public class GoogleNonceService {
    private static final int NONCE_BYTES = 32;
    private static final int TTL_SECONDS = 300;

    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public GoogleNonceService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public IssuedNonce issue() {
        byte[] bytes = new byte[NONCE_BYTES];
        random.nextBytes(bytes);
        // Google native SDKs expect a SHA-256 hex nonce. The random value itself is
        // already an independent 256-bit challenge; only its hash is persisted.
        String value = HexFormat.of().formatHex(bytes);
        jdbc.update("DELETE FROM wok.google_oidc_nonce_challenges WHERE expires_at <= now() OR consumed_at IS NOT NULL");
        jdbc.update("INSERT INTO wok.google_oidc_nonce_challenges (nonce_hash, expires_at) VALUES (?, now() + interval '5 minutes')",
                hash(value));
        return new IssuedNonce(value, TTL_SECONDS);
    }

    /** Returns true once only, and only while the server-issued challenge remains valid. */
    public boolean consume(String value) {
        if (value == null || !value.matches("[0-9a-f]{64}")) return false;
        return jdbc.update("""
                UPDATE wok.google_oidc_nonce_challenges
                SET consumed_at = now()
                WHERE nonce_hash = ? AND consumed_at IS NULL AND expires_at > now()
                """, hash(value)) == 1;
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    public record IssuedNonce(String nonce, int expiresInSeconds) {}
}
