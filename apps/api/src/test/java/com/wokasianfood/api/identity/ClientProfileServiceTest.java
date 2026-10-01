package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.wokasianfood.api.identity.ClientProfileService.ProfileRow;
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
class ClientProfileServiceTest {
    @Mock private JdbcTemplate jdbc;
    private ClientProfileService profiles;

    @BeforeEach
    void setUp() { profiles = new ClientProfileService(jdbc); }

    @Test
    void rejectsAStaleProfileVersionBeforeWriting() {
        UUID userId = UUID.randomUUID();
        UUID profileId = UUID.randomUUID();
        when(jdbc.query(anyString(), anyRowMapper(), eq(userId)))
                .thenReturn(List.of(new ProfileRow("client@example.test", "Nombre anterior", null, 4, profileId)));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> profiles.update(userId, new ClientProfileController.UpdateProfile("Nombre nuevo", "", 3)));

        assertEquals(409, error.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void updatesBothProfileRepresentationsAndAuditsWithoutStoringThePhoneValue() {
        UUID userId = UUID.randomUUID();
        UUID profileId = UUID.randomUUID();
        when(jdbc.query(anyString(), anyRowMapper(), eq(userId)))
                .thenReturn(List.of(new ProfileRow("client@example.test", "Nombre anterior", null, 4, profileId)));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        ClientProfileController.ClientProfile result = profiles.update(userId,
                new ClientProfileController.UpdateProfile("  Nombre nuevo ", "  +502 5555-0101 ", 4));

        assertEquals("Nombre nuevo", result.displayName());
        assertEquals("+502 5555-0101", result.phone());
        assertEquals(5, result.version());
        verify(jdbc, times(3)).update(anyString(), any(Object[].class));
        verify(jdbc).update(startsWith("INSERT INTO wok.audit_logs"), any(Object[].class));
    }

    @SuppressWarnings("unchecked")
    private RowMapper<ProfileRow> anyRowMapper() { return (RowMapper<ProfileRow>) any(RowMapper.class); }
}
