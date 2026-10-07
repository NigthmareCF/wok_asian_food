package com.wokasianfood.api.reservations;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/client/reservations")
public class ClientReservationController {
    private final ReservationRequestService requests;

    public ClientReservationController(ReservationRequestService requests) { this.requests = requests; }

    @GetMapping
    @PreAuthorize("hasRole('CLIENT')")
    public List<ReservationRequestService.HistoryItem> history(@AuthenticationPrincipal Jwt jwt) {
        return requests.history(UUID.fromString(jwt.getSubject()));
    }

    @PostMapping
    @PreAuthorize("hasRole('CLIENT')")
    public ResponseEntity<ReservationRequestService.Result> submit(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID requestId,
            @Valid @RequestBody Submission request) {
        var result = requests.submit(UUID.fromString(jwt.getSubject()), requestId,
                new ReservationRequestService.Request(request.guests(), request.requestedAt(), request.preorder(), request.notes(),
                        request.items() == null ? List.of() : request.items().stream()
                                .map(item -> new ReservationRequestService.RequestedItem(item.menuItemId(), item.quantity(), item.modifierIds()))
                                .toList()));
        return result.submitted() ? ResponseEntity.accepted().body(result) : ResponseEntity.ok(result);
    }

    @DeleteMapping("/{reservationId}")
    @PreAuthorize("hasRole('CLIENT')")
    public ReservationRequestService.CancellationResult cancel(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID reservationId) {
        return requests.cancelPending(UUID.fromString(jwt.getSubject()), reservationId);
    }

    public record Submission(@Min(1) @Max(50) int guests, @NotNull Instant requestedAt,
                             boolean preorder, @Size(max = 1000) String notes,
                             @Size(max = 100) List<@Valid RequestedItem> items) {}
    public record RequestedItem(@NotNull UUID menuItemId, @Min(1) int quantity,
                                @Size(max = 30) List<@NotNull UUID> modifierIds) {}
}
