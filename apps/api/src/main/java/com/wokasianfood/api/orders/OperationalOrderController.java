package com.wokasianfood.api.orders;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Operational APIs. Bootstrap security still denies them until the JWT module is integrated. */
@RestController
@RequestMapping("/api/v1/operational")
@PreAuthorize("hasAnyRole('OPERATIONAL', 'ADMIN')")
public class OperationalOrderController {
    private final OperationalOrderService service;

    public OperationalOrderController(OperationalOrderService service) {
        this.service = service;
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    public OperationalOrderService.OrderReceipt createOrder(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateOrderRequest request) {
        return service.create(actorId(jwt), new OperationalOrderService.CreateOrder(request.diningSessionId(), request.billId(), request.tableId(),
            request.orderType(), request.comments(), request.lines().stream()
                .map(line -> new OperationalOrderService.CreateLine(line.menuItemId(), line.quantity(), line.notes())).toList()));
    }

    @PostMapping("/orders/{orderId}/submit")
    public OperationalOrderService.OrderReceipt submitOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID orderId) {
        return service.submit(actorId(jwt), orderId);
    }

    @GetMapping("/kitchen/tickets")
    public List<OperationalOrderService.KitchenTicket> kitchenQueue() {
        return service.kitchenQueue();
    }

    @PatchMapping("/kitchen/tickets/{ticketId}")
    public OperationalOrderService.KitchenTicket changeTicket(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID ticketId,
            @Valid @RequestBody TicketStatusRequest request) {
        return service.changeTicketStatus(actorId(jwt), ticketId, request.status());
    }

    @PostMapping("/bills")
    @ResponseStatus(HttpStatus.CREATED)
    public OperationalOrderService.BillReceipt openBill(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody OpenBillRequest request) {
        return service.openBill(actorId(jwt), new OperationalOrderService.OpenBill(request.diningSessionId(), request.name()));
    }

    private UUID actorId(Jwt jwt) {
        if (jwt == null) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED, "Se requiere sesión.");
        return UUID.fromString(jwt.getSubject());
    }

    public record CreateOrderRequest(@NotNull UUID diningSessionId, UUID billId, UUID tableId,
            @NotBlank @Pattern(regexp = "DINE_IN|PICKUP|DELIVERY") String orderType, @Size(max = 500) String comments,
            @NotEmpty @Size(max = 50) List<@Valid CreateOrderLineRequest> lines) {}
    public record CreateOrderLineRequest(@NotNull UUID menuItemId, @Positive int quantity, @Size(max = 500) String notes) {}
    public record TicketStatusRequest(@NotBlank @Pattern(regexp = "IN_PROGRESS|READY") String status) {}
    public record OpenBillRequest(@NotNull UUID diningSessionId, @Size(max = 120) String name) {}
}
