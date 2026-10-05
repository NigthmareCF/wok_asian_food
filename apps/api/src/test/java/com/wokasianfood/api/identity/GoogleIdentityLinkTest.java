package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.wokasianfood.api.identity.AuthDtos.GoogleLogin;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.crypto.password.PasswordEncoder;

class GoogleIdentityLinkTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final TokenService tokens = mock(TokenService.class);
    private final GoogleIdentityVerifier verifier = mock(GoogleIdentityVerifier.class);
    private final GoogleNonceService nonces = mock(GoogleNonceService.class);
    private final UUID userId = UUID.randomUUID();
    private AuthService auth;

    @BeforeEach
    void setUp() {
        AuthSecrets secrets = new AuthSecrets(Base64.getEncoder().encodeToString(new byte[32]),
                Base64.getEncoder().encodeToString(new byte[32]));
        when(passwords.encode(any())).thenReturn("dummy-hash");
        when(nonces.consume("nonce-123")).thenReturn(true);
        auth = new AuthService(jdbc, passwords, tokens, new ChallengeService(secrets), secrets, verifier, nonces);
        when(verifier.verify("google-id-token", "nonce-123")).thenReturn(
                new GoogleIdentityVerifier.VerifiedIdentity("google-subject", "customer@example.com", true));
    }

    @Test
    void linksOnlyTheVerifiedGoogleIdentityToTheAuthenticatedMatchingWokAccount() {
        when(jdbc.query(contains("SELECT email FROM wok.users"), anyRowMapper(), eq(userId)))
                .thenReturn(List.of("customer@example.com"));
        when(jdbc.query(contains("SELECT user_id FROM wok.auth_identities"), anyRowMapper(), eq("google-subject")))
                .thenReturn(List.of());
        when(jdbc.update(contains("INSERT INTO wok.auth_identities"), any(Object[].class))).thenReturn(1);

        assertDoesNotThrow(() -> auth.linkGoogle(userId, UUID.randomUUID(), new GoogleLogin("google-id-token", "nonce-123")));

        verify(jdbc).update(contains("INSERT INTO wok.auth_identities"), any(Object[].class));
        verify(jdbc).update(contains("GOOGLE_IDENTITY_LINKED"), any(Object[].class));
    }

    @Test
    void refusesToLinkWhenVerifiedProviderEmailDoesNotMatchCurrentWokAccount() {
        when(jdbc.query(contains("SELECT email FROM wok.users"), anyRowMapper(), eq(userId)))
                .thenReturn(List.of("another@example.com"));

        AuthException error = assertThrows(AuthException.class,
                () -> auth.linkGoogle(userId, UUID.randomUUID(), new GoogleLogin("google-id-token", "nonce-123")));

        assertEquals(403, error.status());
        verify(jdbc, never()).update(contains("INSERT INTO wok.auth_identities"), any(Object[].class));
    }

    @Test
    void refusesIdentityAlreadyLinkedToAnotherWokAccount() {
        when(jdbc.query(contains("SELECT email FROM wok.users"), anyRowMapper(), eq(userId)))
                .thenReturn(List.of("customer@example.com"));
        when(jdbc.query(contains("SELECT user_id FROM wok.auth_identities"), anyRowMapper(), eq("google-subject")))
                .thenReturn(List.of(UUID.randomUUID()));

        AuthException error = assertThrows(AuthException.class,
                () -> auth.linkGoogle(userId, UUID.randomUUID(), new GoogleLogin("google-id-token", "nonce-123")));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(contains("INSERT INTO wok.auth_identities"), any(Object[].class));
    }

    @SuppressWarnings("unchecked")
    private RowMapper<Object> anyRowMapper() { return (RowMapper<Object>) any(RowMapper.class); }
}
