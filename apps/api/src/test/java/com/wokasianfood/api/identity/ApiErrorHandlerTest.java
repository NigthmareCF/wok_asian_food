package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

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
    void returnsNotFoundForUnknownRoutesInsteadOfInternalServerError() {
        var error = new NoResourceFoundException(HttpMethod.GET, "/", "api/v1/missing");
        var response = handler.resourceNotFound(error);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).containsEntry("message", "No encontramos el recurso solicitado.");
    }

    @Test
    void translatesOversizedUploadsToPayloadTooLarge() {
        var response = handler.uploadTooLarge(new MaxUploadSizeExceededException(8L * 1024 * 1024));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(response.getBody()).containsEntry("message", "El archivo supera el tamaño máximo permitido.");
    }

    @Test
    void logsButDoesNotReturnUnexpectedExceptionDetails() {
        var response = handler.unexpected(new IllegalStateException("database password leaked"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).containsEntry("message", "Ocurrió un error interno.");
        assertThat(response.getBody()).doesNotContainValue("database password leaked");
    }
}
