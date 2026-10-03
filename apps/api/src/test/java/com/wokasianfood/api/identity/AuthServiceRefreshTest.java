package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.wokasianfood.api.identity.AuthDtos.Refresh;
import com.wokasianfood.api.identity.AuthDtos.TokenPair;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class AuthServiceRefreshTest {
    @Mock private JdbcTemplate jdbc;
    @Mock private org.springframework.security.crypto.password.PasswordEncoder passwords;
    @Mock private TokenService tokens;
    @Mock private GoogleIdentityVerifier googleVerifier;
    private AuthService auth;

    @BeforeEach
    void setUp() {
        AuthSecrets secrets = new AuthSecrets(Base64.getEncoder().encodeToString(new byte[32]),
                Base64.getEncoder().encodeToString(new byte[32]));
        when(passwords.encode(anyString())).thenReturn("dummy-hash");
        auth = new AuthService(jdbc, passwords, tokens, new ChallengeService(secrets), secrets, googleVerifier,
                mock(GoogleNonceService.class));
    }

    @Test
    void rotatesActiveRefreshTokenAndLinksTheReplacementToItsParent() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID tokenId = UUID.randomUUID();
        stubRefreshToken(tokenId, sessionId, userId, null, null, null, "ACTIVE");
        when(tokens.hash("old-token")).thenReturn("old-hash");
        when(tokens.hash("next-token")).thenReturn("next-hash");
        when(tokens.refresh()).thenReturn("next-token");
        when(tokens.access(userId, sessionId)).thenReturn("access-token");
        when(tokens.accessSeconds()).thenReturn(900L);

        TokenPair result = auth.refresh(new Refresh("old-token"));

        assertEquals("access-token", result.accessToken());
        assertEquals("next-token", result.refreshToken());
        assertEquals(900L, result.expiresInSeconds());
        verify(jdbc).update(contains("SET used_at = now()"), eq(tokenId));
        verify(jdbc).update(contains("parent_token_id, expires_at"), eq(sessionId), eq("next-hash"), eq(tokenId), any(Timestamp.class));
        verify(jdbc).update(contains("last_activity_at = now()"), eq(sessionId));
    }

    @Test
    void reuseRevokesTheSessionFamilyAndWritesCriticalSecurityEvent() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID tokenId = UUID.randomUUID();
        stubRefreshToken(tokenId, sessionId, userId, Instant.now().minusSeconds(5), null, null, "ACTIVE");
        when(tokens.hash("reused-token")).thenReturn("used-hash");

        AuthException error = assertThrows(AuthException.class, () -> auth.refresh(new Refresh("reused-token")));

        assertEquals(401, error.status());
        verify(jdbc).update(contains("REFRESH_REUSE"), eq(sessionId));
        verify(jdbc).update(contains("UPDATE wok.refresh_tokens SET revoked_at"), eq(sessionId));
        verify(jdbc).update(contains("REFRESH_TOKEN_REUSE"), eq(userId), eq(sessionId));
        verify(tokens, never()).refresh();
    }

    @Test
    void suspendedAccountCannotRotateAnOtherwiseValidRefreshToken() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID tokenId = UUID.randomUUID();
        stubRefreshToken(tokenId, sessionId, userId, null, null, null, "SUSPENDED");
        when(tokens.hash("suspended-token")).thenReturn("suspended-hash");

        AuthException error = assertThrows(AuthException.class, () -> auth.refresh(new Refresh("suspended-token")));

        assertEquals(401, error.status());
        verify(jdbc, never()).update(contains("SET used_at = now()"), any(Object[].class));
        verify(tokens, never()).refresh();
    }

    @Test
    void passwordResetChangesCredentialAndRevokesEverySessionAndRefreshToken() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        String code = "482193";
        String codeHash = new ChallengeService(new AuthSecrets(Base64.getEncoder().encodeToString(new byte[32]),
                Base64.getEncoder().encodeToString(new byte[32]))).hash("PASSWORD_RESET", code);
        when(jdbc.query(anyString(), anyRowMapper(), eq("client@example.com"))).thenReturn(List.of(userId));
        when(jdbc.query(anyString(), anyRowMapper(), eq(userId), eq("PASSWORD_RESET"))).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("id", UUID.class)).thenReturn(challengeId);
            when(rs.getString("code_hash")).thenReturn(codeHash);
            when(rs.getInt("attempt_count")).thenReturn(0);
            when(rs.getInt("max_attempts")).thenReturn(5);
            when(rs.getTimestamp("expires_at")).thenReturn(Timestamp.from(Instant.now().plusSeconds(300)));
            return List.of(mapper.mapRow(rs, 0));
        });
        when(passwords.encode("new-long-password")).thenReturn("new-adaptive-hash");

        auth.completeReset(new com.wokasianfood.api.identity.AuthDtos.ResetComplete(
                "client@example.com", code, "new-long-password"));

        verify(jdbc).update(contains("SET consumed_at = now()"), eq(challengeId));
        verify(jdbc).update(contains("password_changed_at = now()"), eq("new-adaptive-hash"), eq(userId));
        verify(jdbc).update(contains("sessions_valid_after = now()"), eq(userId));
        verify(jdbc).update(contains("revocation_reason = 'PASSWORD_RESET'"), eq(userId));
        verify(jdbc).update(contains("UPDATE wok.refresh_tokens SET revoked_at"), eq(userId));
    }

    @Test
    void invalidPasswordResetCodeDoesNotChangePasswordOrRevokeSessions() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        when(jdbc.query(anyString(), anyRowMapper(), eq("client@example.com"))).thenReturn(List.of(userId));
        when(jdbc.query(anyString(), anyRowMapper(), eq(userId), eq("PASSWORD_RESET"))).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("id", UUID.class)).thenReturn(challengeId);
            when(rs.getString("code_hash")).thenReturn("different-code-hash");
            when(rs.getInt("attempt_count")).thenReturn(0);
            when(rs.getInt("max_attempts")).thenReturn(5);
            when(rs.getTimestamp("expires_at")).thenReturn(Timestamp.from(Instant.now().plusSeconds(300)));
            return List.of(mapper.mapRow(rs, 0));
        });

        AuthException error = assertThrows(AuthException.class, () -> auth.completeReset(
                new com.wokasianfood.api.identity.AuthDtos.ResetComplete(
                        "client@example.com", "482193", "new-long-password")));

        assertEquals(400, error.status());
        verify(jdbc).update(contains("attempt_count = attempt_count + 1"), eq(challengeId));
        verify(jdbc, never()).update(contains("password_changed_at = now()"), any(Object[].class));
        verify(jdbc, never()).update(contains("revocation_reason = 'PASSWORD_RESET'"), any(Object[].class));
    }

    private void stubRefreshToken(UUID tokenId, UUID sessionId, UUID userId, Instant usedAt,
                                  Instant revokedAt, Instant sessionRevokedAt, String userStatus) throws Exception {
        Instant now = Instant.now();
        when(jdbc.query(anyString(), anyRowMapper(), anyString())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("id", UUID.class)).thenReturn(tokenId);
            when(rs.getObject("session_id", UUID.class)).thenReturn(sessionId);
            when(rs.getObject("user_id", UUID.class)).thenReturn(userId);
            when(rs.getTimestamp("used_at")).thenReturn(timestamp(usedAt));
            when(rs.getTimestamp("revoked_at")).thenReturn(timestamp(revokedAt));
            when(rs.getTimestamp("expires_at")).thenReturn(Timestamp.from(now.plusSeconds(3600)));
            when(rs.getTimestamp("session_revoked_at")).thenReturn(timestamp(sessionRevokedAt));
            when(rs.getTimestamp("session_expires_at")).thenReturn(Timestamp.from(now.plusSeconds(7200)));
            when(rs.getString("status")).thenReturn(userStatus);
            when(rs.getTimestamp("sessions_valid_after")).thenReturn(Timestamp.from(now.minusSeconds(120)));
            when(rs.getTimestamp("session_created_at")).thenReturn(Timestamp.from(now.minusSeconds(60)));
            return List.of(mapper.mapRow(rs, 0));
        });
    }

    private Timestamp timestamp(Instant value) { return value == null ? null : Timestamp.from(value); }

    @SuppressWarnings("unchecked")
    private RowMapper<Object> anyRowMapper() {
        return (RowMapper<Object>) any(RowMapper.class);
    }
}
