package com.wokasianfood.api.orders;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
public class ReservationSubstitutionController {
    private final ReservationSubstitutionService service;
    public ReservationSubstitutionController(ReservationSubstitutionService service){this.service=service;}
    @PostMapping("/api/v1/operational/reservations/{reservationId}/preorder-substitutions")
    @PreAuthorize("hasAuthority('orders:manage')")
    public OrderSubstitutionController.Receipt propose(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID reservationId,@RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody OrderSubstitutionController.Proposal request){return service.propose(UUID.fromString(jwt.getSubject()),reservationId,key,request);}
    @PostMapping("/api/v1/client/preorder-substitutions/{id}/decision")
    @PreAuthorize("hasRole('CLIENT')")
    public OrderSubstitutionController.Receipt consent(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody OrderSubstitutionController.Consent request){return service.consent(UUID.fromString(jwt.getSubject()),id,key,request);}
    @PostMapping("/api/v1/operational/preorder-substitutions/{id}/decision")
    @PreAuthorize("hasAuthority('orders:manage')")
    public OrderSubstitutionController.Receipt decide(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody OrderSubstitutionController.Decision request){return service.decide(UUID.fromString(jwt.getSubject()),id,key,request);}
}
