package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ClientOrderTrackingOwnershipIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void trackingOnlyReturnsPickupOrdersOwnedByTheAuthenticatedClient() throws Exception {
        UUID owner = createUserWithRole("tracking-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID otherCustomer = createUserWithRole("tracking-other-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID staff = createUserWithRole("tracking-staff-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID ownedRequest = createAcceptedPickup(owner, staff, "WOK-TRACK-OWNER");
        createAcceptedPickup(otherCustomer, staff, "WOK-TRACK-OTHER");

        var response = get("/api/v1/client/orders/tracking", tokenFor(owner));

        assertThat(response.statusCode()).as("body %s", response.body()).isEqualTo(200);
        JsonNode tracking = json.readTree(response.body());
        assertThat(tracking).hasSize(1);
        assertThat(tracking.get(0).path("requestId").asText()).isEqualTo(ownedRequest.toString());
        assertThat(tracking.get(0).path("orderCode").asText()).isEqualTo("WOK-TRACK-OWNER");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.orders WHERE code = 'WOK-TRACK-OTHER'", Integer.class))
                .isEqualTo(1);
    }

    private UUID createAcceptedPickup(UUID customer, UUID staff, String orderCode) {
        UUID currency = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID account = jdbc.queryForObject("""
            INSERT INTO wok.order_accounts(name, opened_by) VALUES (?, ?) RETURNING id
            """, UUID.class, "Tracking " + orderCode, staff);
        UUID order = jdbc.queryForObject("""
            INSERT INTO wok.orders(code, account_id, channel, status, currency_id, opened_by)
            VALUES (?, ?, 'PICKUP', 'PREPARING', ?, ?) RETURNING id
            """, UUID.class, orderCode, account, currency, staff);
        UUID request = jdbc.queryForObject("""
            INSERT INTO wok.order_requests
                (customer_user_id, fulfillment_type, status, idempotency_key, request_fingerprint,
                 requested_for, subtotal, currency_id, decided_by, decided_at, order_id)
            VALUES (?, 'PICKUP', 'ACCEPTED', ?, repeat('a', 64), now(), 0, ?, ?, now(), ?)
            RETURNING id
            """, UUID.class, customer, UUID.randomUUID(), currency, staff, order);
        return request;
    }
}
