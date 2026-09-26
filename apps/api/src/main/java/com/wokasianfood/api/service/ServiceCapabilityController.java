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
    private final JdbcTemplate jdbc;
    public ServiceCapabilityController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<Capability> list() {
        return jdbc.query("""
            SELECT code, status FROM wok.service_capabilities
            WHERE effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
            ORDER BY code
            """, (rs, row) -> new Capability(rs.getString("code"), rs.getString("status")));
    }

    public record Capability(String code, String status) {}
}
