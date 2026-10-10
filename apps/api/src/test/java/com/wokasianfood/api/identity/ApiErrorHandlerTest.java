package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import java.util.Set;

class ApiErrorHandlerTest {
    private final ApiErrorHandler handler = new ApiErrorHandler();

    @Test
    void keepsTheExpectedStatusForBusinessErrors() {
        var response = handler.status(new ResponseStatusException(HttpStatus.CONFLICT, "El estado cambió."));

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals("El estado cambió.", response.getBody().get("message"));
    }

    @Test
    void mapsAuthorizationDenialsToForbidden() {
        var response = handler.authorizationDenied(new AuthorizationDeniedException("Access Denied"));

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertEquals("Acceso denegado.", response.getBody().get("message"));
    }

    @Test
    void mapsUnsupportedMethodsToMethodNotAllowedInsteadOfInternalError() {
        var response = handler.methodNotAllowed(
                new HttpRequestMethodNotSupportedException("POST", Set.of("PATCH")));

        assertEquals(HttpStatus.METHOD_NOT_ALLOWED, response.getStatusCode());
        assertEquals("PATCH", response.getHeaders().getFirst("Allow"));
    }

    @Test
    void doesNotExposeUnexpectedExceptionDetails() {
        var response = handler.unexpected(new IllegalStateException("sensitive database detail"));

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertEquals("Ocurrió un error interno.", response.getBody().get("message"));
    }
}
