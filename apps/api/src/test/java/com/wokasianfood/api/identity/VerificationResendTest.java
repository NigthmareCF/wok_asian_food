package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.wokasianfood.api.identity.AuthDtos.ResetRequest;
import java.util.Base64;
import java.util.List;
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
        AuthController controller = new AuthController(service);

        var response = controller.resendVerification(new ResetRequest("person@example.test"));

        assertEquals(202, response.getStatusCode().value());
        assertTrue(response.getBody().message().contains("Si la cuenta está pendiente"));
        verify(service).resendVerification(new ResetRequest("person@example.test"));
    }

    @SuppressWarnings("unchecked")
    private RowMapper<java.util.UUID> anyRowMapper() { return (RowMapper<java.util.UUID>) any(RowMapper.class); }
}
