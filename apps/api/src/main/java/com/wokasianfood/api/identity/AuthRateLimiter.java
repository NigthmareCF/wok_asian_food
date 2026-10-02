package com.wokasianfood.api.identity;

import java.time.Duration;
import java.util.EnumMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Sliding-window rate limiter for the unauthenticated auth endpoints.
 *
 * <p>Attempts are counted per action and per subject, where subject is either the caller IP or the
 * normalized identifier (email) being targeted. Both scopes are checked so a spray across many emails
 * is still bounded by IP, while a single targeted account is bounded by identifier.
 *
 * <p>Counters are recorded before the endpoint runs, so the response is identical whether or not the
 * account exists. That keeps the limiter from turning into an account-enumeration oracle.
 */
@Component
public class AuthRateLimiter {
    private static final Duration RETENTION = Duration.ofHours(24);

    private final JdbcTemplate jdbc;
    private final Map<Action, Policy> policies = new EnumMap<>(Action.class);

    public AuthRateLimiter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        policies.put(Action.REGISTER, new Policy(5, Duration.ofMinutes(15), 3, Duration.ofMinutes(15)));
        policies.put(Action.VERIFY, new Policy(10, Duration.ofMinutes(15), 10, Duration.ofMinutes(15)));
        policies.put(Action.RESEND, new Policy(10, Duration.ofMinutes(15), 5, Duration.ofHours(1)));
        policies.put(Action.RESET_REQUEST, new Policy(5, Duration.ofMinutes(15), 3, Duration.ofHours(1)));
        policies.put(Action.RESET_COMPLETE, new Policy(10, Duration.ofMinutes(15), 5, Duration.ofMinutes(15)));
    }

    public enum Action { REGISTER, VERIFY, RESEND, RESET_REQUEST, RESET_COMPLETE }

    public void check(Action action, String identifier, String clientIp) {
        Policy policy = policies.get(action);
        record(action, "IP", ipSubject(clientIp));
        record(action, "IDENTIFIER", identifier == null ? "" : identifier.trim().toLowerCase(java.util.Locale.ROOT));
        if (exceeds(action, "IP", ipSubject(clientIp), policy.ipMax(), policy.ipWindow())
                || exceeds(action, "IDENTIFIER", identifier == null ? "" : identifier.trim().toLowerCase(java.util.Locale.ROOT),
                        policy.identifierMax(), policy.identifierWindow())) {
            jdbc.update("""
                INSERT INTO wok.security_events (event_type, severity, ip_address, details)
                VALUES ('AUTH_RATE_LIMITED', 'WARNING', ?::inet,
                        jsonb_build_object('action', ?, 'scope', 'AUTH'))
                """, safeIp(clientIp), action.name());
            throw new AuthException(429, "Demasiados intentos. Intenta más tarde.");
        }
    }

    private void record(Action action, String scope, String subject) {
        if (subject.isEmpty()) return;
        jdbc.update("INSERT INTO wok.auth_rate_limit_events (action, scope, subject) VALUES (?, ?, ?)",
                action.name(), scope, subject);
        jdbc.update("DELETE FROM wok.auth_rate_limit_events WHERE action = ? AND created_at < now() - make_interval(secs => ?)",
                action.name(), RETENTION.toSeconds());
    }

    private boolean exceeds(Action action, String scope, String subject, int max, Duration window) {
        if (subject.isEmpty() || max <= 0) return false;
        Integer count = jdbc.queryForObject("""
            SELECT count(*) FROM wok.auth_rate_limit_events
            WHERE action = ? AND scope = ? AND subject = ? AND created_at > now() - make_interval(secs => ?)
            """, Integer.class, action.name(), scope, subject, window.toSeconds());
        return count != null && count > max;
    }

    private String ipSubject(String clientIp) {
        return safeIp(clientIp);
    }

    private String safeIp(String clientIp) {
        if (clientIp == null || clientIp.isBlank()) return "0.0.0.0";
        String candidate = clientIp.trim();
        if (candidate.contains(",")) candidate = candidate.split(",")[0].trim();
        if (candidate.startsWith("::ffff:")) candidate = candidate.substring("::ffff:".length());
        return candidate;
    }

    private record Policy(int ipMax, Duration ipWindow, int identifierMax, Duration identifierWindow) {}
}
