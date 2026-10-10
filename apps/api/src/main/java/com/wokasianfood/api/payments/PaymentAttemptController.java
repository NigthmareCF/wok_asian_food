package com.wokasianfood.api.payments;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/operational")
@PreAuthorize("hasAuthority('payments:manage')")
public class PaymentAttemptController {
    private final PaymentAttemptService attempts;
    public PaymentAttemptController(PaymentAttemptService attempts) { this.attempts = attempts; }

    @GetMapping("/payment-attempts")
    public PaymentAttemptService.History history(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) UUID cursor) {
        return attempts.history(actor(jwt), null, cursor);
    }
    @GetMapping("/accounts/{accountId}/payment-attempts")
    public PaymentAttemptService.History accountHistory(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @RequestParam(required = false) UUID cursor) {
        return attempts.history(actor(jwt), accountId, cursor);
    }
    @GetMapping("/accounts/{accountId}/payment-attempts/context")
    public PaymentAttemptService.PreparationContext context(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId) {
        return attempts.context(actor(jwt), accountId);
    }
    @GetMapping("/accounts/{accountId}/payment-attempts/by-legacy-key/{key}")
    public PaymentAttemptService.Result legacyReference(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @PathVariable UUID key) {
        return attempts.legacyReference(actor(jwt), accountId, key);
    }
    @GetMapping("/accounts/{accountId}/payment-attempts/{attemptId}")
    public PaymentAttemptService.Result get(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @PathVariable UUID attemptId) {
        return attempts.get(actor(jwt), accountId, attemptId);
    }
    @PostMapping("/accounts/{accountId}/payment-attempts")
    public PaymentAttemptService.Result prepare(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @Valid @RequestBody PrepareRequest request) {
        return attempts.prepare(actor(jwt), accountId, request);
    }
    @PostMapping("/accounts/{accountId}/payment-attempts/{attemptId}/capture")
    public PaymentAttemptService.Result capture(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @PathVariable UUID attemptId,
            @Valid @RequestBody VersionRequest request) {
        return attempts.capture(actor(jwt), accountId, attemptId, request.expectedVersion());
    }
    @PostMapping("/accounts/{accountId}/payment-attempts/{attemptId}/retire")
    public PaymentAttemptService.Result retire(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @PathVariable UUID attemptId,
            @Valid @RequestBody RetireRequest request) {
        return attempts.retire(actor(jwt), accountId, attemptId, request);
    }
    @PostMapping("/accounts/{accountId}/payment-attempts/{attemptId}/replacement")
    public PaymentAttemptService.Result replacement(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId, @PathVariable UUID attemptId,
            @Valid @RequestBody ReplacementRequest request) {
        return attempts.replacement(actor(jwt), accountId, attemptId, request);
    }
    private UUID actor(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    public record PrepareRequest(@NotNull PaymentController.PaymentMethod method,
            @NotNull @DecimalMin("0.01") BigDecimal amount, @DecimalMin("0.00") BigDecimal tipAmount,
            @NotBlank @Size(max = 3) String currency, @Size(max = 120) String reference,
            @Size(max = 32) String registerCode, UUID expectedPreviousAttemptId) {
        PaymentController.PaymentRequest payment() {
            return new PaymentController.PaymentRequest(method, amount, tipAmount, reference, registerCode);
        }
    }
    public record VersionRequest(@NotNull @Positive Long expectedVersion) {}
    public record RetireRequest(@NotNull @Positive Long expectedVersion,
                               @NotBlank @Size(max = 500) String reason) {}
    public record ReplacementRequest(@NotNull @Positive Long expectedVersion,
            @NotBlank @Size(max = 500) String reason, @NotNull @Valid PrepareRequest payment) {}
}
