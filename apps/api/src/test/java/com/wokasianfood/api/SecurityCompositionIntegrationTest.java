package com.wokasianfood.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;

class SecurityCompositionIntegrationTest extends PostgresIntegrationTest {

    @Test
    void exposesHealthOpenApiAndPublicMenuButProtectsOperationalQueue() throws Exception {
        assertThat(get("/actuator/health", null).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/openapi", null).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/public/menu", null).statusCode()).isEqualTo(200);
        HttpResponse<String> denied = get("/api/v1/operational/tables", null);
        assertThat(denied.statusCode()).isEqualTo(401);
    }
}