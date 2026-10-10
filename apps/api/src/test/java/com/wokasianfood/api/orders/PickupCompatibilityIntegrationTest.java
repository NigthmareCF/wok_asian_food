package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PickupCompatibilityIntegrationTest extends PostgresIntegrationTest {
    @Test
    void cancellationAndTrackingArePickupOnlyAndOwnerScoped() {
        UUID owner = createUserWithRole("pickup-scope-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String token = tokenFor(owner);
        String other = tokenForRole("CLIENT");
        UUID pickup = request(owner, "PICKUP");
        UUID delivery = request(owner, "DELIVERY");
        assertThat(get(path(pickup) + "/tracking", token).statusCode()).isEqualTo(200);
        assertThat(get(path(pickup) + "/tracking", other).statusCode()).isEqualTo(404);
        assertThat(get(path(delivery) + "/tracking", token).statusCode()).isEqualTo(404);
        assertThat(send("DELETE", path(delivery), token, null, Map.of()).statusCode()).isEqualTo(404);
        assertThat(send("DELETE", path(pickup), other, null, Map.of()).statusCode()).isEqualTo(404);
        assertThat(send("DELETE", path(pickup), token, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(send("DELETE", path(pickup), token, null, Map.of()).statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, delivery))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_request_events WHERE order_request_id = ? AND event_type = 'CANCELLED'",
                Integer.class, pickup)).isEqualTo(1);
    }

    private UUID request(UUID owner, String type) {
        return jdbc.queryForObject("""
                INSERT INTO wok.order_requests(customer_user_id, fulfillment_type, status, requested_for, currency_id,
                    subtotal, idempotency_key, request_fingerprint, delivery_address, contact_phone, payment_preference)
                SELECT ?, ?, 'PENDING_REVIEW', now() + interval '1 hour', id, 20, ?, ?,
                    CASE WHEN ? = 'DELIVERY' THEN 'Zona 1, Guatemala' END,
                    CASE WHEN ? = 'DELIVERY' THEN '55550101' END,
                    CASE WHEN ? = 'DELIVERY' THEN 'CASH_ON_DELIVERY' END
                FROM wok.currencies WHERE code = 'GTQ' RETURNING id
                """, UUID.class, owner, type, UUID.randomUUID(), "a".repeat(64), type, type, type);
    }

    private String path(UUID request) { return "/api/v1/client/order-requests/" + request; }
}
