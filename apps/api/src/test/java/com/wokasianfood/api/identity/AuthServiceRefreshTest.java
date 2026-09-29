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
        auth = new AuthService(jdbc, passwords, tokens, new ChallengeService(secrets), secrets, googleVerifier);
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
