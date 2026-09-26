package com.wokasianfood.api.ai;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Explicit allowlist. The model cannot submit SQL or select arbitrary customer resources. */
@Service
public class AiToolBroker {
    private final JdbcTemplate jdbc;
    public AiToolBroker(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Map<String, String>> execute(String toolName) {
        return switch (toolName) {
            case "getCurrentServiceStatus" -> jdbc.query("""
                SELECT code, status FROM wok.service_capabilities
                WHERE effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
                ORDER BY code
                """, (rs, row) -> Map.of("code", rs.getString("code"), "status", rs.getString("status")));
            case "getOpeningHours" -> jdbc.query("""
                SELECT service_type, weekday, opens_at, closes_at FROM wok.business_hours
                WHERE active = true ORDER BY service_type, weekday
                """, (rs, row) -> Map.of("service", rs.getString("service_type"),
                    "weekday", rs.getString("weekday"), "opensAt", rs.getString("opens_at"),
                    "closesAt", rs.getString("closes_at")));
            default -> throw new SecurityException("AI tool is not authorized");
        };
    }
}
