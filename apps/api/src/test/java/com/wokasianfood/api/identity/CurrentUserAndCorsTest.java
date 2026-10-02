package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class CurrentUserAndCorsTest {
    @Mock private JdbcTemplate jdbc;
    private CurrentUserService currentUser;

    @BeforeEach
    void setUp() { currentUser = new CurrentUserService(jdbc); }

    @Test
    void exposesActiveIdentityWithRolesAndEffectivePermissions() {
        UUID userId = UUID.randomUUID();
        when(jdbc.query(anyString(), any(RowMapper.class), eq(userId)))
                .thenReturn(List.of(row(userId)));
        when(jdbc.queryForList(anyString(), eq(String.class), eq(userId)))
                .thenReturn(List.of("ADMIN"));

        var result = currentUser.load(userId);

        assertEquals(userId, result.userId());
        assertEquals("admin@wok.demo", result.email());
        assertEquals("ACTIVE", result.status());
        assertEquals(List.of("ADMIN"), result.roles());
    }

    @Test
    void rejectsAnIdentityThatIsNoLongerActive() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(UUID.class))).thenReturn(List.of());

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> currentUser.load(UUID.randomUUID()));

        assertEquals(401, error.getStatusCode().value());
        verify(jdbc, never()).queryForList(anyString(), eq(String.class), any(UUID.class));
    }

    @Test
    void restrictsCrossOriginRequestsToTheConfiguredDevelopmentOrigin() throws Exception {
        CorsConfigurationSource source = corsSource("http://localhost:3000");
        CorsConfiguration configuration = ((UrlBasedCorsConfigurationSource) source)
                .getCorsConfiguration(new org.springframework.mock.web.MockHttpServletRequest("OPTIONS", "/api/v1/auth/login"));

        assertNotNull(configuration);
        assertEquals(List.of("http://localhost:3000"), configuration.getAllowedOrigins());
        assertTrue(configuration.getAllowedMethods().contains("POST"));
        assertTrue(configuration.getAllowedHeaders().contains("Authorization"));
        assertTrue(configuration.getAllowedHeaders().contains("Idempotency-Key"));
    }

    @Test
    void supportsSeveralExplicitOriginsWhenTheyAreConfigured() throws Exception {
        CorsConfigurationSource source = corsSource("http://localhost:3000, https://admin.wok.test");
        CorsConfiguration configuration = ((UrlBasedCorsConfigurationSource) source)
                .getCorsConfiguration(new org.springframework.mock.web.MockHttpServletRequest("OPTIONS", "/api/v1/orders"));

        assertNotNull(configuration);
        assertEquals(List.of("http://localhost:3000", "https://admin.wok.test"),
                configuration.getAllowedOrigins());
    }

    private CorsConfigurationSource corsSource(String origins) {
        return new SecurityConfig().corsConfigurationSource(origins);
    }

    private CurrentUserService.CurrentUserRow row(UUID userId) {
        return new CurrentUserService.CurrentUserRow(userId, "admin@wok.demo", "Admin Demo", "ACTIVE");
    }
}
