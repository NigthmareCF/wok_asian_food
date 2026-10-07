package com.wokasianfood.api.service;

import com.wokasianfood.api.identity.AuthException;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

/** Applies the persisted weekly operating window to customer-requested service times. */
public class ServiceHoursPolicy {
    private static final ZoneId RESTAURANT_ZONE = ZoneId.of("America/Guatemala");
    private final JdbcTemplate jdbc;

    public ServiceHoursPolicy(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void requireSlot(String serviceType, Instant requestedFor, boolean lockSchedule) {
        if (requestedFor == null || !requestedFor.isAfter(Instant.now()))
            throw new AuthException(422, "El horario solicitado debe ser futuro.");
        ZonedDateTime local = requestedFor.atZone(RESTAURANT_ZONE);
        LocalDate serviceDate = local.toLocalDate();
        int weekday = local.getDayOfWeek().getValue();
        String lock = lockSchedule ? " FOR SHARE" : "";
        if (lockSchedule) lockServiceDate(jdbc, serviceType, serviceDate);
        List<DailyOverride> overrides = jdbc.query("""
            SELECT is_open, opens_at, closes_at, timezone_name FROM wok.business_hours_overrides
            WHERE service_type = ? AND service_date = ? AND expires_at > now()
            """ + lock, (rs, row) -> new DailyOverride(rs.getBoolean("is_open"),
                rs.getObject("opens_at", LocalTime.class), rs.getObject("closes_at", LocalTime.class),
                ZoneId.of(rs.getString("timezone_name"))), serviceType, serviceDate);
        if (!overrides.isEmpty()) {
            DailyOverride override = overrides.getFirst();
            if (!override.isOpen())
                throw new AuthException(422, "El servicio no opera en la fecha solicitada.");
            requireWithin(serviceType, requestedFor, new Window(override.opensAt(), override.closesAt(), override.zone()));
            return;
        }
        List<Window> windows = jdbc.query("""
            SELECT opens_at, closes_at, timezone_name FROM wok.business_hours
            WHERE service_type = ? AND weekday = ? AND active = true
            """ + lock, (rs, row) -> new Window(rs.getObject("opens_at", LocalTime.class),
                rs.getObject("closes_at", LocalTime.class), ZoneId.of(rs.getString("timezone_name"))),
                serviceType, weekday);
        if (windows.isEmpty())
            throw new AuthException(422, "El servicio no tiene horario disponible para la fecha solicitada.");

        requireWithin(serviceType, requestedFor, windows.getFirst());
    }

    public List<ServiceDay> list(String serviceType, LocalDate from, LocalDate to) {
        List<ServiceDay> days = new ArrayList<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            List<DailyOverride> overrides = jdbc.query("""
                SELECT is_open, opens_at, closes_at, timezone_name FROM wok.business_hours_overrides
                WHERE service_type = ? AND service_date = ? AND expires_at > now()
                """, (rs, row) -> new DailyOverride(rs.getBoolean("is_open"),
                    rs.getObject("opens_at", LocalTime.class), rs.getObject("closes_at", LocalTime.class),
                    ZoneId.of(rs.getString("timezone_name"))), serviceType, date);
            if (!overrides.isEmpty()) {
                DailyOverride override = overrides.getFirst();
                days.add(new ServiceDay(serviceType, date, override.isOpen(), override.opensAt(),
                        override.closesAt(), override.zone().getId(), "OVERRIDE"));
                continue;
            }
            List<Window> windows = jdbc.query("""
                SELECT opens_at, closes_at, timezone_name FROM wok.business_hours
                WHERE service_type = ? AND weekday = ? AND active = true
                """, (rs, row) -> new Window(rs.getObject("opens_at", LocalTime.class),
                    rs.getObject("closes_at", LocalTime.class), ZoneId.of(rs.getString("timezone_name"))),
                    serviceType, date.getDayOfWeek().getValue());
            if (windows.isEmpty()) {
                days.add(new ServiceDay(serviceType, date, false, null, null, RESTAURANT_ZONE.getId(), "CLOSED"));
            } else {
                Window window = windows.getFirst();
                days.add(new ServiceDay(serviceType, date, true, window.opensAt(), window.closesAt(),
                        window.zone().getId(), "WEEKLY"));
            }
        }
        return List.copyOf(days);
    }

    private void requireWithin(String serviceType, Instant requestedFor, Window window) {
        LocalTime requestedTime = requestedFor.atZone(window.zone()).toLocalTime();
        if (requestedTime.isBefore(window.opensAt()) || !requestedTime.isBefore(window.closesAt()))
            throw new AuthException(422, "La hora solicitada está fuera del horario de este servicio.");
    }

    static void lockServiceDate(JdbcTemplate jdbc, String serviceType, LocalDate serviceDate) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                rs -> {}, serviceType + ":" + serviceDate);
    }

    private record DailyOverride(boolean isOpen, LocalTime opensAt, LocalTime closesAt, ZoneId zone) {}
    private record Window(LocalTime opensAt, LocalTime closesAt, ZoneId zone) {}

    public record ServiceDay(String serviceType, LocalDate serviceDate, boolean open, LocalTime opensAt,
                             LocalTime closesAt, String timezoneName, String source) {}
}
