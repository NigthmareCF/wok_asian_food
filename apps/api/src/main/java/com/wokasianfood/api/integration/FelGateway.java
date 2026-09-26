package com.wokasianfood.api.integration;

import java.util.UUID;

/** Certification result can be UNKNOWN and must be reconciled before retry. */
public interface FelGateway {
    CertificationResult certify(UUID invoiceId, byte[] originalXml, String idempotencyKey);
    record CertificationResult(String providerReference, State state) {}
    enum State { DRAFT, PENDING_CERTIFICATION, CERTIFYING, CERTIFIED, REJECTED,
                 UNKNOWN, CONTINGENCY, CANCELLATION_PENDING, CANCELLED }
}
