package com.wokasianfood.api.identity;

import com.wokasianfood.api.identity.AuthDtos.*;
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
    public AuthController(AuthService auth) { this.auth = auth; }

    @PostMapping("/register")
    public ResponseEntity<Message> register(@Valid @RequestBody Register request) {
        auth.register(request);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new Message("Si la cuenta puede registrarse, recibirás un código de verificación."));
    }

    @PostMapping("/verify")
    public Message verify(@Valid @RequestBody Verify request) {
        auth.verify(request); return new Message("Cuenta verificada.");
    }

    @PostMapping("/login")
    public TokenPair login(@Valid @RequestBody Login request) { return auth.login(request); }

    @PostMapping("/refresh")
    public TokenPair refresh(@Valid @RequestBody Refresh request) { return auth.refresh(request); }

    @PostMapping("/google")
    public TokenPair google(@Valid @RequestBody GoogleLogin request) { return auth.google(request); }

    @PostMapping("/reset/request")
    public ResponseEntity<Message> requestReset(@Valid @RequestBody ResetRequest request) {
        auth.requestReset(request);
        return ResponseEntity.accepted().body(new Message("Si la cuenta existe, recibirás un código de recuperación."));
    }

    @PostMapping("/reset/complete")
    public Message completeReset(@Valid @RequestBody ResetComplete request) {
        auth.completeReset(request);
        return new Message("Contraseña actualizada. Inicia sesión de nuevo.");
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@org.springframework.security.core.annotation.AuthenticationPrincipal Jwt jwt) {
        auth.logout(UUID.fromString(jwt.getClaimAsString("sid")), UUID.fromString(jwt.getSubject()));
        return ResponseEntity.noContent().build();
    }
}
