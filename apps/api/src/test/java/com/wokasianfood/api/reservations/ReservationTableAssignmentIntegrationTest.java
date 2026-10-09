package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReservationTableAssignmentIntegrationTest extends PostgresIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("America/Guatemala");
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void assignsMultipleSameZoneTablesAndReplaysWithoutDuplicating() throws Exception {
        ReservationCase reservation = createConfirmedReservation(3);
        UUID firstTable = createTable("Mesa de grupo " + UUID.randomUUID(), 2, "SALON");
        UUID secondTable = createTable("Mesa de grupo " + UUID.randomUUID(), 2, "SALON");
        UUID key = UUID.randomUUID();
        try {
            var assigned = assign(reservation, List.of(firstTable, secondTable), key);
            assertThat(assigned.statusCode()).as(assigned.body()).isEqualTo(201);
            JsonNode receipt = json.readTree(assigned.body());
            assertThat(receipt.path("rowVersion").asInt()).isEqualTo(3);
            assertThat(receipt.path("tables").size()).isEqualTo(2);
            assertThat(receipt.path("occupiedUntil").asText()).isEqualTo(reservation.endsAt().plusSeconds(20 * 60).toString());
            assertThat(count("SELECT count(*) FROM wok.reservation_table_assignments WHERE reservation_id = ? AND released_at IS NULL",
                    reservation.id())).isEqualTo(2);
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'RESERVATION_TABLES_ASSIGNED'",
                    reservation.id())).isEqualTo(1);

            var replayed = assign(reservation, List.of(secondTable, firstTable), key);
            assertThat(replayed.statusCode()).as(replayed.body()).isEqualTo(201);
            assertThat(json.readTree(replayed.body()).path("rowVersion").asInt()).isEqualTo(3);
            assertThat(count("SELECT count(*) FROM wok.reservation_table_assignments WHERE reservation_id = ? AND released_at IS NULL",
                    reservation.id())).isEqualTo(2);
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", reservation.hoursId());
        }
    }

    @Test
    void refusesAssignmentsWhoseCombinedCapacityIsTooSmall() throws Exception {
        ReservationCase reservation = createConfirmedReservation(3);
        UUID tableId = createTable("Mesa pequeña " + UUID.randomUUID(), 2, "SALON");
        try {
            var response = assign(reservation, List.of(tableId), UUID.randomUUID());
            assertThat(response.statusCode()).as(response.body()).isEqualTo(422);
            assertThat(count("SELECT count(*) FROM wok.reservation_table_assignments WHERE reservation_id = ?",
                    reservation.id())).isZero();
            assertThat(jdbc.queryForObject("SELECT row_version FROM wok.reservations WHERE id = ?", Integer.class,
                    reservation.id())).isEqualTo(2);
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", reservation.hoursId());
        }
    }

    @Test
    void databasePreventsOverlappingReservationsFromUsingTheSameTable() throws Exception {
        ReservationCase first = createConfirmedReservation(2);
        UUID tableId = createTable("Mesa exclusiva " + UUID.randomUUID(), 4, "SALON");
        ReservationCase second = createConfirmedReservation(2, first.startsAt());
        try {
            var firstResult = assign(first, List.of(tableId), UUID.randomUUID());
            assertThat(firstResult.statusCode()).as(firstResult.body()).isEqualTo(201);

            var conflict = assign(second, List.of(tableId), UUID.randomUUID());
            assertThat(conflict.statusCode()).as(conflict.body()).isEqualTo(409);
            assertThat(jdbc.queryForObject("SELECT row_version FROM wok.reservations WHERE id = ?", Integer.class,
                    second.id())).isEqualTo(2);
            assertThat(count("SELECT count(*) FROM wok.reservation_table_assignments WHERE reservation_id = ?",
                    second.id())).isZero();
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", first.hoursId());
        }
    }

    @Test
    void releasesAssignmentsIdempotentlyAndMakesTheTableAvailableAgain() throws Exception {
        ReservationCase first = createConfirmedReservation(2);
        ReservationCase second = createConfirmedReservation(2, first.startsAt());
        UUID tableId = createTable("Mesa reasignable " + UUID.randomUUID(), 4, "SALON");
        try {
            var assigned = assign(first, List.of(tableId), UUID.randomUUID());
            assertThat(assigned.statusCode()).as(assigned.body()).isEqualTo(201);

            UUID releaseKey = UUID.randomUUID();
            var released = release(first, releaseKey);
            assertThat(released.statusCode()).as(released.body()).isEqualTo(200);
            JsonNode releaseReceipt = json.readTree(released.body());
            assertThat(releaseReceipt.path("rowVersion").asInt()).isEqualTo(4);
            assertThat(releaseReceipt.path("releasedTableCount").asInt()).isEqualTo(1);
            assertThat(releaseReceipt.path("idempotentReplay").asBoolean()).isFalse();
            assertThat(count("SELECT count(*) FROM wok.reservation_table_assignments WHERE reservation_id = ? AND released_at IS NULL",
                    first.id())).isZero();

            var replayed = release(first, releaseKey);
            assertThat(replayed.statusCode()).as(replayed.body()).isEqualTo(200);
            assertThat(json.readTree(replayed.body()).path("idempotentReplay").asBoolean()).isTrue();
            assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'RESERVATION_TABLES_RELEASED'",
                    first.id())).isEqualTo(1);

            var nextAssignment = assign(second, List.of(tableId), UUID.randomUUID());
            assertThat(nextAssignment.statusCode()).as(nextAssignment.body()).isEqualTo(201);
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", first.hoursId());
        }
    }

    @Test
    void operationalScheduleGroupsReservationsWithTheirCurrentTableAssignments() throws Exception {
        ReservationCase reservation = createConfirmedReservation(3);
        UUID firstTable = createTable("Agenda mesa A " + UUID.randomUUID(), 2, "SALON");
        UUID secondTable = createTable("Agenda mesa B " + UUID.randomUUID(), 2, "SALON");
        try {
            var assignment = assign(reservation, List.of(firstTable, secondTable), UUID.randomUUID());
            assertThat(assignment.statusCode()).as(assignment.body()).isEqualTo(201);

            Instant from = reservation.startsAt().minusSeconds(60 * 60);
            Instant to = reservation.startsAt().plusSeconds(60 * 60);
            String path = "/api/v1/operational/reservations/schedule?from=" + from + "&to=" + to + "&status=CONFIRMED";
            var response = get(path, reservation.staffToken());
            assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
            JsonNode schedule = json.readTree(response.body());
            JsonNode item = java.util.stream.StreamSupport.stream(schedule.spliterator(), false)
                    .filter(candidate -> reservation.id().toString().equals(candidate.path("reservationId").asText()))
                    .findFirst().orElseThrow();
            assertThat(item.path("reservationId").asText()).isEqualTo(reservation.id().toString());
            assertThat(item.path("status").asText()).isEqualTo("CONFIRMED");
            assertThat(item.path("tables")).hasSize(2);
            assertThat(item.path("tables").findValuesAsText("id")).containsExactlyInAnyOrder(firstTable.toString(), secondTable.toString());

            assertThat(get(path, tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
            assertThat(get("/api/v1/operational/reservations/schedule?from=" + to + "&to=" + from,
                    reservation.staffToken()).statusCode()).isEqualTo(400);
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", reservation.hoursId());
        }
    }

    @Test
    void tableAssignmentOptionsReflectScheduleAndCurrentTableState() throws Exception {
        ReservationCase first = createConfirmedReservation(2);
        ReservationCase second = createConfirmedReservation(2, first.startsAt());
        UUID conflictingTable = createTable("Mesa ocupada por reserva " + UUID.randomUUID(), 4, "SALON");
        UUID freeTable = createTable("Mesa libre " + UUID.randomUUID(), 4, "SALON");
        UUID occupiedTable = createTable("Mesa ocupada " + UUID.randomUUID(), 4, "SALON");
        UUID inactiveTable = createTable("Mesa inactiva " + UUID.randomUUID(), 4, "SALON");
        try {
            assertThat(assign(first, List.of(conflictingTable), UUID.randomUUID()).statusCode()).isEqualTo(201);
            jdbc.update("UPDATE wok.dining_tables SET current_status = 'OCCUPIED' WHERE id = ?", occupiedTable);
            jdbc.update("UPDATE wok.dining_tables SET active = false WHERE id = ?", inactiveTable);

            String path = "/api/v1/operational/reservations/" + second.id() + "/table-assignment-options";
            var response = get(path, second.staffToken());
            assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
            JsonNode options = json.readTree(response.body());
            assertThat(options.path("guests").asInt()).isEqualTo(2);
            assertThat(options.path("occupiedUntil").asText()).isEqualTo(second.endsAt().plusSeconds(20 * 60).toString());

            JsonNode tables = options.path("tables");
            assertThat(option(tables, freeTable).path("assignable").asBoolean()).isTrue();
            assertThat(option(tables, conflictingTable).path("unavailableReason").asText()).isEqualTo("SCHEDULE_CONFLICT");
            assertThat(option(tables, occupiedTable).path("unavailableReason").asText()).isEqualTo("TABLE_NOT_FREE");
            assertThat(option(tables, inactiveTable).path("unavailableReason").asText()).isEqualTo("INACTIVE");
            assertThat(get(path, tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
            assertThat(get("/api/v1/operational/reservations/" + UUID.randomUUID() + "/table-assignment-options",
                    second.staffToken()).statusCode()).isEqualTo(404);
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", first.hoursId());
        }
    }

    @Test
    void assignmentOptionsAreAvailableOnlyAfterStaffConfirmation() throws Exception {
        LocalDate date = LocalDate.now(ZONE).plusDays(8);
        Instant startsAt = date.atTime(LocalTime.of(16, 0)).atZone(ZONE).toInstant();
        UUID hoursId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.business_hours (id, service_type, weekday, opens_at, closes_at, timezone_name)
            VALUES (?, 'DINE_IN', ?, '14:00', '22:00', 'America/Guatemala')
            ON CONFLICT (service_type, weekday) DO NOTHING
            """, hoursId, date.getDayOfWeek().getValue());
        UUID configuredHoursId = jdbc.queryForObject("SELECT id FROM wok.business_hours WHERE service_type = 'DINE_IN' AND weekday = ?",
                UUID.class, date.getDayOfWeek().getValue());
        UUID client = createUserWithRole("table-options-pending-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        jdbc.update("INSERT INTO wok.customer_profiles (user_id, full_name) VALUES (?, 'Cliente pendiente')", client);
        try {
            var submitted = post("/api/v1/client/reservations", tokenFor(client),
                    "{\"guests\":2,\"requestedAt\":\"%s\",\"preorder\":true}".formatted(startsAt),
                    Map.of("Idempotency-Key", UUID.randomUUID().toString()));
            UUID reservationId = UUID.fromString(json.readTree(submitted.body()).path("reservationId").asText());
            assertThat(submitted.statusCode()).isEqualTo(202);
            var response = get("/api/v1/operational/reservations/" + reservationId + "/table-assignment-options",
                    tokenForRole("OPERATIONAL"));
            assertThat(response.statusCode()).isEqualTo(409);
        } finally {
            jdbc.update("DELETE FROM wok.business_hours WHERE id = ?", configuredHoursId);
        }
    }

    private JsonNode option(JsonNode options, UUID tableId) {
        return java.util.stream.StreamSupport.stream(options.spliterator(), false)
                .filter(option -> tableId.toString().equals(option.path("id").asText()))
                .findFirst().orElseThrow();
    }

    private ReservationCase createConfirmedReservation(int guests) throws Exception {
        LocalDate date = LocalDate.now(ZONE).plusDays(8);
        Instant startsAt = date.atTime(LocalTime.of(16, 0)).atZone(ZONE).toInstant();
        return createConfirmedReservation(guests, startsAt);
    }

    private ReservationCase createConfirmedReservation(int guests, Instant startsAt) throws Exception {
        LocalDate date = startsAt.atZone(ZONE).toLocalDate();
        UUID hoursId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.business_hours (id, service_type, weekday, opens_at, closes_at, timezone_name)
            VALUES (?, 'DINE_IN', ?, '14:00', '22:00', 'America/Guatemala')
            ON CONFLICT (service_type, weekday) DO NOTHING
            """, hoursId, date.getDayOfWeek().getValue());
        UUID configuredHoursId = jdbc.queryForObject("SELECT id FROM wok.business_hours WHERE service_type = 'DINE_IN' AND weekday = ?",
                UUID.class, date.getDayOfWeek().getValue());

        UUID client = createUserWithRole("table-assignment-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        jdbc.update("INSERT INTO wok.customer_profiles (user_id, full_name) VALUES (?, 'Cliente de prueba')", client);
        var submitted = post("/api/v1/client/reservations", tokenFor(client), """
            {"guests":%d,"requestedAt":"%s","preorder":true}
            """.formatted(guests, startsAt), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(submitted.statusCode()).as(submitted.body()).isEqualTo(202);
        UUID reservationId = UUID.fromString(json.readTree(submitted.body()).path("reservationId").asText());
        String staffToken = tokenForRole("OPERATIONAL");
        var confirmed = send("PUT", "/api/v1/operational/reservations/" + reservationId + "/decision", staffToken,
                "{\"decision\":\"CONFIRM\",\"reason\":\"Horario y capacidad revisados\",\"expectedVersion\":1}", Map.of());
        assertThat(confirmed.statusCode()).as(confirmed.body()).isEqualTo(200);
        Instant endsAt = jdbc.queryForObject("SELECT ends_at FROM wok.reservations WHERE id = ?", (rs, row) -> rs.getTimestamp(1).toInstant(), reservationId);
        return new ReservationCase(configuredHoursId, reservationId, staffToken, startsAt, endsAt);
    }

    private UUID createTable(String name, int capacity, String zone) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.dining_tables (id, name, capacity, zone, created_by, updated_by) VALUES (?, ?, ?, ?, NULL, NULL)",
                id, name, capacity, zone);
        return id;
    }

    private java.net.http.HttpResponse<String> assign(ReservationCase reservation, java.util.List<UUID> tableIds, UUID key) {
        return assign(reservation, tableIds, key, 2);
    }

    private java.net.http.HttpResponse<String> assign(ReservationCase reservation, java.util.List<UUID> tableIds, UUID key, int expectedVersion) {
        String ids = tableIds.stream().map(id -> "\"" + id + "\"").collect(java.util.stream.Collectors.joining(","));
        return post("/api/v1/operational/reservations/" + reservation.id() + "/table-assignments", reservation.staffToken(),
                ("{\"tableIds\":[%s],\"expectedVersion\":%d,\"reason\":\"Asignación confirmada para el grupo\"}").formatted(ids, expectedVersion),
                Map.of("Idempotency-Key", key.toString()));
    }

    private java.net.http.HttpResponse<String> release(ReservationCase reservation, UUID key) {
        return post("/api/v1/operational/reservations/" + reservation.id() + "/table-assignments/release", reservation.staffToken(),
                "{\"expectedVersion\":3,\"reason\":\"Cambio de asignación antes de la llegada\"}",
                Map.of("Idempotency-Key", key.toString()));
    }

    private int count(String sql, UUID value) {
        return jdbc.queryForObject(sql, Integer.class, value);
    }

    private record ReservationCase(UUID hoursId, UUID id, String staffToken, Instant startsAt, Instant endsAt) {}
}
