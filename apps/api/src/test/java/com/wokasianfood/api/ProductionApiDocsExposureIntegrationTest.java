package com.wokasianfood.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.profiles.active=prod")
class ProductionApiDocsExposureIntegrationTest extends PostgresIntegrationTest {
    @Test
    void productionProfileDoesNotExposeOpenApiOrSwaggerUi() {
        assertThat(get("/api/v1/openapi", null).statusCode()).isEqualTo(404);
        assertThat(get("/swagger-ui.html", null).statusCode()).isEqualTo(404);
        assertThat(get("/swagger-ui/index.html", null).statusCode()).isEqualTo(404);
    }
}
