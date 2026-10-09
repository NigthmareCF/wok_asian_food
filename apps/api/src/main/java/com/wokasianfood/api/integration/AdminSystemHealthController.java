package com.wokasianfood.api.integration;

import com.wokasianfood.api.ai.AiProvider;
import com.wokasianfood.api.email.EmailProvider;
import com.wokasianfood.api.fiscal.FiscalProvider;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Admin-only diagnostic that keeps local core readiness separate from external integrations. */
@RestController
@RequestMapping("/api/v1/admin/system/health")
@PreAuthorize("hasRole('ADMIN')")
public class AdminSystemHealthController {
    private final JdbcTemplate jdbc;
    private final String aiMode;
    private final String emailMode;
    private final String fiscalMode;
    private final ObjectProvider<AiProvider> aiProviders;
    private final ObjectProvider<EmailProvider> emailProviders;
    private final ObjectProvider<FiscalProvider> fiscalProviders;
    private final ObjectProvider<PaymentGateway> paymentGateways;

    public AdminSystemHealthController(JdbcTemplate jdbc,
            @Value("${wok.ai.mode:disabled}") String aiMode,
            @Value("${wok.email.mode:mock}") String emailMode,
            @Value("${wok.fiscal.mode:mock}") String fiscalMode,
            ObjectProvider<AiProvider> aiProviders,
            ObjectProvider<EmailProvider> emailProviders,
            ObjectProvider<FiscalProvider> fiscalProviders,
            ObjectProvider<PaymentGateway> paymentGateways) {
        this.jdbc = jdbc;
        this.aiMode = aiMode;
        this.emailMode = emailMode;
        this.fiscalMode = fiscalMode;
        this.aiProviders = aiProviders;
        this.emailProviders = emailProviders;
        this.fiscalProviders = fiscalProviders;
        this.paymentGateways = paymentGateways;
    }

    @GetMapping
    public SystemHealthSnapshot snapshot() {
        boolean databaseReady;
        try {
            databaseReady = Integer.valueOf(1).equals(jdbc.queryForObject("SELECT 1", Integer.class));
        } catch (org.springframework.dao.DataAccessException unavailable) {
            databaseReady = false;
        }

        List<IntegrationHealth> integrations = List.of(
                describe("PAYMENTS", "configured", paymentGateways.getIfAvailable()),
                describe("FEL", fiscalMode, fiscalProviders.getIfAvailable()),
                describe("EMAIL", emailMode, emailProviders.getIfAvailable()),
                describe("AI", aiMode, aiProviders.getIfAvailable()),
                new IntegrationHealth("META", "NOT_CONFIGURED", "unconfigured", false));
        String externalStatus = integrations.stream().allMatch(item -> "READY".equals(item.status()))
                ? "READY"
                : integrations.stream().anyMatch(item -> List.of("MOCK", "DISABLED", "NOT_CONFIGURED")
                        .contains(item.status())) ? "DEGRADED" : "UNKNOWN";
        return new SystemHealthSnapshot(databaseReady ? "READY" : "DOWN", externalStatus,
                Instant.now(), integrations);
    }

    private IntegrationHealth describe(String code, String configuredMode, Object adapter) {
        String mode = safeMode(configuredMode);
        if ("disabled".equals(mode)) return new IntegrationHealth(code, "DISABLED", mode, false);
        if (adapter == null) return new IntegrationHealth(code, "NOT_CONFIGURED", mode, false);
        if (adapter.getClass().getSimpleName().startsWith("Mock"))
            return new IntegrationHealth(code, "MOCK", "mock", false);
        return new IntegrationHealth(code, "UNVERIFIED", mode, false);
    }

    private String safeMode(String mode) {
        if (mode == null) return "unconfigured";
        String normalized = mode.trim().toLowerCase(java.util.Locale.ROOT);
        return List.of("mock", "disabled", "smtp", "local", "configured").contains(normalized)
                ? normalized : "configured";
    }

    public record SystemHealthSnapshot(String coreStatus, String externalStatus, Instant observedAt,
                                       List<IntegrationHealth> integrations) {}
    public record IntegrationHealth(String code, String status, String mode, boolean connectivityVerified) {}
}
