package com.wokasianfood.api.integration;

import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class MockFelGateway implements FelGateway {
    @Override public CertificationResult certify(UUID invoiceId, byte[] originalXml, String idempotencyKey) {
        if (invoiceId == null || originalXml == null || originalXml.length == 0 || idempotencyKey == null || idempotencyKey.isBlank())
            throw new IllegalArgumentException("invalid certification request");
        return new CertificationResult("mock-" + UUID.randomUUID(), State.PENDING_CERTIFICATION);
    }
}
