package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.wokasianfood.api.identity.AuthDtos.Login;
import com.wokasianfood.api.identity.AuthDtos.TokenPair;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class AuthHardeningTest {

    @Mock JdbcTemplate jdbc;

    @Test
    void rejectsReservedPlaceholderIssuer() {
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> new AuthIssuer("https://identity.wok.invalid"));

        assertTrue(error.getMessage().contains("WOK_AUTH_ISSUER"));
        assertTrue(error.getMessage().contains("reserved"));
    }

    @Test
    void rejectsBlankIssuer() {
        assertThrows(IllegalStateException.class, () -> new AuthIssuer("   "));
    }

    @Test
    void acceptsCanonicalIssuer() {
        assertEquals("https://identity.wok.com", new AuthIssuer("https://identity.wok.com").value());
    }

    @Test
    void allowsAttemptsUpToTheIdentifierLimitAndBlocksTheNextOne() {
        when(jdbc.queryForObject(contains("auth_rate_limit_events"), eq(Integer.class), anyString(), anyString(),
                anyString(), any(Long.class))).thenReturn(3, 0);

        var limiter = new AuthRateLimiter(jdbc);
        limiter.check(AuthRateLimiter.Action.REGISTER, "nuevo@wok.demo", "203.0.113.9");

        verify(jdbc, never()).update(contains("AUTH_RATE_LIMITED"), any(Object[].class));
    }

    @Test
    void blocksWhenIpExhaustsItsWindowAndWritesSecurityEvent() {
        when(jdbc.queryForObject(contains("auth_rate_limit_events"), eq(Integer.class), anyString(), anyString(),
                anyString(), any(Long.class))).thenReturn(11);

        AuthException error = assertThrows(AuthException.class, () -> new AuthRateLimiter(jdbc)
                .check(AuthRateLimiter.Action.VERIFY, "nuevo@wok.demo", "203.0.113.9"));

        assertEquals(429, error.status());
        verify(jdbc).update(contains("AUTH_RATE_LIMITED"), eq("203.0.113.9"), eq("VERIFY"));
    }

    @Test
    void rejectsUnresolvedForwardedChainAndNormalizesIdentifierCase() {
        when(jdbc.queryForObject(contains("auth_rate_limit_events"), eq(Integer.class), anyString(), anyString(),
                anyString(), any(Long.class))).thenReturn(0);

        new AuthRateLimiter(jdbc).check(AuthRateLimiter.Action.RESET_REQUEST, "  Cliente@Wok.Demo ",
                "203.0.113.7, 70.41.3.18");

        verify(jdbc).update(contains("INSERT INTO wok.auth_rate_limit_events"), eq("RESET_REQUEST"), eq("IP"),
                eq("UNKNOWN"));
        verify(jdbc).update(contains("INSERT INTO wok.auth_rate_limit_events"), eq("RESET_REQUEST"),
                eq("IDENTIFIER"), eq("cliente@wok.demo"));
    }

    @Test
    void appliesIpRateLimitBeforeAttemptingLogin() {
        AuthService service = org.mockito.Mockito.mock(AuthService.class);
        AuthRateLimiter limiter = org.mockito.Mockito.mock(AuthRateLimiter.class);
        AuthController controller = new AuthController(service, org.mockito.Mockito.mock(CurrentUserService.class), limiter,
                new ClientIpResolver(""));
        Login request = new Login("cliente@wok.demo", "ContraseñaSegura!2026", "WEB");
        HttpServletRequest http = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(http.getRemoteAddr()).thenReturn("203.0.113.5");
        when(service.login(request)).thenReturn(new TokenPair("access", "refresh", "Bearer", 900));

        controller.login(request, http);

        verify(limiter).check(AuthRateLimiter.Action.LOGIN, "cliente@wok.demo", "203.0.113.5");
        verify(service).login(request);
    }
}
