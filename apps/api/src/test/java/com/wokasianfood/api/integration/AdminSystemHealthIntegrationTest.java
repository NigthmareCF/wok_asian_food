package com.wokasianfood.api.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;

class AdminSystemHealthIntegrationTest extends PostgresIntegrationTest {
    private static final String ENDPOINT = "/api/v1/admin/system/health";
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void adminSeesCoreReadySeparatelyFromMockAndUnconfiguredProviders() throws Exception {
        HttpResponse<String> response = get(ENDPOINT, tokenForRole("ADMIN"));

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = json.readTree(response.body());
        assertThat(body.path("coreStatus").asText()).isEqualTo("READY");
        assertThat(body.path("externalStatus").asText()).isEqualTo("DEGRADED");
        assertThat(status(body, "PAYMENTS")).isEqualTo("MOCK");
        assertThat(status(body, "FEL")).isEqualTo("MOCK");
        assertThat(status(body, "EMAIL")).isEqualTo("MOCK");
        assertThat(status(body, "AI")).isEqualTo("DISABLED");
        assertThat(status(body, "META")).isEqualTo("NOT_CONFIGURED");
        assertThat(body.path("integrations").findValuesAsText("connectivityVerified"))
                .containsOnly("false");
        assertThat(get("/actuator/health", null).statusCode()).isEqualTo(200);
    }

    @Test
    void systemHealthIsPrivateToAdministrators() {
        assertThat(get(ENDPOINT, null).statusCode()).isEqualTo(401);
        assertThat(get(ENDPOINT, tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
        assertThat(get(ENDPOINT, tokenForRole("OPERATIONAL")).statusCode()).isEqualTo(403);
    }

    private String status(JsonNode body, String code) {
        for (JsonNode integration : body.path("integrations")) {
            if (code.equals(integration.path("code").asText())) return integration.path("status").asText();
        }
        return null;
    }
}
