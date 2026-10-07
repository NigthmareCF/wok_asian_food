package com.wokasianfood.api.reservations;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Preliminary policy evaluation only. It does not allocate a table or confirm a reservation. */
@RestController
@RequestMapping("/api/v1/public/reservations")
public class ReservationEvaluationController {
    private final ReservationRequestService requests;
    public ReservationEvaluationController(ReservationRequestService requests) { this.requests = requests; }

    @PostMapping("/evaluate")
    public Evaluation evaluate(@Valid @RequestBody Request request) {
        var assessment = requests.evaluateCapacity(request.guests(), request.requestedAt(), request.preorder());
        return new Evaluation(false, assessment);
    }

    public record Request(@Min(1) int guests, @NotNull Instant requestedAt, boolean preorder) {}
    public record Evaluation(boolean confirmed, OperationalCapacityService.Assessment assessment) {}
}
