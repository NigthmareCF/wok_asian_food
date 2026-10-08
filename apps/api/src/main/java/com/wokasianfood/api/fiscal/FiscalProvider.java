package com.wokasianfood.api.fiscal;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Puerto de certificacion fiscal. El adaptador real ante la SAT queda pendiente (BLOCKED). */
public interface FiscalProvider {
    Certification certify(CertificationRequest request);

    record CertificationRequest(UUID invoiceId, String accountName, BigDecimal total, BigDecimal taxTotal,
                                String customerName, String customerTaxId, List<CertificationLine> lines) {}

    record CertificationLine(String description, int quantity, BigDecimal unitPrice) {}

    record Certification(String authorizationNumber, UUID dteUuid, String providerRef) {}

    /** Definitive rejection: the provider guarantees that no fiscal document was issued. */
    class FiscalException extends RuntimeException {
        public FiscalException(String message) { super(message); }
    }

    /** The provider guarantees this request was not accepted and it is safe to retry. */
    class RetryableException extends RuntimeException {
        public RetryableException(String message) { super(message); }
    }
}
