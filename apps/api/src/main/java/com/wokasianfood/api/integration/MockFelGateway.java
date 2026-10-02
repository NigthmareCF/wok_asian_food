package com.wokasianfood.api.integration;

import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

@Component
public class MockFelGateway implements FelGateway {
    private final ConcurrentMap<String, CertificationEntry> certifications = new ConcurrentHashMap<>();

    @Override public CertificationResult certify(UUID invoiceId, byte[] originalXml, String idempotencyKey) {
        if (invoiceId == null || originalXml == null || originalXml.length == 0 || originalXml.length > 5_000_000
                || idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128)
            throw new IllegalArgumentException("invalid certification request");
        var requested = new CertificationEntry(invoiceId, sha256(originalXml),
                new CertificationResult(reference(idempotencyKey), State.PENDING_CERTIFICATION));
        var result = certifications.compute(idempotencyKey, (key, existing) -> {
            if (existing == null) return requested;
            if (!existing.sameRequest(requested)) {
                throw new IllegalArgumentException("idempotency key reused with a different certification request");
            }
            return existing;
        });
        return result.result();
    }

    private static String reference(String idempotencyKey) {
        byte[] input = ("wok-mock-fel:" + idempotencyKey).getBytes(StandardCharsets.UTF_8);
        return "mock-" + UUID.nameUUIDFromBytes(input);
    }

    private static String sha256(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 is unavailable", impossible); }
    }

    private record CertificationEntry(UUID invoiceId, String xmlHash, CertificationResult result) {
        boolean sameRequest(CertificationEntry other) {
            return invoiceId.equals(other.invoiceId) && xmlHash.equals(other.xmlHash);
        }
    }
}
