package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.server.ResponseStatusException;

class ApiErrorHandlerTest {
    private final ApiErrorHandler handler = new ApiErrorHandler();

    @Test
    void translatesApplicationStatusErrorsToTheClientMessageContract() {
        var response = handler.status(new ResponseStatusException(HttpStatus.CONFLICT, "Actualiza e inténtalo de nuevo."));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).containsEntry("message", "Actualiza e inténtalo de nuevo.");
    }

    @Test
    void returnsForbiddenWithoutLeakingAuthorizationDetails() {
        var response = handler.authorizationDenied(new AuthorizationDeniedException("private permission detail"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody()).containsEntry("message", "Acceso denegado.");
    }

    @Test
    void logsButDoesNotReturnUnexpectedExceptionDetails() {
        var response = handler.unexpected(new IllegalStateException("database password leaked"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).containsEntry("message", "Ocurrió un error interno.");
        assertThat(response.getBody()).doesNotContainValue("database password leaked");
    }
}
