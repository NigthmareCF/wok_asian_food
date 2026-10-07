package com.wokasianfood.api.reservations;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Reads the effective DINE_IN window for a local restaurant date, falling back to restaurant-wide hours. */
@FunctionalInterface
public interface OperatingHoursProvider {
    Optional<Window> forDate(LocalDate date);

    default Optional<Window> forDate(LocalDate date, boolean lockSchedule) { return forDate(date); }

    record Window(LocalTime opensAt, LocalTime closesAt, ZoneId zone) {}
}

@Service
class JdbcOperatingHoursProvider implements OperatingHoursProvider {
    private final JdbcTemplate jdbc;

    JdbcOperatingHoursProvider(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public Optional<Window> forDate(LocalDate date) {
        return forDate(date, false);
    }

    @Override
    public Optional<Window> forDate(LocalDate date, boolean lockSchedule) {
        String lock = lockSchedule ? " FOR SHARE" : "";
        var overrides = jdbc.query("""
            SELECT is_open, opens_at, closes_at, timezone_name
            FROM wok.business_hours_overrides
            WHERE service_date = ? AND expires_at > now()
              AND service_type IN ('DINE_IN', 'RESTAURANT')
            ORDER BY CASE service_type WHEN 'DINE_IN' THEN 0 ELSE 1 END, id
            LIMIT 1
            """ + lock, (rs, row) -> new DailyOverride(rs.getBoolean("is_open"),
                rs.getObject("opens_at", LocalTime.class), rs.getObject("closes_at", LocalTime.class),
                ZoneId.of(rs.getString("timezone_name"))), date);
        if (!overrides.isEmpty()) {
            DailyOverride override = overrides.getFirst();
            return override.isOpen()
                    ? Optional.of(new Window(override.opensAt(), override.closesAt(), override.zone()))
                    : Optional.empty();
        }
        return jdbc.query("""
            SELECT opens_at, closes_at, timezone_name
            FROM wok.business_hours
            WHERE active AND weekday = EXTRACT(ISODOW FROM CAST(? AS date))::integer
              AND service_type IN ('DINE_IN', 'RESTAURANT')
            ORDER BY CASE service_type WHEN 'DINE_IN' THEN 0 ELSE 1 END, updated_at DESC, id
            LIMIT 1
            """ + lock, (rs, row) -> new Window(rs.getObject("opens_at", LocalTime.class),
                rs.getObject("closes_at", LocalTime.class), ZoneId.of(rs.getString("timezone_name"))), date)
            .stream().findFirst();
    }

    private record DailyOverride(boolean isOpen, LocalTime opensAt, LocalTime closesAt, ZoneId zone) {}
}
