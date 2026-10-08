package com.wokasianfood.api.identity;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class AuthRateLimitHttpTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AuthService auth = mock(AuthService.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new AuthController(auth, mock(CurrentUserService.class),
                        new AuthRateLimiter(jdbc), new ClientIpResolver("203.0.113.5,::1")))
                .setControllerAdvice(new ApiErrorHandler()).build();
    }

    static Stream<Arguments> addresses() {
        return Stream.of(
                Arguments.of("invalid", "203.0.113.5", "203.0.113.5"),
                Arguments.of("invalid, 198.51.100.1", "203.0.113.5", "203.0.113.5"),
                Arguments.of(",", "203.0.113.5", "203.0.113.5"),
                Arguments.of("localhost", "::1", "0:0:0:0:0:0:0:1"),
                Arguments.of("203.0.113.7", "invalid", null),
                Arguments.of("::ffff:203.0.113.7", "203.0.113.5", "203.0.113.7"),
                Arguments.of("203.0.113.7", "203.0.113.5", "203.0.113.7"),
                Arguments.of("2001:db8::7", "::1", "2001:db8:0:0:0:0:0:7"),
                Arguments.of("203.0.113.7", "198.51.100.1", "198.51.100.1"),
                Arguments.of("203.0.113.7, invalid", "203.0.113.5", "203.0.113.5"),
                Arguments.of("invalid", "invalid", null),
                Arguments.of(null, "invalid", null),
                Arguments.of(" ", null, null));
    }

    @ParameterizedTest
    @MethodSource("addresses")
    void recordsIpAndEmailCountersBelowTheLimit(String forwarded, String remote, String expected) throws Exception {
        counts(0, 0);
        mvc.perform(request(forwarded, remote)).andExpect(status().isAccepted());
        verifyCounters(expected);
        verify(auth).resendVerification(any());
        verify(jdbc, never()).update(contains("AUTH_RATE_LIMITED"), any(), any());
    }

    @ParameterizedTest
    @MethodSource("addresses")
    void exceededIpLimitReturns429WithOnlyValidInetOrNull(String forwarded, String remote, String expected)
            throws Exception {
        counts(11, 0);
        assertLimited(forwarded, remote, expected);
    }

    @ParameterizedTest
    @MethodSource("addresses")
    void exceededEmailLimitStillReturns429(String forwarded, String remote, String expected) throws Exception {
        counts(0, 6);
        assertLimited(forwarded, remote, expected);
    }

    private void counts(int ipCount, int emailCount) {
        when(jdbc.queryForObject(contains("auth_rate_limit_events"), eq(Integer.class), anyString(),
                anyString(), anyString(), any(Long.class))).thenReturn(ipCount, emailCount);
    }

    private void assertLimited(String forwarded, String remote, String expected) throws Exception {
        mvc.perform(request(forwarded, remote))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().string("{\"message\":\"Demasiados intentos. Intenta más tarde.\"}"));
        verifyCounters(expected);
        verify(jdbc).update(contains("?::inet"), eq(expected), eq("RESEND"));
        verifyNoInteractions(auth);
    }

    private void verifyCounters(String expected) {
        verify(jdbc).update(contains("INSERT INTO wok.auth_rate_limit_events"), eq("RESEND"), eq("IP"),
                eq(expected == null ? "UNKNOWN" : expected));
        verify(jdbc).update(contains("INSERT INTO wok.auth_rate_limit_events"), eq("RESEND"), eq("IDENTIFIER"),
                eq("client@example.test"));
    }

    private MockHttpServletRequestBuilder request(String forwarded, String remote) {
        var request = post("/api/v1/auth/verify/resend").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"Client@example.test\"}")
                .with(http -> { http.setRemoteAddr(remote); return http; });
        if (forwarded != null) request.header("X-Forwarded-For", forwarded);
        return request;
    }
}
