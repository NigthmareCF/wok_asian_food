package com.wokasianfood.api.identity;

import com.wokasianfood.api.identity.AuthDtos.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;
    private final CurrentUserService currentUser;
    private final AuthRateLimiter rateLimiter;
    public AuthController(AuthService auth, CurrentUserService currentUser, AuthRateLimiter rateLimiter) {
        this.auth = auth; this.currentUser = currentUser; this.rateLimiter = rateLimiter;
    }

    @PostMapping("/register")
    public ResponseEntity<Message> register(@Valid @RequestBody Register request, HttpServletRequest http) {
        rateLimiter.check(AuthRateLimiter.Action.REGISTER, request.email(), clientIp(http));
        auth.register(request);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new Message("Si la cuenta puede registrarse, recibirás un código de verificación."));
    }

    @PostMapping("/verify")
    public Message verify(@Valid @RequestBody Verify request, HttpServletRequest http) {
        rateLimiter.check(AuthRateLimiter.Action.VERIFY, request.email(), clientIp(http));
        auth.verify(request); return new Message("Cuenta verificada.");
    }

    @PostMapping("/verify/resend")
    public ResponseEntity<Message> resendVerification(@Valid @RequestBody ResetRequest request, HttpServletRequest http) {
        rateLimiter.check(AuthRateLimiter.Action.RESEND, request.email(), clientIp(http));
        auth.resendVerification(request);
        return ResponseEntity.accepted().body(new Message("Si la cuenta está pendiente de verificación, recibirás un código cuando pueda enviarse."));
    }

    @PostMapping("/login")
    public TokenPair login(@Valid @RequestBody Login request) { return auth.login(request); }

    @PostMapping("/refresh")
    public TokenPair refresh(@Valid @RequestBody Refresh request) { return auth.refresh(request); }

    @PostMapping("/google")
    public TokenPair google(@Valid @RequestBody GoogleLogin request) { return auth.google(request); }

    @PostMapping("/reset/request")
    public ResponseEntity<Message> requestReset(@Valid @RequestBody ResetRequest request, HttpServletRequest http) {
        rateLimiter.check(AuthRateLimiter.Action.RESET_REQUEST, request.email(), clientIp(http));
        auth.requestReset(request);
        return ResponseEntity.accepted().body(new Message("Si la cuenta existe, recibirás un código de recuperación."));
    }

    @PostMapping("/reset/complete")
    public Message completeReset(@Valid @RequestBody ResetComplete request, HttpServletRequest http) {
        rateLimiter.check(AuthRateLimiter.Action.RESET_COMPLETE, request.email(), clientIp(http));
        auth.completeReset(request);
        return new Message("Contraseña actualizada. Inicia sesión de nuevo.");
    }

    @GetMapping("/me")
    public CurrentUser me(@org.springframework.security.core.annotation.AuthenticationPrincipal Jwt jwt) {
        return currentUser.load(UUID.fromString(jwt.getSubject()));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@org.springframework.security.core.annotation.AuthenticationPrincipal Jwt jwt) {
        auth.logout(UUID.fromString(jwt.getClaimAsString("sid")), UUID.fromString(jwt.getSubject()));
        return ResponseEntity.noContent().build();
    }

    private String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return http.getRemoteAddr();
    }
}
