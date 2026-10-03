package com.wokasianfood.api.fiscal;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Adaptador simulado: numeracion determinista y DTE reproducible, sin certificar ante la SAT. */
@Component
@ConditionalOnProperty(name = "wok.fiscal.mode", havingValue = "mock", matchIfMissing = true)
public class MockFiscalProvider implements FiscalProvider {
    @Override
    public Certification certify(CertificationRequest request) {
        String token = request.invoiceId().toString().replace("-", "").substring(0, 12).toUpperCase();
        UUID dteUuid = UUID.nameUUIDFromBytes(("wok-dte:" + request.invoiceId()).getBytes(StandardCharsets.UTF_8));
        return new Certification("MOCK-" + token, dteUuid, "MOCK");
    }
}
