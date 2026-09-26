package com.wokasianfood.api.reservations;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/client/reservations")
public class ClientReservationController {
    private final ReservationRequestService requests;

    public ClientReservationController(ReservationRequestService requests) { this.requests = requests; }

    @PostMapping
    @PreAuthorize("hasRole('CLIENT')")
    public ResponseEntity<ReservationRequestService.Result> submit(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID requestId,
            @Valid @RequestBody Submission request) {
        var result = requests.submit(UUID.fromString(jwt.getSubject()), requestId,
                new ReservationRequestService.Request(request.guests(), request.requestedAt(), request.preorder(), request.notes()));
        return result.submitted() ? ResponseEntity.accepted().body(result) : ResponseEntity.ok(result);
    }

    public record Submission(@Min(1) @Max(50) int guests, @NotNull Instant requestedAt,
                             boolean preorder, @Size(max = 1000) String notes) {}
}
