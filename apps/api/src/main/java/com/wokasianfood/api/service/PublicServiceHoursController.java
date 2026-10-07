package com.wokasianfood.api.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
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
        String normalized = serviceType.trim().toUpperCase(Locale.ROOT);
        if (!List.of("PICKUP", "DELIVERY", "DINE_IN", "RESTAURANT", "ONLINE").contains(normalized))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El servicio no es válido.");
        LocalDate today = LocalDate.now(ZoneId.of("America/Guatemala"));
        if (from.isBefore(today) || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 30)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Consulta un rango futuro de hasta 31 días.");
        return hours.list(normalized, from, to);
    }
}
