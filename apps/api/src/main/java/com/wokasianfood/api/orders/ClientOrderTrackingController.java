package com.wokasianfood.api.orders;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Exposes only pickup orders linked to requests owned by the authenticated client. */
@RestController
@RequestMapping("/api/v1/client/orders")
@PreAuthorize("hasRole('CLIENT')")
public class ClientOrderTrackingController {
    private static final RowMapper<PickupOrderTracking> TRACKING_MAPPER = (rs, row) ->
            new PickupOrderTracking(
                    rs.getObject("request_id", UUID.class),
                    rs.getString("order_code"),
                    rs.getString("status"),
                    rs.getTimestamp("requested_for").toInstant(),
                    rs.getTimestamp("estimated_ready_at") == null
                            ? null : rs.getTimestamp("estimated_ready_at").toInstant(),
                    rs.getTimestamp("updated_at").toInstant());

    private final JdbcTemplate jdbc;

    public ClientOrderTrackingController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/tracking")
    public List<PickupOrderTracking> tracking(@AuthenticationPrincipal Jwt jwt) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        return jdbc.query("""
                SELECT r.id AS request_id, o.code AS order_code, o.status,
                       r.requested_for, o.updated_at,
                       CASE WHEN o.status IN ('SENT', 'PREPARING') THEN (
                           SELECT max(t.estimated_ready_at)
                           FROM wok.kitchen_tickets t
                           WHERE t.order_id = o.id AND t.status IN ('QUEUED', 'PREPARING', 'RECALLED')
                       ) ELSE NULL END AS estimated_ready_at
                FROM wok.order_requests r
                JOIN wok.orders o ON o.id = r.order_id
                WHERE r.customer_user_id = ?
                  AND r.fulfillment_type = 'PICKUP'
                  AND r.status = 'ACCEPTED'
                ORDER BY r.updated_at DESC, r.id DESC
                LIMIT 50
                """, TRACKING_MAPPER, customerId);
    }

    public record PickupOrderTracking(UUID requestId, String orderCode, String status,
                                      Instant requestedFor, Instant estimatedReadyAt, Instant updatedAt) {}
}
