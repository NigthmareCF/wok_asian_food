package com.wokasianfood.api.customers;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CustomerTaxProfileIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void clientCanManageOwnedProfilesAndOnlyOneIsDefault() {
        UUID customer = createUserWithRole("tax-profile-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID otherCustomer = createUserWithRole("tax-profile-other-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        String token = tokenFor(customer);
        String path = "/api/v1/client/tax-profiles";

        JsonNode first = body(post(path, token, """
            {"label":"Personal","customerName":"María López","customerTaxId":"1234567-8","isDefault":true}
            """));
        JsonNode second = body(post(path, token, """
            {"label":"Negocio","customerName":"Comercial WOK","customerTaxId":"CF","isDefault":true}
            """));

        assertThat(first.path("isDefault").asBoolean()).isTrue();
        assertThat(second.path("isDefault").asBoolean()).isTrue();
        JsonNode ownProfiles = body(get(path, token));
        assertThat(ownProfiles).hasSize(2);
        assertThat(ownProfiles.get(0).path("profileId").asText()).isEqualTo(second.path("profileId").asText());
        assertThat(ownProfiles.get(0).path("isDefault").asBoolean()).isTrue();
        assertThat(ownProfiles.get(1).path("isDefault").asBoolean()).isFalse();
        assertThat(body(get(path, tokenFor(otherCustomer)))).isEmpty();
        assertThat(get(path, tokenForRole("OPERATIONAL")).statusCode()).isEqualTo(403);

        var crossOwnerUpdate = send("PUT", path + "/" + first.path("profileId").asText(), tokenFor(otherCustomer), """
            {"label":"Robado","customerName":"Otro Cliente","customerTaxId":"9999999-9","isDefault":true,"expectedVersion":1}
            """, java.util.Map.of());
        assertThat(crossOwnerUpdate.statusCode()).isEqualTo(404);
        var crossOwnerDelete = send("DELETE", path + "/" + first.path("profileId").asText(), tokenFor(otherCustomer), null, java.util.Map.of());
        assertThat(crossOwnerDelete.statusCode()).isEqualTo(404);
        JsonNode unchanged = body(get(path, token));
        assertThat(unchanged).hasSize(2);
        assertThat(unchanged.get(1).path("label").asText()).isEqualTo("Personal");
        assertThat(unchanged.get(1).path("customerTaxId").asText()).isEqualTo("1234567-8");
    }

    @Test
    void updateRequiresCurrentVersionAndCanRemoveDefault() {
        String token = tokenForRole("CLIENT");
        String path = "/api/v1/client/tax-profiles";
        JsonNode profile = body(post(path, token, """
            {"label":"Personal","customerName":"María López","customerTaxId":"12345678","isDefault":true}
            """));
        String id = profile.path("profileId").asText();

        var stale = send("PUT", path + "/" + id, token, """
            {"label":"Personal","customerName":"Otro nombre","customerTaxId":"12345678","isDefault":true,"expectedVersion":9}
            """, java.util.Map.of());
        assertThat(stale.statusCode()).isEqualTo(409);

        JsonNode updated = body(send("PUT", path + "/" + id, token, """
            {"label":"Personal","customerName":"María López","customerTaxId":"87654321","isDefault":false,"expectedVersion":1}
            """, java.util.Map.of()));
        assertThat(updated.path("version").asInt()).isEqualTo(2);
        assertThat(updated.path("isDefault").asBoolean()).isFalse();
        assertThat(send("DELETE", path + "/" + id, token, null, java.util.Map.of()).statusCode()).isEqualTo(204);
        assertThat(body(get(path, token))).isEmpty();
    }

    @Test
    void validatesFiscalProfileFields() {
        String token = tokenForRole("CLIENT");
        var invalid = post("/api/v1/client/tax-profiles", token, """
            {"label":"   ","customerName":" ","customerTaxId":"","isDefault":true}
            """);
        assertThat(invalid.statusCode()).isEqualTo(400);
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }
}
