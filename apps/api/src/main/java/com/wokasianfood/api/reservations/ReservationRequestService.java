package com.wokasianfood.api.reservations;

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
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Persists a client reservation request without treating a policy assessment as confirmation. */
@Service
public class ReservationRequestService {
    private final JdbcTemplate jdbc;
    private final OperationalCapacityService capacity;
    private final OccupancyEstimator occupancy;

    public ReservationRequestService(JdbcTemplate jdbc, OperationalCapacityService capacity, OccupancyEstimator occupancy) {
        this.jdbc = jdbc;
        this.capacity = capacity;
        this.occupancy = occupancy;
    }

    @Transactional
    public Result submit(UUID userId, UUID requestId, Request request) {
        lockRequest(requestId);
        String payloadHash = hashRequest(request);
        Result replay = findReplay(userId, requestId, payloadHash);
        if (replay != null) return replay;

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
            VALUES (?, ?, ?, ?, ?, ?::jsonb, '[]'::jsonb, ?::jsonb, ?, ?, ?, 'capacity-v1', ?, ?)
            """, reservationId, userId, requestId, payloadHash, assessment.decision().name(), encodeStrings(assessment.reasonCodes()),
            encodeStrings(List.of("PREORDER=" + request.preorder())), estimate.maximumMinutes(),
            estimate.minimumMinutes(), assessment.publicMessage(), Timestamp.from(request.requestedAt()), request.guests());
        return new Result(requestId, reservationId, reservationId != null, assessment.decision(),
                assessment.reasonCodes(), estimate.minimumMinutes(), estimate.maximumMinutes(), assessment.publicMessage());
    }

    public List<HistoryItem> history(UUID userId) {
        return jdbc.query("""
            SELECT e.request_id, e.reservation_id, e.requested_for_at, e.party_size, e.decision,
                   e.public_message, e.evaluated_at, r.status AS reservation_status
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
                rs.getTimestamp("evaluated_at").toInstant()), userId);
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
                   e.minimum_occupancy_minutes,
                   e.estimated_occupancy_minutes, e.public_message, e.requester_user_id, e.request_payload_hash
            FROM wok.reservation_evaluations e
            WHERE e.request_id = ?
            """, (rs, row) -> new ResultRow(rs.getObject("reservation_id", UUID.class),
                OperationalCapacityService.Decision.valueOf(rs.getString("decision")),
                decodeReasons(rs.getArray("reason_codes")),
                rs.getInt("minimum_occupancy_minutes"), rs.getInt("estimated_occupancy_minutes"),
                rs.getString("public_message"), rs.getObject("requester_user_id", UUID.class),
                rs.getString("request_payload_hash")), requestId);
        if (rows.isEmpty()) return null;
        ResultRow row = rows.getFirst();
        if (!userId.equals(row.userId)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key already used");
        if (!payloadHash.equals(row.payloadHash))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was already used with different data.");
        return new Result(requestId, row.reservationId, row.reservationId != null, row.decision, row.reasons,
                row.minimumMinutes, row.maximumMinutes, row.message);
    }

    private String encodeStrings(List<String> values) {
        return values.stream().map(value -> "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"")
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
    }

    private String hashRequest(Request request) {
        String canonical = "reservation-request-v1\n" + request.guests() + "\n" + request.requestedAt()
                + "\n" + request.preorder() + "\n" + (request.notes() == null ? "" : request.notes());
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is not available", error);
        }
    }

    private List<String> decodeReasons(java.sql.Array value) throws SQLException {
        if (value == null) return List.of();
        Object[] values = (Object[]) value.getArray();
        List<String> result = new ArrayList<>(values.length);
        for (Object item : values) result.add(String.valueOf(item));
        return List.copyOf(result);
    }

    private record ResultRow(UUID reservationId, OperationalCapacityService.Decision decision, List<String> reasons,
                             int minimumMinutes, int maximumMinutes, String message, UUID userId, String payloadHash) {}
    public record Request(int guests, Instant requestedAt, boolean preorder, String notes) {}
    public record Result(UUID requestId, UUID reservationId, boolean submitted,
                         OperationalCapacityService.Decision decision, List<String> reasonCodes,
                         int minimumOccupancyMinutes, int maximumOccupancyMinutes, String message) {}
    public record HistoryItem(UUID requestId, UUID reservationId, Instant requestedAt, Integer guests,
                              OperationalCapacityService.Decision decision, String reservationStatus,
                              String message, Instant submittedAt) {}
}
