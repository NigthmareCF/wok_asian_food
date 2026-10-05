package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

class GoogleNonceServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    @Test
    void issuesCryptographicallySizedHexNonceAndStoresOnlyItsHash() {
        when(jdbc.update(contains("DELETE FROM wok.google_oidc_nonce_challenges"), any(Object[].class))).thenReturn(0);
        when(jdbc.update(startsWith("INSERT INTO wok.google_oidc_nonce_challenges"), any(Object[].class))).thenReturn(1);

        GoogleNonceService.IssuedNonce issued = new GoogleNonceService(jdbc).issue();

        assertEquals(64, issued.nonce().length());
        assertTrue(issued.nonce().matches("[0-9a-f]{64}"));
        assertEquals(300, issued.expiresInSeconds());
        ArgumentCaptor<String> storedHash = ArgumentCaptor.forClass(String.class);
        verify(jdbc).update(startsWith("INSERT INTO wok.google_oidc_nonce_challenges"), storedHash.capture());
        assertEquals(64, storedHash.getValue().length());
        assertFalse(issued.nonce().equals(storedHash.getValue()));
    }

    @Test
    void consumesOnlyAValidNonceAndRejectsMalformedValues() {
        when(jdbc.update(contains("UPDATE wok.google_oidc_nonce_challenges"), any(Object[].class)))
                .thenReturn(1, 0);
        GoogleNonceService service = new GoogleNonceService(jdbc);
        String nonce = service.issue().nonce();

        assertTrue(service.consume(nonce));
        assertFalse(service.consume(nonce));
        assertFalse(service.consume("short"));
    }
}
