package com.wokasianfood.api.cash;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/operational/cash-sessions")
@PreAuthorize("hasAnyRole('OPERATIONAL', 'ADMIN')")
public class CashSessionController {
    private final CashSessionService service;
    public CashSessionController(CashSessionService service) { this.service = service; }

    @PostMapping
    public CashSession open(@AuthenticationPrincipal Jwt jwt,
                            @RequestHeader("Idempotency-Key") UUID requestId,
                            @Valid @RequestBody OpenRequest request) {
        return service.open(UUID.fromString(jwt.getSubject()), requestId, request.registerCode(), request.openingFloat());
    }
    @GetMapping("/{sessionId}")
    public CashSession get(@PathVariable UUID sessionId) { return service.get(sessionId); }
    @PostMapping("/{sessionId}/movements")
    public CashMovement movement(@PathVariable UUID sessionId, @AuthenticationPrincipal Jwt jwt,
                                 @RequestHeader("Idempotency-Key") UUID requestId,
                                 @Valid @RequestBody MovementRequest request) {
        return service.addMovement(sessionId, UUID.fromString(jwt.getSubject()), requestId, request);
    }
    @PostMapping("/{sessionId}/close")
    public CashSession close(@PathVariable UUID sessionId, @AuthenticationPrincipal Jwt jwt,
                             @Valid @RequestBody CloseRequest request) {
        return service.close(sessionId, UUID.fromString(jwt.getSubject()), request.countedCash(), request.expectedVersion());
    }

