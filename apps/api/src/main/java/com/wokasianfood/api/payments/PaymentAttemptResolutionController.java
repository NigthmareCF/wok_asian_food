package com.wokasianfood.api.payments;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/** Exceptional review is separate from the owner's normal capture/consultation routes. */
@RestController
@RequestMapping("/api/v1/operational")
@PreAuthorize("hasAuthority('payments:manage') and hasAuthority('payments:resolve')")
public class PaymentAttemptResolutionController {
    private final PaymentAttemptResolutionService resolutions;
    public PaymentAttemptResolutionController(PaymentAttemptResolutionService resolutions) {
        this.resolutions = resolutions;
    }
    @GetMapping("/payment-attempt-resolutions")
    public PaymentAttemptResolutionService.Queue queue(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) UUID accountId, @RequestParam(required = false) String cursor) {
        UUID boundary = null;
        if (cursor != null) {
            try {
                if (!cursor.startsWith("resolution:")) throw new IllegalArgumentException();
                boundary = UUID.fromString(cursor.substring("resolution:".length()));
            } catch (IllegalArgumentException invalid) { throw new AuthException(400, "Cursor de revisión inválido."); }
        }
        return resolutions.queue(accountId, boundary);
    }
    @GetMapping("/accounts/{accountId}/payment-attempts/{attemptId}/resolution")
    public PaymentAttemptResolutionService.Review review(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @PathVariable UUID attemptId) {
        return resolutions.review(UUID.fromString(jwt.getSubject()), accountId, attemptId);
    }
    @PostMapping("/accounts/{accountId}/payment-attempts/{attemptId}/resolution")
    public PaymentAttemptResolutionService.Review resolve(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @PathVariable UUID attemptId,
            @RequestHeader("X-Request-Id") UUID requestId, @Valid @RequestBody ResolutionRequest request) {
        return resolutions.resolve(UUID.fromString(jwt.getSubject()), accountId, attemptId, requestId, request);
    }
    @ExceptionHandler(PaymentAttemptResolutionService.ResolutionFailure.class)
    ResponseEntity<Map<String,String>> failure(PaymentAttemptResolutionService.ResolutionFailure failure) {
        return ResponseEntity.status(failure.status()).body(Map.of("code",failure.code(),"message",failure.getMessage()));
    }
    public record ResolutionRequest(@NotNull @Positive Long expectedVersion,
            @NotBlank @Size(max = 500) String reason, @NotBlank @Size(max = 1000) String evidenceSummary,
            @Size(max = 200) String evidenceReference, @NotBlank String physicalReceiptStatus) {}
}
