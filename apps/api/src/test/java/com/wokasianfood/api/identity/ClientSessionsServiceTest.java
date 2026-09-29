package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class ClientSessionsServiceTest {
    @Mock private JdbcTemplate jdbc;
    private ClientSessionsService sessions;

    @BeforeEach
    void setUp() { sessions = new ClientSessionsService(jdbc); }

    @Test
    void listsOnlyActiveSessionsForTheAuthenticatedUserAndMarksTheCurrentSession() {
        UUID userId = UUID.randomUUID();
        UUID currentSessionId = UUID.randomUUID();
        when(jdbc.query(anyString(), anyRowMapper(), eq(userId), eq(currentSessionId))).thenReturn(List.of());

        assertTrue(sessions.list(userId, currentSessionId).isEmpty());

        verify(jdbc).query(contains("WHERE user_id = ? AND revoked_at IS NULL AND expires_at > now()"),
                anyRowMapper(), eq(userId), eq(currentSessionId));
        verify(jdbc).query(contains("LIMIT 20"), anyRowMapper(), eq(userId), eq(currentSessionId));
    }

    @Test
    void doesNotRevokeAnotherUsersSessionOrWriteAnAuditEvent() {
        UUID userId = UUID.randomUUID();
        UUID otherSessionId = UUID.randomUUID();
        when(jdbc.update(contains("UPDATE wok.auth_sessions"), any(Object[].class))).thenReturn(0);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> sessions.revoke(userId, otherSessionId));

        assertEquals(404, error.getStatusCode().value());
        verify(jdbc, never()).update(contains("INSERT INTO wok.security_events"), any(Object[].class));
    }

    @Test
    void revokesSessionRefreshTokensAndWritesSecurityEvent() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        when(jdbc.update(contains("UPDATE wok.auth_sessions"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("UPDATE wok.refresh_tokens"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("INSERT INTO wok.security_events"), any(Object[].class))).thenReturn(1);

        assertDoesNotThrow(() -> sessions.revoke(userId, sessionId));

        verify(jdbc).update(contains("UPDATE wok.auth_sessions"), eq(userId), eq(sessionId), eq(userId));
        verify(jdbc).update(contains("UPDATE wok.refresh_tokens"), eq(sessionId));
        verify(jdbc).update(contains("CLIENT_SESSION_REVOKED"), eq(userId), eq(sessionId), eq(sessionId));
    }

    @SuppressWarnings("unchecked")
    private RowMapper<ClientSessionsController.ClientSession> anyRowMapper() {
        return (RowMapper<ClientSessionsController.ClientSession>) any(RowMapper.class);
    }
}
