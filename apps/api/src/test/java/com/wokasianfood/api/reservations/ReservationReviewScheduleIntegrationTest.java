package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReservationReviewScheduleIntegrationTest extends PostgresIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void staffCannotConfirmWhenCurrentBusinessHoursNoLongerAllowTheRequestedTime() throws Exception {
        ReviewCase review = createReviewCase(LocalTime.of(14, 0), LocalTime.of(22, 0));
        try {
            var response = decide(review, "CONFIRM");
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(json.readTree(response.body()).path("status").asText()).isEqualTo("CONFIRMED");
        } finally {
            cleanup(review);
        }
    }

    @Test
    void staffMustRevalidateAgainstCurrentHoursBeforeConfirming() throws Exception {
        ReviewCase review = createReviewCase(LocalTime.of(14, 0), LocalTime.of(22, 0));
        try {
            jdbc.update("UPDATE wok.business_hours SET closes_at = '15:00', row_version = row_version + 1 "
                    + "WHERE id = ?", review.hoursId());
            var response = decide(review, "CONFIRM");
            assertThat(response.statusCode()).isEqualTo(409);
            assertThat(response.body()).contains("horario de servicio vigente");
            assertThat(jdbc.queryForObject("SELECT status FROM wok.reservations WHERE id = ?", String.class,
                    review.reservationId())).isEqualTo("REQUESTED");
        } finally {
            cleanup(review);
        }
    }

    @Test
    void staffCannotConfirmWhenDailyOverrideClosesTheRestaurant() throws Exception {
        ReviewCase review = createReviewCase(LocalTime.of(14, 0), LocalTime.of(22, 0));
        UUID adminId = createUserWithRole("override-admin-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        jdbc.update("""
            INSERT INTO wok.business_hours_overrides
                (service_type, service_date, is_open, timezone_name, reason, expires_at, created_by, updated_by)
            VALUES ('DINE_IN', ?, false, 'America/Guatemala', 'Cierre excepcional', ?, ?, ?)
            """, review.serviceDate(), Timestamp.from(review.serviceDate().plusDays(1).atStartOfDay(ZONE).toInstant()),
                adminId, adminId);
        try {
            var response = decide(review, "CONFIRM");
            assertThat(response.statusCode()).isEqualTo(409);
            assertThat(response.body()).contains("no tiene horario activo");
            assertThat(jdbc.queryForObject("SELECT status FROM wok.reservations WHERE id = ?", String.class,
                    review.reservationId())).isEqualTo("REQUESTED");
        } finally {
            cleanup(review);
        }
    }

    private ReviewCase createReviewCase(LocalTime opensAt, LocalTime closesAt) throws Exception {
        LocalDate date = LocalDate.now(ZONE).plusDays(1);
        while (date.getDayOfWeek() == java.time.DayOfWeek.MONDAY) date = date.plusDays(1);
        UUID hoursId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.business_hours (id, service_type, weekday, opens_at, closes_at, timezone_name)
            VALUES (?, 'DINE_IN', ?, ?, ?, 'America/Guatemala')
            """, hoursId, date.getDayOfWeek().getValue(), opensAt, closesAt);

        UUID customerUser = createUserWithRole("review-client-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        jdbc.update("INSERT INTO wok.customer_profiles (user_id, full_name) VALUES (?, 'Cliente de prueba')", customerUser);
        String customerToken = tokenFor(customerUser);
        Instant requestedAt = date.atTime(16, 0).atZone(ZONE).toInstant();
        var submitted = post("/api/v1/client/reservations", customerToken,
                "{\"guests\":2,\"requestedAt\":\"" + requestedAt + "\",\"preorder\":true}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(submitted.statusCode()).as(submitted.body()).isEqualTo(202);
        UUID reservationId = UUID.fromString(json.readTree(submitted.body()).path("reservationId").asText());
        UUID tableId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.dining_tables (id, name, capacity, zone, created_by, updated_by)
            VALUES (?, ?, 2, 'SALON', NULL, NULL)
            """, tableId, "Mesa revisión " + UUID.randomUUID());
        return new ReviewCase(hoursId, date, reservationId, tableId, tokenForRole("OPERATIONAL"));
    }

    private java.net.http.HttpResponse<String> decide(ReviewCase review, String decision) {
        return send("PUT", "/api/v1/operational/reservations/" + review.reservationId() + "/decision",
                review.staffToken(), """
                    {"decision":"%s","reason":"Revisión del horario solicitado","expectedVersion":1,"tableIds":["%s"]}
                    """.formatted(decision, review.tableId()), Map.of());
    }

    private void cleanup(ReviewCase review) {
        jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", review.hoursId());
        jdbc.update("DELETE FROM wok.business_hours_overrides WHERE service_type = 'DINE_IN' AND service_date = ?",
                review.serviceDate());
    }

    private record ReviewCase(UUID hoursId, LocalDate serviceDate, UUID reservationId, UUID tableId, String staffToken) {}
}
