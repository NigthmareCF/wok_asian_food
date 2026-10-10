package com.wokasianfood.api.identity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/client/phone-verification")
@PreAuthorize("hasRole('CLIENT')")
public class PhoneVerificationController {
    private final PhoneVerificationService service;
    public PhoneVerificationController(PhoneVerificationService service) { this.service=service; }
    @GetMapping public PhoneVerificationService.Status status(@AuthenticationPrincipal Jwt jwt) {
        return service.status(UUID.fromString(jwt.getSubject()));
    }
    @PostMapping public PhoneVerificationService.Challenge start(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody Start request) {
        return service.start(UUID.fromString(jwt.getSubject()),request.phone());
    }
    @PostMapping("/confirm") public PhoneVerificationService.Status confirm(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody Confirm request) {
        return service.confirm(UUID.fromString(jwt.getSubject()),request.challengeId(),request.code());
    }
    public record Start(@NotBlank @jakarta.validation.constraints.Size(max=25) String phone) {}
    public record Confirm(@NotNull UUID challengeId,@NotBlank @Pattern(regexp="[0-9]{6}") String code) {}
}
