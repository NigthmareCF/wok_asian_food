package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ClientPickupCancellationIntegrationTest extends PostgresIntegrationTest {

    @Test
    void cancelsOwnPendingPickupAndReplaysWithoutAnotherEvent() {
        UUID customerId = customer();
        String token = tokenFor(customerId);
        UUID requestId = pickup(customerId);

        var first = send("DELETE", path(requestId), token, null, Map.of());
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT decided_by FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isEqualTo(customerId);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type = 'CANCELLED' AND actor_user_id = ?
                """, Integer.class, requestId, customerId)).isEqualTo(1);
        var after = jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId);
        var events = jdbc.queryForList("SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id", requestId);

        var replay = send("DELETE", path(requestId), token, null, Map.of());
        assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(replay.body()).isEqualTo(first.body());
        assertThat(jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId)).isEqualTo(after);
        assertThat(jdbc.queryForList("SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id", requestId))
                .isEqualTo(events);
    }

    @Test
    void cancelsOwnPendingDeliveryAndReplaysWithoutAnotherEvent() {
        UUID customerId = customer();
        String token = tokenFor(customerId);
        UUID requestId = pickup(customerId);
        jdbc.update("""
                UPDATE wok.order_requests
                SET fulfillment_type = 'DELIVERY', delivery_address = 'Zona 1, Ciudad de Guatemala',
                    contact_phone = '+502 5555-0101', payment_preference = 'CASH_ON_DELIVERY'
                WHERE id = ?
                """, requestId);

        var first = send("DELETE", path(requestId), token, null, Map.of());
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT decided_by FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isEqualTo(customerId);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type = 'CANCELLED' AND actor_user_id = ?
                """, Integer.class, requestId, customerId)).isEqualTo(1);
        var after = jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId);
        var events = jdbc.queryForList("SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id", requestId);

        var replay = send("DELETE", path(requestId), token, null, Map.of());
        assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(replay.body()).isEqualTo(first.body());
        assertThat(jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId)).isEqualTo(after);
        assertThat(jdbc.queryForList("SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id", requestId))
                .isEqualTo(events);
    }

    @Test
    void hidesAnotherCustomersRequestAndMissingRequest() {
        UUID requestId = pickup(customer());
        String otherToken = tokenFor(customer());

        assertHiddenAndUnchanged(requestId, otherToken);
        assertThat(send("DELETE", path(UUID.randomUUID()), otherToken, null, Map.of()).statusCode()).isEqualTo(404);
    }

    @Test
    void rejectsCancellationWhenRequestAlreadyAcceptedOrRejected() {
        UUID customerId = customer();
        String token = tokenFor(customerId);
        UUID requestId = pickup(customerId);
        jdbc.update("UPDATE wok.order_requests SET status = 'ACCEPTED', decided_by = ?, decided_at = now() WHERE id = ?", customerId, requestId);

        var acceptedResp = send("DELETE", path(requestId), token, null, Map.of());
        assertThat(acceptedResp.statusCode()).isEqualTo(409);

        jdbc.update("UPDATE wok.order_requests SET status = 'REJECTED' WHERE id = ?", requestId);
        var rejectedResp = send("DELETE", path(requestId), token, null, Map.of());
        assertThat(rejectedResp.statusCode()).isEqualTo(409);
    }

    private void assertHiddenAndUnchanged(UUID requestId, String token) {
        var before = jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId);
        var events = jdbc.queryForList("SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id", requestId);

        assertThat(send("DELETE", path(requestId), token, null, Map.of()).statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForMap("SELECT * FROM wok.order_requests WHERE id = ?", requestId)).isEqualTo(before);
        assertThat(jdbc.queryForList("SELECT * FROM wok.order_request_events WHERE order_request_id = ? ORDER BY id", requestId))
                .isEqualTo(events);
    }

    private UUID customer() {
        return createUserWithRole("pickup-cancel-" + UUID.randomUUID() + "@wok.test", "CLIENT");
    }

    private UUID pickup(UUID customerId) {
        UUID requestId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.order_requests
                    (id, customer_user_id, fulfillment_type, idempotency_key, request_fingerprint,
                     requested_for, subtotal, currency_id)
                SELECT ?, ?, 'PICKUP', ?, ?, now() + interval '1 hour', 25.00, id
                FROM wok.currencies WHERE code = 'GTQ'
                """, requestId, customerId, UUID.randomUUID(), "0".repeat(64));
        jdbc.update("""
                INSERT INTO wok.order_request_events (order_request_id, event_type, actor_user_id)
                VALUES (?, 'SUBMITTED', ?)
                """, requestId, customerId);
        return requestId;
    }

    private String path(UUID requestId) {
        return "/api/v1/client/order-requests/" + requestId;
    }
}
