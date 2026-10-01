package com.wokasianfood.api.identity;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiErrorHandler {
    @ExceptionHandler(AuthException.class)
    ResponseEntity<Map<String, String>> auth(AuthException error) {
        return ResponseEntity.status(error.status()).body(Map.of("message", error.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> validation() {
        return ResponseEntity.badRequest().body(Map.of("message", "Revisa los datos enviados."));
    }
}
