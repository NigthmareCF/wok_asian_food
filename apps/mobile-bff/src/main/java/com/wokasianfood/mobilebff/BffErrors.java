package com.wokasianfood.mobilebff;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
final class BffErrors {
    @ExceptionHandler(BffFailure.class)
    ResponseEntity<Map<String, String>> rejected(BffFailure failure, HttpServletRequest request) {
        return ResponseEntity.status(failure.status).header("Cache-Control", "no-store")
                .body(failure.body((String) request.getAttribute("bff.requestId")));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unavailable(HttpServletRequest request) {
        return rejected(new BffFailure(503), request);
    }
}
