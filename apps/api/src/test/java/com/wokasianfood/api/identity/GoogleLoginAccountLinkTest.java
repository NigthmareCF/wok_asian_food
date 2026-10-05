package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.wokasianfood.api.identity.AuthDtos.GoogleLogin;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.crypto.password.PasswordEncoder;

class GoogleLoginAccountLinkTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final TokenService tokens = mock(TokenService.class);
    private final GoogleIdentityVerifier googleVerifier = mock(GoogleIdentityVerifier.class);
    private final GoogleNonceService googleNonces = mock(GoogleNonceService.class);
    private AuthService auth;

    @BeforeEach
    void setUp() {
        AuthSecrets secrets = new AuthSecrets(Base64.getEncoder().encodeToString(new byte[32]),
                Base64.getEncoder().encodeToString(new byte[32]));
        when(passwords.encode(anyString())).thenReturn("dummy-hash");
        when(googleNonces.consume("nonce-123")).thenReturn(true);
        auth = new AuthService(jdbc, passwords, tokens, new ChallengeService(secrets), secrets, googleVerifier,
                googleNonces);
    }

    @Test
    void loginLooksUpStableProviderSubjectAndDoesNotAutoLinkByEmail() {
        when(googleVerifier.verify("google-id-token", "nonce-123")).thenReturn(
                new GoogleIdentityVerifier.VerifiedIdentity("google-subject", "existing@example.com", true));
        when(jdbc.query(contains("provider_subject"), anyRowMapper(), eq("google-subject"))).thenReturn(List.of());

        AuthException error = assertThrows(AuthException.class,
                () -> auth.google(new GoogleLogin("google-id-token", "nonce-123")));

        assertEquals(409, error.status());
        verify(jdbc).query(contains("provider = 'GOOGLE' AND ai.provider_subject = ?"),
                anyRowMapper(), eq("google-subject"));
        verify(jdbc, never()).update(contains("INSERT INTO wok.auth_identities"), any(Object[].class));
        verify(tokens, never()).refresh();
    }

    @Test
    void rejectsAReplayedOrUnissuedNonceBeforeLookingUpAnAccount() {
        when(googleVerifier.verify("google-id-token", "nonce-123")).thenReturn(
                new GoogleIdentityVerifier.VerifiedIdentity("google-subject", "customer@example.com", true));
        when(googleNonces.consume("nonce-123")).thenReturn(false);

        AuthException error = assertThrows(AuthException.class,
                () -> auth.google(new GoogleLogin("google-id-token", "nonce-123")));

        assertEquals(401, error.status());
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsUnverifiedExternalEmailBeforeIdentityLookup() {
        when(googleVerifier.verify("google-id-token", "nonce-123")).thenReturn(
                new GoogleIdentityVerifier.VerifiedIdentity("google-subject", "customer@example.com", false));

        AuthException error = assertThrows(AuthException.class,
                () -> auth.google(new GoogleLogin("google-id-token", "nonce-123")));

        assertEquals(401, error.status());
        verifyNoInteractions(jdbc);
    }

    @Test
    void recordsMobileClientTypeForAValidLinkedGoogleIdentity() {
        UUID userId = UUID.randomUUID();
        when(googleVerifier.verify("google-id-token", "nonce-123")).thenReturn(
                new GoogleIdentityVerifier.VerifiedIdentity("google-subject", "customer@example.com", true));
        when(jdbc.query(contains("provider_subject"), anyRowMapper(), eq("google-subject"))).thenReturn(List.of(userId));
        when(tokens.refreshExpiry()).thenReturn(Instant.now().plusSeconds(3600));
        when(tokens.refresh()).thenReturn("refresh-token");
        when(tokens.access(any(UUID.class), any(UUID.class))).thenReturn("access-token");
        when(tokens.accessSeconds()).thenReturn(600L);

        auth.google(new GoogleLogin("google-id-token", "nonce-123", "MOBILE"));

        ArgumentCaptor<Object[]> sessionArguments = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(contains("INSERT INTO wok.auth_sessions"), sessionArguments.capture());
        assertEquals("MOBILE", sessionArguments.getValue()[2]);
    }

    @SuppressWarnings("unchecked")
    private RowMapper<Object> anyRowMapper() { return (RowMapper<Object>) any(RowMapper.class); }
}
