package com.wokasianfood.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.sql.Timestamp;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class BusinessHoursOverrideIntegrationTest extends PostgresIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private final ObjectMapper json = new ObjectMapper();

    @AfterEach
    void removeOverrides() {
        jdbc.update("DELETE FROM wok.business_hours_overrides WHERE service_type = 'PICKUP'");
    }

    @Test
    void adminCanSetAndReviseAuditedDailyOverrideAndPublicApiReflectsIt() throws Exception {
        LocalDate date = nextWednesday();
        String admin = tokenForRole("ADMIN");
        String endpoint = "/api/v1/admin/business-hours/overrides/PICKUP/" + date;

        var closed = send("PUT", endpoint, admin, """
            {"isOpen":false,"opensAt":null,"closesAt":null,"timezoneName":"America/Guatemala",
             "expectedVersion":0,"reason":"Cierre por mantenimiento"}
            """, Map.of());
        assertThat(closed.statusCode()).as(closed.body()).isEqualTo(200);
        JsonNode first = json.readTree(closed.body());
        assertThat(first.path("rowVersion").asInt()).isEqualTo(1);
        assertThat(first.path("expiresAt").asText()).isNotBlank();

        var schedule = get("/api/v1/public/service-hours?serviceType=PICKUP&from=" + date + "&to=" + date, null);
        assertThat(schedule.statusCode()).isEqualTo(200);
        JsonNode publicDay = json.readTree(schedule.body()).get(0);
        assertThat(publicDay.path("open").asBoolean()).isFalse();
        assertThat(publicDay.path("source").asText()).isEqualTo("OVERRIDE");
        var legacyClosed = get("/api/v1/public/service-hours/PICKUP/" + date, null);
        assertThat(legacyClosed.statusCode()).isEqualTo(200);
        assertThat(json.readTree(legacyClosed.body())).isEmpty();

        var opened = send("PUT", endpoint, admin, """
            {"isOpen":true,"opensAt":"15:00:00","closesAt":"19:30:00",
             "timezoneName":"America/Guatemala","expectedVersion":1,"reason":"Apertura excepcional aprobada"}
            """, Map.of());
        assertThat(opened.statusCode()).as(opened.body()).isEqualTo(200);
        assertThat(json.readTree(opened.body()).path("rowVersion").asInt()).isEqualTo(2);
        var legacyOpened = get("/api/v1/public/service-hours/PICKUP/" + date, null);
        assertThat(legacyOpened.statusCode()).isEqualTo(200);
        JsonNode legacyWindow = json.readTree(legacyOpened.body()).get(0);
        assertThat(legacyWindow.path("weekday").asInt()).isEqualTo(date.getDayOfWeek().getValue());
        assertThat(legacyWindow.path("opensAt").asText()).isEqualTo("15:00");
        assertThat(legacyWindow.path("closesAt").asText()).isEqualTo("19:30");
        assertThat(legacyWindow.path("timezone").asText()).isEqualTo("America/Guatemala");

        var stale = send("PUT", endpoint, admin, """
            {"isOpen":false,"opensAt":null,"closesAt":null,"timezoneName":"America/Guatemala",
             "expectedVersion":1,"reason":"Versión obsoleta"}
            """, Map.of());
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE action LIKE 'BUSINESS_HOURS_OVERRIDE_%'",
                Integer.class)).isEqualTo(2);
        assertThat(get("/api/v1/admin/business-hours/overrides?serviceType=PICKUP&from=" + date + "&to=" + date,
                admin).statusCode()).isEqualTo(200);
    }

    @Test
    void closedOverrideWinsAndExpiredOverrideFallsBackToWeeklySchedule() {
        LocalDate date = nextWednesday();
        UUID actor = createUserWithRole("hours-test-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        jdbc.update("""
            INSERT INTO wok.business_hours_overrides
                (service_type, service_date, is_open, timezone_name, reason, expires_at, created_by, updated_by)
            VALUES ('PICKUP', ?, false, 'America/Guatemala', 'Cierre de prueba', ?, ?, ?)
            """, date, Timestamp.from(date.plusDays(1).atStartOfDay(ZONE).toInstant()), actor, actor);
        ServiceHoursPolicy policy = new ServiceHoursPolicy(jdbc);
        var target = date.atTime(15, 0).atZone(ZONE).toInstant();

        assertThatThrownBy(() -> policy.requireSlot("PICKUP", target, true))
                .isInstanceOf(AuthException.class).extracting("status").isEqualTo(422);
        jdbc.update("DELETE FROM wok.business_hours_overrides WHERE service_type = 'PICKUP'");
        jdbc.update("""
            INSERT INTO wok.business_hours_overrides
                (service_type, service_date, is_open, timezone_name, reason, expires_at,
                 created_by, updated_by, created_at)
            VALUES ('PICKUP', ?, false, 'America/Guatemala', 'Excepción vencida', now() - interval '1 second',
                    ?, ?, now() - interval '1 day')
            """, date, actor, actor);
        policy.requireSlot("PICKUP", target, true);
    }

    @Test
    void adminOverrideEndpointRejectsInvalidOpenWindowAndPastDate() {
        String admin = tokenForRole("ADMIN");
        LocalDate date = nextWednesday();
        String endpoint = "/api/v1/admin/business-hours/overrides/PICKUP/" + date;
        var invalid = send("PUT", endpoint, admin, """
            {"isOpen":true,"opensAt":"20:00:00","closesAt":"14:00:00",
             "timezoneName":"America/Guatemala","expectedVersion":0,"reason":"Ventana inválida"}
            """, Map.of());
        assertThat(invalid.statusCode()).isEqualTo(422);

        var wrongZone = send("PUT", endpoint, admin, """
            {"isOpen":false,"opensAt":null,"closesAt":null,
             "timezoneName":"UTC","expectedVersion":0,"reason":"Zona ajena al restaurante"}
            """, Map.of());
        assertThat(wrongZone.statusCode()).isEqualTo(422);

        var past = send("PUT", "/api/v1/admin/business-hours/overrides/PICKUP/2020-01-01", admin, """
            {"isOpen":false,"opensAt":null,"closesAt":null,"timezoneName":"America/Guatemala",
             "expectedVersion":0,"reason":"Fecha anterior"}
            """, Map.of());
        assertThat(past.statusCode()).isEqualTo(422);
    }

    @Test
    void publicCalendarRoutesRejectPastDatesAndAllowSingleFutureDates() {
        LocalDate today = LocalDate.now(ZONE);
        LocalDate past = today.minusDays(1);
        LocalDate futureDate = today.plusDays(32);

        assertThat(get("/api/v1/public/service-hours?serviceType=PICKUP&from=" + past + "&to=" + past, null)
                .statusCode()).isEqualTo(422);
        assertThat(get("/api/v1/public/service-hours/PICKUP/" + past, null).statusCode()).isEqualTo(422);
        assertThat(get("/api/v1/public/service-hours?serviceType=PICKUP&from=" + futureDate + "&to=" + futureDate, null)
                .statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/public/service-hours/PICKUP/" + futureDate, null).statusCode()).isEqualTo(200);
    }

    private LocalDate nextWednesday() {
        return LocalDate.now(ZONE).with(TemporalAdjusters.next(DayOfWeek.WEDNESDAY));
    }
}
