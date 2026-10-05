package com.wokasianfood.api.ai;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Backend-owned allowlist. It returns narrow public DTOs; it never accepts SQL or customer IDs. */
@Service
public class AiToolBroker {
    private final JdbcTemplate jdbc;

    public AiToolBroker(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<ServiceStatus> currentServiceStatus() {
        List<ServiceStatus> result = jdbc.query("""
                SELECT code, status FROM wok.service_capabilities
                WHERE effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
                ORDER BY code
                """, (rs, row) -> new ServiceStatus(rs.getString("code"), rs.getString("status")));
        auditToolCall("getCurrentServiceStatus");
        return result;
    }

    public List<OpeningHour> openingHours() {
        List<OpeningHour> result = jdbc.query("""
                SELECT service_type, weekday, opens_at, closes_at, timezone_name
                FROM wok.business_hours WHERE active = true ORDER BY service_type, weekday
                """, (rs, row) -> new OpeningHour(rs.getString("service_type"), rs.getInt("weekday"),
                rs.getTime("opens_at").toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm")),
                rs.getTime("closes_at").toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm")),
                rs.getString("timezone_name")));
        auditToolCall("getOpeningHours");
        return result;
    }

    private void auditToolCall(String toolName) {
        jdbc.update("""
                INSERT INTO wok.audit_logs
                    (action, entity_type, entity_id, after_data, result, actor_label_snapshot)
                VALUES ('AI_TOOL_EXECUTED', 'AI_TOOL_INVOCATION', ?, jsonb_build_object('tool', ?),
                        'SUCCESS', 'AI_SERVICE')
                """, UUID.randomUUID(), toolName);
    }

    public record ServiceStatus(String code, String status) {}
    public record OpeningHour(String service, int weekday, String opensAt, String closesAt, String timeZone) {}
}
