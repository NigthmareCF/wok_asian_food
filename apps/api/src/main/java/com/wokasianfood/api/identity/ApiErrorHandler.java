package com.wokasianfood.api.identity;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiErrorHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ApiErrorHandler.class);

    @ExceptionHandler(AuthException.class)
    ResponseEntity<Map<String, String>> auth(AuthException error) {
        return ResponseEntity.status(error.status()).body(Map.of("message", error.getMessage()));
    }

    @ExceptionHandler(AuthorizationDeniedException.class)
    ResponseEntity<Map<String, String>> authorizationDenied(AuthorizationDeniedException error) {
        return ResponseEntity.status(403).body(Map.of("message", "Acceso denegado."));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> validation() {
        return ResponseEntity.badRequest().body(Map.of("message", "Revisa los datos enviados."));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> status(ResponseStatusException error) {
        String message = error.getReason();
        if (message == null || message.isBlank()) message = "No se pudo procesar la solicitud.";
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", message));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception error) {
        LOG.error("Unexpected API failure", error);
        return ResponseEntity.internalServerError().body(Map.of("message", "Ocurrió un error interno."));
    }
}
