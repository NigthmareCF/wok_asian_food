package com.wokasianfood.api.reservations;

import com.wokasianfood.api.identity.AuthException;
import java.time.Duration;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@RestController
@RequestMapping("/api/v1/operational/reservations")
@PreAuthorize("hasAnyRole('OPERATIONAL', 'ADMIN')")
public class OperationalReservationScheduleController {
    private final OperationalReservationScheduleService schedule;

    public OperationalReservationScheduleController(OperationalReservationScheduleService schedule) {
        this.schedule = schedule;
    }

    @GetMapping("/schedule")
    public List<ScheduledReservation> list(
            @RequestParam Instant from, @RequestParam Instant to,
            @RequestParam(required = false) String status) {
        return schedule.list(from, to, status);
    }

    public record ScheduledReservation(UUID reservationId, String status, int guests, Instant reservationAt,
                                       Instant estimatedEndAt, String notes, int rowVersion, String customerName,
                                       String email, List<AssignedTable> tables, List<PreorderItem> preorderItems) {}
    public record PreorderItem(UUID menuItemId, String name, int quantity, java.math.BigDecimal unitPrice,
                               String currency, List<PreorderModifier> modifiers) {}
    public record PreorderModifier(String group, String name, java.math.BigDecimal priceDelta) {}
    public record AssignedTable(UUID id, String name, Integer capacity, String zone,
                                Instant occupiedFrom, Instant occupiedUntil) {}
}

@Service
class OperationalReservationScheduleService {
    private static final Duration MAX_WINDOW = Duration.ofDays(31);
    private static final List<String> SCHEDULE_STATUSES = List.of("REQUESTED", "CONFIRMED", "ARRIVED");
    private final JdbcTemplate jdbc;

    OperationalReservationScheduleService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    List<OperationalReservationScheduleController.ScheduledReservation> list(Instant from, Instant to, String status) {
        if (!from.isBefore(to) || Duration.between(from, to).compareTo(MAX_WINDOW) > 0)
            throw new AuthException(400, "El rango debe ser válido y no puede superar 31 días.");
        String filter = status == null || status.isBlank() ? null : status.trim().toUpperCase(java.util.Locale.ROOT);
        if (filter != null && !SCHEDULE_STATUSES.contains(filter))
            throw new AuthException(400, "El estado debe ser REQUESTED, CONFIRMED o ARRIVED.");

        List<ScheduleRow> rows = jdbc.query("""
            SELECT r.id AS reservation_id, r.status, r.party_size, r.reservation_at, r.ends_at,
                   r.notes, r.row_version, cp.full_name, u.email,
                   a.table_id, t.name AS table_name, t.capacity AS table_capacity, t.zone AS table_zone,
                   lower(a.occupied_period) AS occupied_from, upper(a.occupied_period) AS occupied_until
            FROM wok.reservations r
            JOIN wok.customer_profiles cp ON cp.id = r.customer_id
            LEFT JOIN wok.users u ON u.id = cp.user_id
            LEFT JOIN wok.reservation_table_assignments a ON a.reservation_id = r.id AND a.released_at IS NULL
            LEFT JOIN wok.dining_tables t ON t.id = a.table_id
            WHERE r.reservation_at >= ? AND r.reservation_at < ?
              AND r.status IN ('REQUESTED', 'CONFIRMED', 'ARRIVED')
              AND (CAST(? AS text) IS NULL OR r.status = CAST(? AS text))
            ORDER BY r.reservation_at, r.id, t.name
            """, (rs, row) -> new ScheduleRow(rs.getObject("reservation_id", UUID.class), rs.getString("status"),
                rs.getInt("party_size"), rs.getTimestamp("reservation_at").toInstant(), rs.getTimestamp("ends_at").toInstant(),
                rs.getString("notes"), rs.getInt("row_version"), rs.getString("full_name"), rs.getString("email"),
                rs.getObject("table_id", UUID.class), rs.getString("table_name"), rs.getObject("table_capacity", Integer.class),
                rs.getString("table_zone"), rs.getTimestamp("occupied_from") == null ? null : rs.getTimestamp("occupied_from").toInstant(),
                rs.getTimestamp("occupied_until") == null ? null : rs.getTimestamp("occupied_until").toInstant()),
                Timestamp.from(from), Timestamp.from(to), filter, filter);

        Map<UUID, MutableReservation> grouped = new LinkedHashMap<>();
        for (ScheduleRow row : rows) {
            MutableReservation reservation = grouped.computeIfAbsent(row.id(), ignored -> new MutableReservation(row));
            if (row.tableId() != null) reservation.tables().add(new OperationalReservationScheduleController.AssignedTable(row.tableId(), row.tableName(),
                    row.tableCapacity(), row.tableZone(), row.occupiedFrom(), row.occupiedUntil()));
        }
        Map<UUID, List<OperationalReservationScheduleController.PreorderItem>> preorders = loadPreorders(List.copyOf(grouped.keySet()));
        return grouped.values().stream().map(row -> row.freeze(preorders.getOrDefault(row.row.id(), List.of()))).toList();
    }

