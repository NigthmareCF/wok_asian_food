package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ClientDeliveryCancellationIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void customerCanCancelOwnPendingDeliveryAndRetryWithoutDuplicateEvent() throws Exception {
        UUID customerId = createUserWithRole("delivery-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID requestId = createRequest(customerId, "DELIVERY", "PENDING_REVIEW");
        String path = "/api/v1/client/delivery-requests/" + requestId;
        String token = tokenFor(customerId);

        var cancelled = send("DELETE", path, token, null, Map.of());
        assertThat(cancelled.statusCode()).isEqualTo(200);
        assertThat(body(cancelled.body()).path("status").asText()).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT decision_reason FROM wok.order_requests WHERE id = ?", String.class,
                requestId)).isEqualTo("CANCELLED_BY_CLIENT");

        var retry = send("DELETE", path, token, null, Map.of());
        assertThat(retry.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_request_events "
                + "WHERE order_request_id = ? AND event_type = 'CANCELLED'", Integer.class, requestId)).isEqualTo(1);
    }

    @Test
    void onlyOwnerCanCancelDelivery() throws Exception {
        UUID ownerId = createUserWithRole("delivery-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID otherId = createUserWithRole("delivery-other-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID requestId = createRequest(ownerId, "DELIVERY", "PENDING_REVIEW");

        var response = send("DELETE", "/api/v1/client/delivery-requests/" + requestId, tokenFor(otherId), null, Map.of());

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
    }

    @Test
    void deliveryHistoryAndDetailsAreRestrictedToTheAuthenticatedCustomer() throws Exception {
        UUID ownerId = createUserWithRole("delivery-history-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID otherId = createUserWithRole("delivery-history-other-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID ownedRequestId = createRequest(ownerId, "DELIVERY", "PENDING_REVIEW");
        UUID foreignRequestId = createRequest(otherId, "DELIVERY", "PENDING_REVIEW");

        JsonNode ownerHistory = body(get("/api/v1/client/delivery-requests", tokenFor(ownerId)).body());
        JsonNode otherHistory = body(get("/api/v1/client/delivery-requests", tokenFor(otherId)).body());

        assertThat(ownerHistory).hasSize(1);
        assertThat(ownerHistory.get(0).path("requestId").asText()).isEqualTo(ownedRequestId.toString());
        assertThat(otherHistory).hasSize(1);
        assertThat(otherHistory.get(0).path("requestId").asText()).isEqualTo(foreignRequestId.toString());
        assertThat(get("/api/v1/client/delivery-requests/" + ownedRequestId, tokenFor(otherId)).statusCode())
                .isEqualTo(404);
        assertThat(get("/api/v1/client/delivery-requests/" + foreignRequestId, tokenFor(ownerId)).statusCode())
                .isEqualTo(404);
    }

    @Test
    void acceptedDeliveryCannotBeCancelledByCustomer() {
        UUID customerId = createUserWithRole("delivery-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID requestId = createRequest(customerId, "DELIVERY", "ACCEPTED");

        var response = send("DELETE", "/api/v1/client/delivery-requests/" + requestId, tokenFor(customerId), null, Map.of());

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("ACCEPTED");
    }

    @Test
    void pickupAndDeliveryCancellationRoutesCannotCrossCancel() {
        UUID customerId = createUserWithRole("delivery-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID deliveryId = createRequest(customerId, "DELIVERY", "PENDING_REVIEW");
        UUID pickupId = createRequest(customerId, "PICKUP", "PENDING_REVIEW");
        String token = tokenFor(customerId);

        assertThat(send("DELETE", "/api/v1/client/order-requests/" + deliveryId, token, null, Map.of()).statusCode())
                .isEqualTo(404);
        assertThat(send("DELETE", "/api/v1/client/delivery-requests/" + pickupId, token, null, Map.of()).statusCode())
                .isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_requests WHERE id IN (?, ?) "
                + "AND status = 'PENDING_REVIEW'", Integer.class, deliveryId, pickupId)).isEqualTo(2);
    }

    private UUID createRequest(UUID customerId, String fulfillmentType, String status) {
        UUID id = UUID.randomUUID();
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        boolean delivery = "DELIVERY".equals(fulfillmentType);
        boolean accepted = "ACCEPTED".equals(status);
        jdbc.update("""
            INSERT INTO wok.order_requests
                (id, customer_user_id, fulfillment_type, status, idempotency_key, request_fingerprint,
                 requested_for, subtotal, currency_id, delivery_address, contact_phone, payment_preference,
                 invoice_requested, decided_by, decision_reason, decided_at)
            VALUES (?, ?, ?, ?, ?, ?, now() + interval '1 day', ?, ?, ?, ?, ?, false, ?, ?, ?)
            """, id, customerId, fulfillmentType, status, UUID.randomUUID(), "a".repeat(64),
                new BigDecimal("50.00"), currencyId, delivery ? "Zona 1, Ciudad de Guatemala" : null,
                delivery ? "5555 0101" : null, delivery ? "CASH_ON_DELIVERY" : "CASH_AT_PICKUP",
                accepted ? customerId : null, accepted ? "APPROVED" : null,
                accepted ? Timestamp.from(java.time.Instant.now()) : null);
        return id;
    }

    private JsonNode body(String response) throws Exception { return json.readTree(response); }
}
