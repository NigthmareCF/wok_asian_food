package com.wokasianfood.api.customers;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class GuatemalaPhoneValidationIntegrationTest extends PostgresIntegrationTest {
    @Test
    void addressAndDeliveryEndpointsRejectNumbersOutsideTheGuatemalaFormat() {
        UUID customerId = createUserWithRole("phone-invalid-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String client = tokenFor(customerId);
        var invalidAddress = post("/api/v1/client/addresses", client,
                "{\"label\":\"Casa\",\"address\":\"Zona 1, Ciudad de Guatemala\",\"contactPhone\":\"1234567\",\"isDefault\":true}");
        assertThat(invalidAddress.statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.customer_addresses WHERE customer_user_id = ?",
                Integer.class, customerId)).isZero();

        String invalidDelivery = """
                {"requestedFor":"%s","address":"Zona 1, Ciudad de Guatemala",
                 "contactPhone":"55550101","paymentPreference":"CASH_ON_DELIVERY",
                 "invoiceRequested":false,"items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(Instant.now().plusSeconds(7200), UUID.randomUUID());
        var invalidRequest = post("/api/v1/client/delivery-requests", client, invalidDelivery,
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(invalidRequest.statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_requests WHERE customer_user_id = ?",
                Integer.class, customerId)).isZero();
    }

    @Test
    void acceptsTheEightDigitGroupedPhoneAndPersistsItUnchanged() {
        UUID customerId = createUserWithRole("phone-valid-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String client = tokenFor(customerId);
        var response = post("/api/v1/client/addresses", client,
                "{\"label\":\"Casa\",\"address\":\"Zona 1, Ciudad de Guatemala\",\"contactPhone\":\"5555 0101\",\"isDefault\":true}");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("5555 0101");
        assertThat(jdbc.queryForObject("SELECT contact_phone FROM wok.customer_addresses WHERE customer_user_id = ?",
                String.class, customerId)).isEqualTo("5555 0101");
    }
}
