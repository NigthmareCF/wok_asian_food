package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.MethodArgumentNotValidException;

class AuthRequestHttpTest {
    private final AuthService auth = mock(AuthService.class);
    private final CurrentUserService currentUser = mock(CurrentUserService.class);
    private final AuthRateLimiter rateLimiter = mock(AuthRateLimiter.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new AuthController(auth, currentUser, rateLimiter, new ClientIpResolver("")))
                .setControllerAdvice(new ApiErrorHandler())
                .build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"register", "verify", "verify/resend", "login", "refresh",
            "reset/request", "reset/complete", "google"})
    void rejectsMalformedJsonWithoutExposingParserDetails(String route) throws Exception {
        mvc.perform(post("/api/v1/auth/" + route)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sensitiveInput\": \"private-value\","))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().string("{\"message\":\"Revisa los datos enviados.\"}"))
                .andExpect(result -> assertInstanceOf(HttpMessageNotReadableException.class,
                        result.getResolvedException()));

        verifyNoInteractions(auth, currentUser, rateLimiter);
    }

    @ParameterizedTest
    @ValueSource(strings = {"register", "verify", "verify/resend", "login", "refresh",
            "reset/request", "reset/complete", "google"})
    void rejectsMissingBodyWithoutExposingControllerDetails(String route) throws Exception {
        mvc.perform(post("/api/v1/auth/" + route).contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().string("{\"message\":\"Revisa los datos enviados.\"}"))
                .andExpect(result -> assertInstanceOf(HttpMessageNotReadableException.class,
                        result.getResolvedException()));

        verifyNoInteractions(auth, currentUser, rateLimiter);
    }

    @Test
    void rejectsUnsupportedClientTypeThroughBeanValidation() throws Exception {
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"client@example.test","password":"PrivatePassword!2026","clientType":"TABLET"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().string("{\"message\":\"Revisa los datos enviados.\"}"))
                .andExpect(result -> assertInstanceOf(MethodArgumentNotValidException.class,
                        result.getResolvedException()));

        verifyNoInteractions(auth, currentUser, rateLimiter);
    }
}