    private Map<UUID, List<OperationalReservationScheduleController.PreorderItem>> loadPreorders(List<UUID> reservationIds) {
        if (reservationIds.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(reservationIds.size(), "?"));
        Map<UUID, MutablePreorder> items = new LinkedHashMap<>();
        jdbc.query("""
            SELECT e.reservation_id, i.id AS line_id, i.menu_item_id, i.name_snapshot, i.quantity, i.unit_price,
                   c.code AS currency, m.group_name_snapshot, m.modifier_name_snapshot, m.price_delta
            FROM wok.reservation_evaluations e
            JOIN wok.reservation_request_items i ON i.request_id = e.request_id
            JOIN wok.currencies c ON c.id = i.currency_id
            LEFT JOIN wok.reservation_request_item_modifiers m ON m.reservation_request_item_id = i.id
            WHERE e.reservation_id IN (%s)
            ORDER BY e.reservation_id, i.id, m.id
            """.formatted(placeholders), rs -> {
                UUID reservationId = rs.getObject("reservation_id", UUID.class);
                UUID lineId = rs.getObject("line_id", UUID.class);
                MutablePreorder item = items.computeIfAbsent(lineId, ignored -> new MutablePreorder(reservationId,
                        rsUuid(rs, "menu_item_id"), rsString(rs, "name_snapshot"), rsInt(rs, "quantity"),
                        rsBigDecimal(rs, "unit_price"), rsString(rs, "currency")));
                if (rs.getObject("group_name_snapshot") != null)
                    item.modifiers.add(new OperationalReservationScheduleController.PreorderModifier(
                            rsString(rs, "group_name_snapshot"), rsString(rs, "modifier_name_snapshot"), rsBigDecimal(rs, "price_delta")));
            }, reservationIds.toArray());
        Map<UUID, List<OperationalReservationScheduleController.PreorderItem>> result = new LinkedHashMap<>();
        for (MutablePreorder item : items.values()) result.computeIfAbsent(item.reservationId, ignored -> new ArrayList<>()).add(item.freeze());
        result.replaceAll((ignored, value) -> List.copyOf(value));
        return Map.copyOf(result);
    }

    private static UUID rsUuid(java.sql.ResultSet rs, String name) {
        try { return rs.getObject(name, UUID.class); } catch (java.sql.SQLException error) { throw new IllegalStateException(error); }
    }
    private static int rsInt(java.sql.ResultSet rs, String name) {
        try { return rs.getInt(name); } catch (java.sql.SQLException error) { throw new IllegalStateException(error); }
    }
    private static String rsString(java.sql.ResultSet rs, String name) {
        try { return rs.getString(name); } catch (java.sql.SQLException error) { throw new IllegalStateException(error); }
    }
    private static java.math.BigDecimal rsBigDecimal(java.sql.ResultSet rs, String name) {
        try { return rs.getBigDecimal(name); } catch (java.sql.SQLException error) { throw new IllegalStateException(error); }
    }

    private record ScheduleRow(UUID id, String status, int guests, Instant reservationAt, Instant estimatedEndAt,
                               String notes, int rowVersion, String customerName, String email,
                               UUID tableId, String tableName, Integer tableCapacity, String tableZone,
                               Instant occupiedFrom, Instant occupiedUntil) {}
    private static final class MutableReservation {
        private final ScheduleRow row;
        private final List<OperationalReservationScheduleController.AssignedTable> tables = new ArrayList<>();
        private MutableReservation(ScheduleRow row) { this.row = row; }
        List<OperationalReservationScheduleController.AssignedTable> tables() { return tables; }
        OperationalReservationScheduleController.ScheduledReservation freeze(List<OperationalReservationScheduleController.PreorderItem> preorderItems) {
            return new OperationalReservationScheduleController.ScheduledReservation(row.id(), row.status(), row.guests(), row.reservationAt(), row.estimatedEndAt(),
                    row.notes(), row.rowVersion(), row.customerName(), row.email(), List.copyOf(tables), preorderItems);
        }
    }
    private static final class MutablePreorder {
        private final UUID reservationId;
        private final UUID menuItemId;
        private final String name;
        private final int quantity;
        private final java.math.BigDecimal unitPrice;
        private final String currency;
        private final List<OperationalReservationScheduleController.PreorderModifier> modifiers = new ArrayList<>();
        private MutablePreorder(UUID reservationId, UUID menuItemId, String name, int quantity,
                                java.math.BigDecimal unitPrice, String currency) {
            this.reservationId = reservationId; this.menuItemId = menuItemId; this.name = name;
            this.quantity = quantity; this.unitPrice = unitPrice; this.currency = currency;
        }
        OperationalReservationScheduleController.PreorderItem freeze() {
            return new OperationalReservationScheduleController.PreorderItem(menuItemId, name, quantity, unitPrice,
                    currency, List.copyOf(modifiers));
        }
    }
}
