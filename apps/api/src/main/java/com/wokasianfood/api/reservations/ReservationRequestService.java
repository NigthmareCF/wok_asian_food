package com.wokasianfood.api.reservations;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Persists a client reservation request without treating a policy assessment as confirmation. */
@Service
public class ReservationRequestService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final JdbcTemplate jdbc;
    private final OperationalCapacityService capacity;
    private final OccupancyEstimator occupancy;
    private final ModifierSelectionService modifiers;

    public ReservationRequestService(JdbcTemplate jdbc, OperationalCapacityService capacity, OccupancyEstimator occupancy,
                                     ModifierSelectionService modifiers) {
        this.jdbc = jdbc;
        this.capacity = capacity;
        this.occupancy = occupancy;
        this.modifiers = modifiers;
    }

    @Transactional
    public Result submit(UUID userId, UUID requestId, Request request) {
        lockRequest(requestId);
        List<RequestedItem> requestedItems = request.items() == null ? List.of() : request.items();
        if (requestedItems.size() > 20 || requestedItems.stream().anyMatch(item -> item == null || item.menuItemId() == null
                || item.quantity() < 1 || item.quantity() > 50 || (item.modifierIds() != null &&
                (item.modifierIds().size() > 30 || item.modifierIds().stream().anyMatch(java.util.Objects::isNull))))
                || requestedItems.stream().map(RequestedItem::menuItemId).distinct().count() != requestedItems.size())
            throw new AuthException(422, "Revisa los productos de la preorden.");
        String payloadHash = hashRequest(request);
        Result replay = findReplay(userId, requestId, payloadHash);
        if (replay != null) return replay;
        requireReservationRequestsEnabled();
        List<PreorderLine> preorderLines = requestedItems.stream().map(this::snapshotItem).toList();

        var assessment = capacity.assessTable(request.guests(), request.requestedAt(), Instant.now(), request.preorder());
        var estimate = assessment.occupancy() == null ? occupancy.estimate(request.guests()) : assessment.occupancy();
        UUID reservationId = null;
        if (assessment.decision() != OperationalCapacityService.Decision.REJECT
                && assessment.decision() != OperationalCapacityService.Decision.SUGGEST_OTHER_TIME) {
            List<UUID> customerIds = jdbc.query("""
                SELECT cp.id FROM wok.customer_profiles cp
                JOIN wok.users u ON u.id = cp.user_id
                WHERE u.id = ? AND u.status = 'ACTIVE'
                """, (rs, row) -> rs.getObject(1, UUID.class), userId);
            if (customerIds.isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No active customer profile");
            UUID customerId = customerIds.getFirst();
            Instant endsAt = request.requestedAt().plus(Duration.ofMinutes(estimate.maximumMinutes()));
            reservationId = jdbc.queryForObject("""
                INSERT INTO wok.reservations
                    (customer_id, party_size, reservation_at, ends_at, status, notes, created_by)
                VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?)
                RETURNING id
                """, UUID.class, customerId, request.guests(), Timestamp.from(request.requestedAt()),
                Timestamp.from(endsAt), request.notes(), userId);
            jdbc.update("""
                INSERT INTO wok.reservation_status_history
                    (reservation_id, from_status, to_status, reason, actor_user_id)
                VALUES (?, NULL, 'REQUESTED', 'CLIENT_REQUEST', ?)
                """, reservationId, userId);
        }

        jdbc.update("""
            INSERT INTO wok.reservation_evaluations
                (reservation_id, requester_user_id, request_id, request_payload_hash, decision, reason_codes, alternatives, conditions,
                 estimated_occupancy_minutes, minimum_occupancy_minutes, public_message, policy_version,
                 requested_for_at, party_size)
            VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ?, 'capacity-v1', ?, ?)
            """, reservationId, userId, requestId, payloadHash, assessment.decision().name(), encodeStrings(assessment.reasonCodes()),
            encodeInstants(assessment.alternativeTimes()), encodeStrings(List.of("PREORDER=" + request.preorder())), estimate.maximumMinutes(),
            estimate.minimumMinutes(), assessment.publicMessage(), Timestamp.from(request.requestedAt()), request.guests());
        for (PreorderLine line : preorderLines) {
            UUID lineId = jdbc.queryForObject("""
                INSERT INTO wok.reservation_request_items
                    (request_id, menu_item_id, name_snapshot, quantity, unit_price, currency_id)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class, requestId, line.menuItemId(), line.name(), line.quantity(), line.unitPrice(), line.currencyId());
            for (ModifierSelectionService.SelectedModifier modifier : line.modifiers()) {
                jdbc.update("""
                    INSERT INTO wok.reservation_request_item_modifiers
                        (reservation_request_item_id, modifier_id, group_name_snapshot, modifier_name_snapshot, price_delta)
                    VALUES (?, ?, ?, ?, ?)
                    """, lineId, modifier.id(), modifier.groupName(), modifier.name(), modifier.priceDelta());
            }
        }
        return new Result(requestId, reservationId, reservationId != null, assessment.decision(),
                assessment.reasonCodes(), estimate.minimumMinutes(), estimate.maximumMinutes(), assessment.publicMessage(),
                assessment.alternativeTimes());
    }

    private void requireReservationRequestsEnabled() {
        List<String> statuses = jdbc.query("""
            SELECT status FROM wok.service_capabilities
            WHERE code = 'RESERVATIONS'
              AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
            FOR SHARE
            """, (rs, row) -> rs.getString("status"));
        if (statuses.isEmpty() || "PAUSED".equals(statuses.getFirst()) || "DISABLED".equals(statuses.getFirst()))
            throw new AuthException(503, "Las solicitudes de reserva están temporalmente pausadas.");
    }

    @Transactional
    public OperationalCapacityService.Assessment evaluateCapacity(int guests, Instant requestedAt, boolean preorder) {
        requireReservationRequestsEnabled();
        return capacity.assessTable(guests, requestedAt, Instant.now(), preorder);
    }

    public List<HistoryItem> history(UUID userId) {
        List<HistoryItem> history = jdbc.query("""
            SELECT e.request_id, e.reservation_id, e.requested_for_at, e.party_size, e.decision,
                   e.public_message, e.alternatives::text AS alternatives, e.evaluated_at, r.status AS reservation_status
            FROM wok.reservation_evaluations e
            LEFT JOIN wok.reservations r ON r.id = e.reservation_id
            WHERE e.requester_user_id = ?
            ORDER BY e.evaluated_at DESC, e.request_id DESC
            LIMIT 50
            """, (rs, row) -> new HistoryItem(
                rs.getObject("request_id", UUID.class), rs.getObject("reservation_id", UUID.class),
                instantOrNull(rs.getTimestamp("requested_for_at")),
                (Integer) rs.getObject("party_size"), OperationalCapacityService.Decision.valueOf(rs.getString("decision")),
                rs.getString("reservation_status"), rs.getString("public_message"),
                decodeInstants(rs.getString("alternatives")), rs.getTimestamp("evaluated_at").toInstant(), List.of()), userId);
        if (history.isEmpty()) return List.of();
        Map<UUID, List<PreorderSnapshot>> preorders = loadHistoryPreorders(history.stream().map(HistoryItem::requestId).toList());
        return history.stream().map(item -> new HistoryItem(item.requestId(), item.reservationId(), item.requestedAt(), item.guests(),
                item.decision(), item.reservationStatus(), item.message(), item.alternativeTimes(), item.submittedAt(),
                preorders.getOrDefault(item.requestId(), List.of()))).toList();
    }

    private Map<UUID, List<PreorderSnapshot>> loadHistoryPreorders(List<UUID> requestIds) {
        String placeholders = String.join(",", java.util.Collections.nCopies(requestIds.size(), "?"));
        Map<UUID, MutablePreorderSnapshot> lines = new LinkedHashMap<>();
        jdbc.query("""
            SELECT i.request_id, i.id AS line_id, i.menu_item_id, i.name_snapshot, i.quantity, i.unit_price, c.code AS currency,
                   m.group_name_snapshot, m.modifier_name_snapshot, m.price_delta
            FROM wok.reservation_request_items i
            JOIN wok.currencies c ON c.id = i.currency_id
            LEFT JOIN wok.reservation_request_item_modifiers m ON m.reservation_request_item_id = i.id
            WHERE i.request_id IN (%s)
            ORDER BY i.request_id, i.id, m.id
            """.formatted(placeholders), rs -> {
                UUID lineId = rs.getObject("line_id", UUID.class);
                MutablePreorderSnapshot line = lines.computeIfAbsent(lineId, ignored -> new MutablePreorderSnapshot(
                        rsUuid(rs, "request_id"), rsUuid(rs, "menu_item_id"), rsString(rs, "name_snapshot"),
                        rsInt(rs, "quantity"), rsBigDecimal(rs, "unit_price"), rsString(rs, "currency")));
                if (rs.getObject("group_name_snapshot") != null)
                    line.modifiers.add(new PreorderModifierSnapshot(rsString(rs, "group_name_snapshot"),
                            rsString(rs, "modifier_name_snapshot"), rsBigDecimal(rs, "price_delta")));
            }, requestIds.toArray());
        Map<UUID, List<PreorderSnapshot>> result = new LinkedHashMap<>();
        for (MutablePreorderSnapshot line : lines.values()) result.computeIfAbsent(line.requestId, ignored -> new ArrayList<>()).add(line.freeze());
        result.replaceAll((ignored, value) -> List.copyOf(value));
        return Map.copyOf(result);
    }

    @Transactional
    public CancellationResult cancelPending(UUID userId, UUID reservationId) {
        List<String> statuses = jdbc.query("""
            SELECT r.status FROM wok.reservations r
            JOIN wok.customer_profiles cp ON cp.id = r.customer_id
            WHERE r.id = ? AND cp.user_id = ? FOR UPDATE OF r
            """, (rs, row) -> rs.getString("status"), reservationId, userId);
        if (statuses.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reservation not found");
        String status = statuses.getFirst();
        if ("CANCELLED".equals(status)) return new CancellationResult(reservationId, status);
        if (!"REQUESTED".equals(status))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only pending reservation requests can be cancelled by the client");
        int updated = jdbc.update("""
            UPDATE wok.reservations SET status = 'CANCELLED', cancelled_at = now(),
                cancellation_reason = 'CANCELLED_BY_CLIENT', updated_at = now(), updated_by = ?, row_version = row_version + 1
            WHERE id = ? AND status = 'REQUESTED'
            """, userId, reservationId);
        if (updated != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "Reservation state changed");
        jdbc.update("""
            INSERT INTO wok.reservation_status_history(reservation_id, from_status, to_status, reason, actor_user_id)
            VALUES (?, 'REQUESTED', 'CANCELLED', 'CANCELLED_BY_CLIENT', ?)
            """, reservationId, userId);
        return new CancellationResult(reservationId, "CANCELLED");
    }

    private Instant instantOrNull(Timestamp value) { return value == null ? null : value.toInstant(); }

    private void lockRequest(UUID requestId) {
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))")) {
                statement.setString(1, requestId.toString());
                statement.execute();
            }
            return null;
        });
    }

    private Result findReplay(UUID userId, UUID requestId, String payloadHash) {
        List<ResultRow> rows = jdbc.query("""
            SELECT e.reservation_id, e.decision,
                   ARRAY(SELECT jsonb_array_elements_text(e.reason_codes)) AS reason_codes,
                   e.alternatives::text AS alternatives,
                   e.minimum_occupancy_minutes,
                   e.estimated_occupancy_minutes, e.public_message, e.requester_user_id, e.request_payload_hash
            FROM wok.reservation_evaluations e
            WHERE e.request_id = ?
            """, (rs, row) -> new ResultRow(rs.getObject("reservation_id", UUID.class),
                OperationalCapacityService.Decision.valueOf(rs.getString("decision")),
                decodeReasons(rs.getArray("reason_codes")),
                rs.getInt("minimum_occupancy_minutes"), rs.getInt("estimated_occupancy_minutes"),
                rs.getString("public_message"), rs.getObject("requester_user_id", UUID.class),
                rs.getString("request_payload_hash"), decodeInstants(rs.getString("alternatives"))), requestId);
        if (rows.isEmpty()) return null;
        ResultRow row = rows.getFirst();
        if (!userId.equals(row.userId)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key already used");
        if (!payloadHash.equals(row.payloadHash))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was already used with different data.");
        return new Result(requestId, row.reservationId, row.reservationId != null, row.decision, row.reasons,
                row.minimumMinutes, row.maximumMinutes, row.message, row.alternatives);
    }

    private String encodeStrings(List<String> values) {
        return values.stream().map(value -> "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"")
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
    }

    private String encodeInstants(List<Instant> values) {
        return values.stream().map(value -> "\"" + value.toString() + "\"")
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
    }

    private String hashRequest(Request request) {
        List<RequestedItem> items = request.items() == null ? List.of() : request.items();
        String itemPayload = items.stream().sorted(java.util.Comparator.comparing(item -> item.menuItemId().toString()))
                .map(item -> item.menuItemId() + ":" + item.quantity() + ":" + (item.modifierIds() == null ? "" :
                        item.modifierIds().stream().map(UUID::toString).sorted().collect(java.util.stream.Collectors.joining(","))))
                .collect(java.util.stream.Collectors.joining(";"));
        String canonical = "reservation-request-v1\n" + request.guests() + "\n" + request.requestedAt()
                + "\n" + request.preorder() + "\n" + (request.notes() == null ? "" : request.notes())
                + (items.isEmpty() ? "" : "\n" + itemPayload);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is not available", error);
        }
    }

    private PreorderLine snapshotItem(RequestedItem item) {
        List<MenuItemRow> rows = jdbc.query("""
            SELECT mi.id, mi.name, mi.price, mi.currency_id
            FROM wok.menu_items mi
            JOIN wok.menu_categories mc ON mc.id = mi.category_id AND mc.active = true
            WHERE mi.id = ? AND mi.status = 'ACTIVE' AND mi.visibility = 'PUBLIC'
            FOR SHARE OF mi
            """, (rs, row) -> new MenuItemRow(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getBigDecimal("price"), rs.getObject("currency_id", UUID.class)), item.menuItemId());
        if (rows.isEmpty()) throw new AuthException(422, "Un producto de la preorden ya no está disponible en el menú.");
        MenuItemRow product = rows.getFirst();
        List<ModifierSelectionService.SelectedModifier> selected = modifiers.validate(product.id(), item.modifierIds());
        BigDecimal unitPrice = selected.stream().map(ModifierSelectionService.SelectedModifier::priceDelta)
                .reduce(product.price(), BigDecimal::add);
        return new PreorderLine(product.id(), product.name(), item.quantity(), unitPrice, product.currencyId(), selected);
    }

    private List<String> decodeReasons(java.sql.Array value) throws SQLException {
        if (value == null) return List.of();
        Object[] values = (Object[]) value.getArray();
        List<String> result = new ArrayList<>(values.length);
        for (Object item : values) result.add(String.valueOf(item));
        return List.copyOf(result);
    }

    private List<Instant> decodeInstants(String value) {
        if (value == null || value.isBlank()) return List.of();
        try {
            JsonNode values = JSON.readTree(value);
            List<Instant> result = new ArrayList<>(values.size());
            for (JsonNode item : values) result.add(Instant.parse(item.asText()));
            return List.copyOf(result);
        } catch (java.io.IOException error) {
            throw new IllegalStateException("Invalid reservation alternative times", error);
        }
    }

    private static UUID rsUuid(java.sql.ResultSet rs, String name) {
        try { return rs.getObject(name, UUID.class); } catch (SQLException error) { throw new IllegalStateException(error); }
    }
    private static int rsInt(java.sql.ResultSet rs, String name) {
        try { return rs.getInt(name); } catch (SQLException error) { throw new IllegalStateException(error); }
    }
    private static String rsString(java.sql.ResultSet rs, String name) {
        try { return rs.getString(name); } catch (SQLException error) { throw new IllegalStateException(error); }
    }
    private static BigDecimal rsBigDecimal(java.sql.ResultSet rs, String name) {
        try { return rs.getBigDecimal(name); } catch (SQLException error) { throw new IllegalStateException(error); }
    }

    private record ResultRow(UUID reservationId, OperationalCapacityService.Decision decision, List<String> reasons,
                             int minimumMinutes, int maximumMinutes, String message, UUID userId, String payloadHash,
                             List<Instant> alternatives) {}
    public record Request(int guests, Instant requestedAt, boolean preorder, String notes, List<RequestedItem> items) {}
    public record RequestedItem(UUID menuItemId, int quantity, List<UUID> modifierIds) {}
    private record MenuItemRow(UUID id, String name, BigDecimal price, UUID currencyId) {}
    private record PreorderLine(UUID menuItemId, String name, int quantity, BigDecimal unitPrice, UUID currencyId,
                                List<ModifierSelectionService.SelectedModifier> modifiers) {}
    public record Result(UUID requestId, UUID reservationId, boolean submitted,
                         OperationalCapacityService.Decision decision, List<String> reasonCodes,
                         int minimumOccupancyMinutes, int maximumOccupancyMinutes, String message,
                         List<Instant> alternativeTimes) {}
    public record HistoryItem(UUID requestId, UUID reservationId, Instant requestedAt, Integer guests,
                              OperationalCapacityService.Decision decision, String reservationStatus,
                              String message, List<Instant> alternativeTimes, Instant submittedAt,
                              List<PreorderSnapshot> preorderItems) {}
    public record PreorderSnapshot(UUID menuItemId, String name, int quantity, BigDecimal unitPrice, String currency,
                                   List<PreorderModifierSnapshot> modifiers) {}
    public record PreorderModifierSnapshot(String group, String name, BigDecimal priceDelta) {}
    public record CancellationResult(UUID reservationId, String status) {}

    private static final class MutablePreorderSnapshot {
        private final UUID requestId;
        private final UUID menuItemId;
        private final String name;
        private final int quantity;
        private final BigDecimal unitPrice;
        private final String currency;
        private final List<PreorderModifierSnapshot> modifiers = new ArrayList<>();
        private MutablePreorderSnapshot(UUID requestId, UUID menuItemId, String name, int quantity, BigDecimal unitPrice, String currency) {
            this.requestId = requestId; this.menuItemId = menuItemId; this.name = name; this.quantity = quantity;
            this.unitPrice = unitPrice; this.currency = currency;
        }
        private PreorderSnapshot freeze() { return new PreorderSnapshot(menuItemId, name, quantity, unitPrice, currency, List.copyOf(modifiers)); }
    }
}
