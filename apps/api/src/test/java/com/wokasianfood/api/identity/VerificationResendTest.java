package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.wokasianfood.api.identity.AuthDtos.ResetRequest;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class VerificationResendTest {
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
    void unknownOrAlreadyVerifiedAddressGetsNoChallenge() {
        String email = "unknown@example.test";
        when(jdbc.query(anyString(), anyRowMapper(), eq(email))).thenReturn(List.of());

        assertDoesNotThrow(() -> auth.resendVerification(new ResetRequest(email)));

        verify(jdbc, never()).queryForObject(anyString(), any(RowMapper.class), any());
        verify(jdbc, never()).update(startsWith("INSERT INTO wok.email_outbox"), any(Object[].class));
    }

    @Test
    void endpointAlwaysUsesNeutralAcceptedResponse() {
        AuthService service = mock(AuthService.class);
        AuthRateLimiter limiter = mock(AuthRateLimiter.class);
        AuthController controller = new AuthController(service, mock(CurrentUserService.class), limiter);

        var response = controller.resendVerification(new ResetRequest("person@example.test"), request());

        assertEquals(202, response.getStatusCode().value());
        assertTrue(response.getBody().message().contains("Si la cuenta está pendiente"));
        verify(service).resendVerification(new ResetRequest("person@example.test"));
    }

    private HttpServletRequest request() {
        HttpServletRequest http = mock(HttpServletRequest.class);
        when(http.getRemoteAddr()).thenReturn("203.0.113.5");
        return http;
    }

    @Test
    void cooldownDoesNotQueueAnotherMessage() throws Exception {
        UUID userId = UUID.randomUUID();
        stubPendingUser("pending@example.test", userId);
        stubResendWindow(userId, 1, Instant.now().minusSeconds(20));

        auth.resendVerification(new ResetRequest("pending@example.test"));

        verify(jdbc, never()).update(startsWith("INSERT INTO wok.email_outbox"), any(Object[].class));
    }

    @Test
    void hourlyLimitDoesNotQueueAnotherMessage() throws Exception {
        UUID userId = UUID.randomUUID();
        stubPendingUser("pending@example.test", userId);
        stubResendWindow(userId, 5, Instant.now().minusSeconds(120));

        auth.resendVerification(new ResetRequest("pending@example.test"));

        verify(jdbc, never()).update(startsWith("INSERT INTO wok.email_outbox"), any(Object[].class));
    }

    @Test
    void eligiblePendingUserReceivesAnotherChallengeThroughOutbox() throws Exception {
        UUID userId = UUID.randomUUID();
        stubPendingUser("pending@example.test", userId);
        stubResendWindow(userId, 1, Instant.now().minusSeconds(120));

        auth.resendVerification(new ResetRequest("pending@example.test"));

        verify(jdbc).update(startsWith("INSERT INTO wok.email_outbox"), any(Object[].class));
        verify(jdbc).update(contains("UPDATE wok.verification_challenges"), eq(userId), eq("ACCOUNT_VERIFICATION"));
    }

    private void stubPendingUser(String email, UUID userId) {
        when(jdbc.query(anyString(), anyRowMapper(), eq(email))).thenReturn(List.of(userId));
    }

    private void stubResendWindow(UUID userId, int sentCount, Instant latestSentAt) throws Exception {
        when(jdbc.queryForObject(anyString(), any(RowMapper.class), eq(userId))).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getInt("sent_count")).thenReturn(sentCount);
            when(rs.getTimestamp("latest_sent_at")).thenReturn(Timestamp.from(latestSentAt));
            return mapper.mapRow(rs, 0);
        });
    }

    @SuppressWarnings("unchecked")
    private RowMapper<java.util.UUID> anyRowMapper() { return (RowMapper<java.util.UUID>) any(RowMapper.class); }
}