    public record OpenRequest(@NotBlank @Size(max = 32) String registerCode,
                              @NotNull @DecimalMin("0.00") BigDecimal openingFloat) {}
    public record MovementRequest(@NotNull MovementType type, @NotNull @DecimalMin(value = "0.01") BigDecimal amount,
                                  @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record CloseRequest(@NotNull @DecimalMin("0.00") BigDecimal countedCash, @Positive int expectedVersion) {}
    public enum MovementType { INCOME, EXPENSE, WITHDRAWAL }
    public record CashMovement(UUID id, UUID cashSessionId, MovementKind type, BigDecimal amountDelta,
                               String reason, UUID responsibleUserId, Instant occurredAt) {}
    public enum MovementKind { OPENING, SALE, INCOME, EXPENSE, WITHDRAWAL, REFUND, TIP_PAYOUT, REVERSAL }
    public record CashSession(UUID id, String registerCode, String status, BigDecimal expectedCash,
                              BigDecimal countedCash, BigDecimal difference, UUID openedBy, Instant openedAt,
                              UUID closedBy, Instant closedAt, int rowVersion, List<CashMovement> movements) {}
}

@Service
@Validated
class CashSessionService {
    private final JdbcTemplate jdbc;
    CashSessionService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public CashSessionController.CashSession open(UUID actor, UUID requestId, String registerCode, BigDecimal openingFloat) {
        lockRequest(requestId);
        String code = registerCode.trim().toUpperCase(java.util.Locale.ROOT);
        List<OpenReplay> replay = jdbc.query("""
            SELECT s.id, r.code AS register_code, m.amount_delta, m.responsible_user_id
            FROM wok.cash_movements m JOIN wok.cash_sessions s ON s.id = m.cash_session_id
            JOIN wok.cash_registers r ON r.id = s.cash_register_id
            WHERE m.request_id = ? AND m.movement_type = 'OPENING'
            """, (rs, row) -> new OpenReplay(rs.getObject("id", UUID.class), rs.getString("register_code"),
                rs.getBigDecimal("amount_delta"), rs.getObject("responsible_user_id", UUID.class)), requestId);
        if (!replay.isEmpty()) {
            OpenReplay previous = replay.getFirst();
            if (!actor.equals(previous.actor) || !code.equals(previous.registerCode)
                    || openingFloat.compareTo(previous.openingFloat) != 0)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "La clave de idempotencia ya se usó con otros datos.");
            return get(previous.sessionId);
        }
        UUID registerId = jdbc.query("SELECT id FROM wok.cash_registers WHERE code = ? AND active",
                (rs, row) -> rs.getObject(1, UUID.class), code).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "La caja indicada no está configurada."));
        try {
            UUID sessionId = jdbc.queryForObject("""
                INSERT INTO wok.cash_sessions (cash_register_id, opened_by, created_by)
                VALUES (?, ?, ?) RETURNING id
                """, UUID.class, registerId, actor, actor);
            jdbc.update("""
                INSERT INTO wok.cash_movements (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
                VALUES (?, 'OPENING', ?, 'Fondo de apertura', ?, ?)
                """, sessionId, openingFloat, actor, requestId);
            audit(actor, "CASH_SESSION_OPENED", sessionId, null, openingFloat, "OPEN_SESSION", requestId);
            return get(sessionId);
        } catch (DataIntegrityViolationException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe una sesión abierta para esta caja.");
        }
    }

    @Transactional(readOnly = true)
    public CashSessionController.CashSession get(UUID id) {
        List<SessionRow> rows = jdbc.query("""
            SELECT s.id, r.code AS register_code, s.status, s.opened_by, s.opened_at, s.closed_by, s.closed_at, s.row_version,
                   rec.expected_cash, rec.counted_cash, rec.difference
            FROM wok.cash_sessions s JOIN wok.cash_registers r ON r.id = s.cash_register_id
            LEFT JOIN wok.cash_reconciliations rec ON rec.cash_session_id = s.id AND rec.is_final
            WHERE s.id = ?
            """, (rs, row) -> new SessionRow(rs.getObject("id", UUID.class), rs.getString("register_code"),
                rs.getString("status"), rs.getObject("opened_by", UUID.class), rs.getTimestamp("opened_at").toInstant(),
                rs.getObject("closed_by", UUID.class), rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
                rs.getInt("row_version"), rs.getBigDecimal("expected_cash"), rs.getBigDecimal("counted_cash"), rs.getBigDecimal("difference")), id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No se encontró la sesión de caja.");
        SessionRow row = rows.getFirst();
        BigDecimal expected = row.expectedCash == null ? calculateExpected(id) : row.expectedCash;
        List<CashSessionController.CashMovement> movements = movements(id);
        return new CashSessionController.CashSession(row.id, row.registerCode, row.status, expected, row.countedCash,
                row.difference, row.openedBy, row.openedAt, row.closedBy, row.closedAt, row.rowVersion, movements);
    }

    @Transactional
    public CashSessionController.CashMovement addMovement(UUID sessionId, UUID actor, UUID requestId,
                                                           CashSessionController.MovementRequest request) {
        lockRequest(requestId);
        SessionRow session = lock(sessionId);
        BigDecimal delta = request.type() == CashSessionController.MovementType.INCOME
                ? request.amount() : request.amount().negate();
        List<MovementRow> replay = jdbc.query("""
            SELECT id, cash_session_id, movement_type, amount_delta, reason, responsible_user_id, occurred_at
            FROM wok.cash_movements WHERE request_id = ?
            """, (rs, row) -> {
                if (!sessionId.equals(rs.getObject("cash_session_id", UUID.class))
                        || !actor.equals(rs.getObject("responsible_user_id", UUID.class))
                        || delta.compareTo(rs.getBigDecimal("amount_delta")) != 0
                        || !request.type().name().equals(rs.getString("movement_type"))
                        || !request.reason().trim().equals(rs.getString("reason")))
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "La clave de idempotencia ya se usó con otros datos.");
                return movement(rs);
            }, requestId);
        if (!replay.isEmpty()) return replay.getFirst().toDto();
        if (!"OPEN".equals(session.status)) throw new ResponseStatusException(HttpStatus.CONFLICT, "La caja ya está cerrada.");
        UUID id = jdbc.queryForObject("""
            INSERT INTO wok.cash_movements (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id
            """, UUID.class, sessionId, request.type().name(), delta, request.reason().trim(), actor, requestId);
        audit(actor, "CASH_MOVEMENT_RECORDED", id, null, delta, request.reason().trim(), requestId);
        return movements(sessionId).stream().filter(item -> item.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public CashSessionController.CashSession close(UUID id, UUID actor, BigDecimal countedCash, int expectedVersion) {
        SessionRow row = lock(id);
        if (!"OPEN".equals(row.status)) throw new ResponseStatusException(HttpStatus.CONFLICT, "La caja ya está cerrada.");
        if (row.rowVersion != expectedVersion) throw new ResponseStatusException(HttpStatus.CONFLICT, "La sesión cambió. Actualiza la vista.");
        BigDecimal expected = calculateExpected(id);
        jdbc.update("""
            INSERT INTO wok.cash_reconciliations (cash_session_id, expected_cash, counted_cash, counted_by, is_final)
            VALUES (?, ?, ?, ?, true)
            """, id, expected, countedCash, actor);
        jdbc.update("""
            UPDATE wok.cash_sessions SET status = 'CLOSED', closed_by = ?, closed_at = now(),
                updated_by = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND row_version = ?
            """, actor, actor, id, expectedVersion);
        audit(actor, "CASH_SESSION_CLOSED", id, expected, countedCash, "CLOSE_SESSION", UUID.randomUUID());
        return get(id);
    }

    private BigDecimal calculateExpected(UUID id) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(amount_delta), 0) FROM wok.cash_movements WHERE cash_session_id = ?",
                BigDecimal.class, id);
    }

    private void lockRequest(UUID requestId) {
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement = connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))")) {
                statement.setString(1, requestId.toString());
                statement.execute();
            }
            return null;
        });
    }

    private List<CashSessionController.CashMovement> movements(UUID sessionId) {
        return jdbc.query("""
            SELECT id, cash_session_id, movement_type, amount_delta, reason, responsible_user_id, occurred_at
            FROM wok.cash_movements WHERE cash_session_id = ? ORDER BY occurred_at, id
            """, (rs, row) -> movement(rs).toDto(), sessionId);
    }

    private MovementRow movement(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new MovementRow(rs.getObject("id", UUID.class), rs.getObject("cash_session_id", UUID.class),
                CashSessionController.MovementKind.valueOf(rs.getString("movement_type")), rs.getBigDecimal("amount_delta"),
                rs.getString("reason"), rs.getObject("responsible_user_id", UUID.class), rs.getTimestamp("occurred_at").toInstant());
    }

    private SessionRow lock(UUID id) {
        List<SessionRow> rows = jdbc.query("""
            SELECT s.id, r.code AS register_code, s.status, s.opened_by, s.opened_at, s.closed_by, s.closed_at, s.row_version,
                   rec.expected_cash, rec.counted_cash, rec.difference
            FROM wok.cash_sessions s JOIN wok.cash_registers r ON r.id = s.cash_register_id
            LEFT JOIN wok.cash_reconciliations rec ON rec.cash_session_id = s.id AND rec.is_final
            WHERE s.id = ? FOR UPDATE OF s
            """, (rs, row) -> new SessionRow(rs.getObject("id", UUID.class), rs.getString("register_code"),
                rs.getString("status"), rs.getObject("opened_by", UUID.class), rs.getTimestamp("opened_at").toInstant(),
                rs.getObject("closed_by", UUID.class), rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
                rs.getInt("row_version"), rs.getBigDecimal("expected_cash"), rs.getBigDecimal("counted_cash"), rs.getBigDecimal("difference")), id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No se encontró la sesión de caja.");
        return rows.getFirst();
    }

    private void audit(UUID actor, String action, UUID entity, BigDecimal before, BigDecimal after, String reason, UUID requestId) {
        jdbc.update("""
            INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, ?, 'CASH', ?, CASE WHEN ?::numeric IS NULL THEN NULL ELSE jsonb_build_object('amount', ?::numeric) END,
                    jsonb_build_object('amount', ?::numeric), ?, 'SUCCESS', ?)
            """, actor, action, entity, before, before, after, reason, requestId);
    }

    private record SessionRow(UUID id, String registerCode, String status, UUID openedBy, Instant openedAt,
                              UUID closedBy, Instant closedAt, int rowVersion, BigDecimal expectedCash,
                              BigDecimal countedCash, BigDecimal difference) {}
    private record OpenReplay(UUID sessionId, String registerCode, BigDecimal openingFloat, UUID actor) {}
    private record MovementRow(UUID id, UUID sessionId, CashSessionController.MovementKind type, BigDecimal delta,
                               String reason, UUID actor, Instant occurredAt) {
        CashSessionController.CashMovement toDto() {
            return new CashSessionController.CashMovement(id, sessionId, type, delta, reason, actor, occurredAt);
        }
    }
}
