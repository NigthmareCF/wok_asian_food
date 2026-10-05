package com.wokasianfood.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = {
    "wok.ai.service-token=integration-test-only-token-with-32-characters-minimum",
    "wok.ai.mode=mock"
})
class AiToolBrokerIntegrationTest extends PostgresIntegrationTest {
    private static final String SERVICE_TOKEN = "integration-test-only-token-with-32-characters-minimum";

    @Autowired
    private AiToolBroker tools;

    @Test
    void returnsOnlyPublishedServiceDataAndAuditsEachAllowedTool() {
        int auditCountBefore = jdbc.queryForObject("""
                SELECT count(*) FROM wok.audit_logs WHERE action = 'AI_TOOL_EXECUTED'
                """, Integer.class);
        jdbc.update("""
                INSERT INTO wok.business_hours (service_type, weekday, opens_at, closes_at, timezone_name)
                VALUES ('RESTAURANT', 2, '14:00', '22:00', 'America/Guatemala')
                ON CONFLICT (service_type, weekday) DO NOTHING
                """);
        jdbc.update("""
                INSERT INTO wok.service_capabilities (code, status)
                VALUES ('DELIVERY', 'ENABLED')
                ON CONFLICT (code) DO UPDATE SET status = 'ENABLED', effective_until = NULL
                """);

        var hours = tools.openingHours();
        var statuses = tools.currentServiceStatus();

        assertThat(hours).anySatisfy(hour -> {
            assertThat(hour.service()).isEqualTo("RESTAURANT");
            assertThat(hour.weekday()).isEqualTo(2);
            assertThat(hour.opensAt()).isEqualTo("14:00");
            assertThat(hour.closesAt()).isEqualTo("22:00");
            assertThat(hour.timeZone()).isEqualTo("America/Guatemala");
        });
        assertThat(statuses).anySatisfy(status -> {
            assertThat(status.code()).isEqualTo("DELIVERY");
            assertThat(status.status()).isEqualTo("ENABLED");
        });
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.audit_logs
                WHERE action = 'AI_TOOL_EXECUTED' AND entity_type = 'AI_TOOL_INVOCATION'
                  AND after_data->>'tool' IN ('getOpeningHours', 'getCurrentServiceStatus')
                  AND actor_label_snapshot = 'AI_SERVICE'
                """, Integer.class)).isEqualTo(auditCountBefore + 2);
    }

    @Test
    void internalToolsEndpointRequiresServiceTokenAndUsesBackendAllowlist() {
        assertThat(send("POST", "/internal/ai/tools", null, "{\"name\":\"getCurrentServiceStatus\"}", Map.of())
                .statusCode()).isEqualTo(401);
        var response = send("POST", "/internal/ai/tools", null,
                "{\"name\":\"getCurrentServiceStatus\"}",
                Map.of("X-WOK-AI-TOKEN", SERVICE_TOKEN));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("getCurrentServiceStatus", "DELIVERY");

        var openApi = get("/api/v1/openapi", null);
        assertThat(openApi.statusCode()).isEqualTo(200);
        assertThat(openApi.body()).doesNotContain("/internal/ai");
    }
}
