package com.wokasianfood.api.service;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public status comes from persisted service policy, never from frontend fixtures. */
@RestController
@RequestMapping("/api/v1/public/service-capabilities")
public class ServiceCapabilityController {
    private static final String PUBLIC_CODES = "'LOCAL', 'RESERVATIONS', 'DINE_IN_ONLINE', 'PICKUP', " +
            "'DELIVERY', 'ONLINE_ORDERS', 'MESSAGING', 'ONLINE_PAYMENTS'";
    private final JdbcTemplate jdbc;
    public ServiceCapabilityController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<Capability> list() {
        String sql = """
            SELECT code, status FROM wok.service_capabilities
            WHERE code IN (%s)
              AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
            ORDER BY code
            """.formatted(PUBLIC_CODES);
        return jdbc.query(sql, (rs, row) -> new Capability(rs.getString("code"), rs.getString("status")));
    }

    public record Capability(String code, String status) {}
}
