package com.wokasianfood.api.customers;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CustomerAddressOwnershipIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void clientCannotListUpdateOrDeleteAnotherCustomersAddress() throws Exception {
        UUID owner = createUserWithRole("address-owner-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID otherCustomer = createUserWithRole("address-other-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String ownerToken = tokenFor(owner);
        String otherToken = tokenFor(otherCustomer);

        var created = post("/api/v1/client/addresses", ownerToken,
                """
                {"label":"Casa","address":"Zona 1, Ciudad de Guatemala","reference":"Portón azul",
                 "contactPhone":"5555 0101","isDefault":true}
                """);
        assertThat(created.statusCode()).as("body %s", created.body()).isEqualTo(200);
        UUID addressId = UUID.fromString(json.readTree(created.body()).path("addressId").asText());

        var otherList = get("/api/v1/client/addresses", otherToken);
        assertThat(otherList.statusCode()).isEqualTo(200);
        assertThat(otherList.body()).doesNotContain(addressId.toString()).doesNotContain("Portón azul");

        var update = send("PUT", "/api/v1/client/addresses/" + addressId, otherToken,
                """
                {"label":"Robada","address":"Otra dirección válida en Ciudad de Guatemala",
                 "reference":null,"contactPhone":"5555 0202","isDefault":false,"expectedVersion":1}
                """, java.util.Map.of());
        assertThat(update.statusCode()).as("body %s", update.body()).isEqualTo(404);

        var delete = send("DELETE", "/api/v1/client/addresses/" + addressId, otherToken, null,
                Map.of());
        assertThat(delete.statusCode()).as("body %s", delete.body()).isEqualTo(404);

        assertThat(jdbc.queryForObject("SELECT label FROM wok.customer_addresses WHERE id = ?", String.class,
                addressId)).isEqualTo("Casa");
        assertThat(jdbc.queryForObject("SELECT customer_user_id FROM wok.customer_addresses WHERE id = ?",
                UUID.class, addressId)).isEqualTo(owner);
    }
}
