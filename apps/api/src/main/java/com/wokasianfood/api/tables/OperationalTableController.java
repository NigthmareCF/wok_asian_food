package com.wokasianfood.api.tables;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.Instant;
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

/** Table and session APIs. Authentication is enforced once the shared JWT configuration is integrated. */
@RestController
@RequestMapping("/api/v1/operational/tables")
@PreAuthorize("hasAnyRole('OPERATIONAL', 'ADMIN')")
public class OperationalTableController {
    private final OperationalTableService service;

    public OperationalTableController(OperationalTableService service) {
        this.service = service;
    }

    @GetMapping
    public List<OperationalTableService.TableSummary> list() { return service.list(); }

    @PostMapping("/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    public OperationalTableService.SessionReceipt open(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody OpenSessionRequest request) {
        return service.open(actorId(jwt), new OperationalTableService.OpenSession(request.tableIds(), request.partySize(), request.estimatedEndAt()));
    }

    @PostMapping("/sessions/{sessionId}/tables")
    public OperationalTableService.SessionReceipt join(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID sessionId,
            @Valid @RequestBody TableSelectionRequest request) {
        return service.joinTables(actorId(jwt), sessionId, request.tableIds());
    }

    @PostMapping("/sessions/{sessionId}/tables/release")
    public OperationalTableService.SessionReceipt release(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID sessionId,
            @Valid @RequestBody TableSelectionRequest request) {
        return service.releaseTables(actorId(jwt), sessionId, request.tableIds());
    }

    @PostMapping("/sessions/{sessionId}/close")
    public OperationalTableService.SessionReceipt close(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID sessionId) {
        return service.close(actorId(jwt), sessionId);
    }

    @PatchMapping("/{tableId}/status")
    public OperationalTableService.TableSummary changeStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID tableId,
            @Valid @RequestBody ChangeStatusRequest request) {
        return service.changeStatus(actorId(jwt), tableId, new OperationalTableService.ChangeTableStatus(request.status(), request.reason()));
    }

    private UUID actorId(Jwt jwt) {
        if (jwt == null) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED, "Se requiere sesión.");
        return UUID.fromString(jwt.getSubject());
    }

    public record OpenSessionRequest(@NotEmpty @Size(max = 12) List<@NotNull UUID> tableIds, @Positive int partySize,
                                     Instant estimatedEndAt) {}
    public record TableSelectionRequest(@NotEmpty @Size(max = 11) List<@NotNull UUID> tableIds) {}
    public record ChangeStatusRequest(@NotBlank @Pattern(regexp = "FREE|CLEANING|UNAVAILABLE") String status,
                                      @Size(max = 300) String reason) {}
}
