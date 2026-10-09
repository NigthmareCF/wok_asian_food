package com.wokasianfood.api.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Public schedule shared by the web, mobile app and future messaging adapters. */
@RestController
@RequestMapping("/api/v1/public/service-hours")
public class PublicServiceHoursController {
    private final ServiceHoursPolicy hours;

    public PublicServiceHoursController(JdbcTemplate jdbc) { this.hours = new ServiceHoursPolicy(jdbc); }

    @GetMapping
    public List<ServiceHoursPolicy.ServiceDay> list(@RequestParam String serviceType,
            @RequestParam LocalDate from, @RequestParam LocalDate to) {
        String normalized = normalizeServiceType(serviceType);
        validateScheduleRange(from, to);
        return hours.list(normalized, from, to);
    }

    private void validateScheduleRange(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(ZoneId.of("America/Guatemala"));
        if (from.isBefore(today) || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 30)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Consulta un rango futuro de hasta 31 días.");
    }

    /** Compatibility adapter for mobile builds that still request one date by path. */
    @GetMapping("/{serviceType}/{serviceDate}")
    public List<LegacyServiceWindow> legacyDay(@PathVariable String serviceType, @PathVariable LocalDate serviceDate) {
        String normalized = normalizeServiceType(serviceType);
        validateScheduleRange(serviceDate, serviceDate);
        ServiceHoursPolicy.ServiceDay day = hours.list(normalized, serviceDate, serviceDate).getFirst();
        if (!day.open()) return List.of();
        return List.of(new LegacyServiceWindow(day.serviceDate().getDayOfWeek().getValue(),
                day.opensAt().toString(), day.closesAt().toString(), day.timezoneName()));
    }

    private String normalizeServiceType(String serviceType) {
        String normalized = serviceType.trim().toUpperCase(Locale.ROOT);
        if (!List.of("PICKUP", "DELIVERY", "DINE_IN", "RESTAURANT", "ONLINE").contains(normalized))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El servicio no es válido.");
        return normalized;
    }

    public record LegacyServiceWindow(int weekday, String opensAt, String closesAt, String timezone) {}
}
