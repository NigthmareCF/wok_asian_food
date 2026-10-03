package com.wokasianfood.api.cash;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/cash-sessions")
@PreAuthorize("hasAuthority('cash:manage')")
public class CashSessionController {
    private final CashSessionService cash;

    public CashSessionController(CashSessionService cash) { this.cash = cash; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CashSessionService.CashSession open(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody OpenRequest request) {
        return cash.open(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, idempotencyKey, request);
    }

    @GetMapping("/current")
    public CashSessionService.CashSession current(
            @RequestParam(defaultValue = "MAIN") @Size(max = 32) String registerCode) {
        return cash.current(registerCode);
    }

    @GetMapping("/{sessionId}")
    public CashSessionService.CashSession details(@PathVariable UUID sessionId) {
        return cash.details(sessionId);
    }

    @PostMapping("/{sessionId}/movements")
    @ResponseStatus(HttpStatus.CREATED)
    public CashSessionService.CashMovement movement(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody MovementRequest request) {
        return cash.addMovement(sessionId, UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, idempotencyKey, request);
    }

    @PostMapping("/{sessionId}/close")
    public CashSessionService.CashSession close(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody CloseRequest request) {
        return cash.close(sessionId, UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, request);
    }

    @PostMapping("/{sessionId}/reconciliations")
    @ResponseStatus(HttpStatus.CREATED)
    public CashSessionService.Reconciliation reconcile(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody ReconciliationRequest request) {
        return cash.reconcile(sessionId, UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, request);
    }

    public record OpenRequest(@NotBlank @Size(max = 32) String registerCode,
                              @NotNull @DecimalMin("0.00") BigDecimal openingFloat) {}

    public record MovementRequest(@NotNull MovementType type,
                                  @NotNull @DecimalMin(value = "0.01") BigDecimal amount,
                                  @NotBlank @Size(min = 3, max = 500) String reason) {}

    public record CloseRequest(@NotNull @DecimalMin("0.00") BigDecimal countedCash,
                               @Positive int expectedVersion) {}

    public record ReconciliationRequest(@NotNull @DecimalMin("0.00") BigDecimal countedCash,
                                        @Size(max = 500) String notes) {}

    public enum MovementType { INCOME, EXPENSE, WITHDRAWAL }
}

@Service
class CashSessionService {
    private static final String SESSION_SELECT = """
        SELECT s.id, r.code AS register_code, s.status, s.opened_by, s.opened_at, s.closed_by, s.closed_at,
               s.row_version, rec.expected_cash, rec.counted_cash, rec.difference
        FROM wok.cash_sessions s
        JOIN wok.cash_registers r ON r.id = s.cash_register_id
        LEFT JOIN wok.cash_reconciliations rec ON rec.cash_session_id = s.id AND rec.is_final
        """;

    private static final RowMapper<SessionRow> SESSION_MAPPER = (rs, row) -> new SessionRow(
            rs.getObject("id", UUID.class), rs.getString("register_code"), rs.getString("status"),
            rs.getObject("opened_by", UUID.class), rs.getTimestamp("opened_at").toInstant(),
            rs.getObject("closed_by", UUID.class),
            rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
            rs.getInt("row_version"), rs.getBigDecimal("expected_cash"), rs.getBigDecimal("counted_cash"),
            rs.getBigDecimal("difference"));

    private static final RowMapper<CashMovement> MOVEMENT_MAPPER = (rs, row) ->
            new CashMovement(rs.getObject("id", UUID.class), rs.getString("movement_type"),
                    rs.getBigDecimal("amount_delta"), rs.getString("reason"),
                    rs.getObject("responsible_user_id", UUID.class), rs.getTimestamp("occurred_at").toInstant());

    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    CashSessionService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    @Transactional
    public CashSession open(UUID actor, UUID requestId, UUID idempotencyKey,
                            CashSessionController.OpenRequest request) {
        String code = request.registerCode().trim().toUpperCase(Locale.ROOT);
        BigDecimal openingFloat = request.openingFloat();
        String hash = fingerprint("OPEN", code, openingFloat.toPlainString());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "CASH_SESSION_OPENED",
                idempotencyKey, hash);
        if (claim.replay()) return details(claim.resourceId());

        List<UUID> registers = jdbc.query("""
            SELECT id FROM wok.cash_registers WHERE code = ? AND active
            """, (rs, row) -> rs.getObject(1, UUID.class), code);
        if (registers.isEmpty()) throw new AuthException(404, "La caja indicada no está configurada.");

        UUID sessionId = UUID.randomUUID();
        try {
            jdbc.update("""
                INSERT INTO wok.cash_sessions (id, cash_register_id, opened_by, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?)
                """, sessionId, registers.getFirst(), actor, actor, actor);
        } catch (DuplicateKeyException conflict) {
            throw new AuthException(409, "Ya existe una caja abierta para este registro.");
        }
        jdbc.update("""
            INSERT INTO wok.cash_movements
                (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
            VALUES (?, 'OPENING', ?, 'Fondo de apertura', ?, ?)
            """, sessionId, openingFloat, actor, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'CASH_SESSION_OPENED', 'CASH_SESSION', ?,
                    jsonb_build_object('registerCode', ?, 'openingFloat', ?), 'SUCCESS', ?)
            """, actor, sessionId, code, openingFloat, requestId);
        idempotency.complete(actor.toString(), "CASH_SESSION_OPENED", idempotencyKey, sessionId);
        return details(sessionId);
    }

    @Transactional(readOnly = true)
    public CashSession current(String registerCode) {
        String code = registerCode.trim().toUpperCase(Locale.ROOT);
        List<UUID> ids = jdbc.query("""
            SELECT s.id FROM wok.cash_sessions s
            JOIN wok.cash_registers r ON r.id = s.cash_register_id
            WHERE r.code = ? AND s.status IN ('OPEN', 'CLOSING')
            ORDER BY s.opened_at DESC LIMIT 1
            """, (rs, row) -> rs.getObject(1, UUID.class), code);
        if (ids.isEmpty()) throw new AuthException(404, "No hay una caja abierta para este registro.");
        return details(ids.getFirst());
    }

    @Transactional(readOnly = true)
    public CashSession details(UUID sessionId) {
        return toDto(load(sessionId));
    }

    @Transactional
    public CashMovement addMovement(UUID sessionId, UUID actor, UUID requestId, UUID idempotencyKey,
                                    CashSessionController.MovementRequest request) {
        BigDecimal amount = request.amount();
        String hash = fingerprint("MOVEMENT", sessionId.toString(), request.type().name(),
                amount.toPlainString(), request.reason().trim());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "CASH_MOVEMENT_RECORDED",
                idempotencyKey, hash);
        if (claim.replay()) return movement(claim.resourceId());

        SessionRow session = lock(sessionId);
        if (!"OPEN".equals(session.status()))
            throw new AuthException(409, "La caja ya está cerrada.");
        BigDecimal delta = request.type() == CashSessionController.MovementType.INCOME
                ? amount : amount.negate();
        UUID movementId = jdbc.queryForObject("""
            INSERT INTO wok.cash_movements
                (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id
            """, UUID.class, sessionId, request.type().name(), delta, request.reason().trim(), actor, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, reason, result, request_id)
            VALUES (?, 'CASH_MOVEMENT_RECORDED', 'CASH_MOVEMENT', ?,
                    jsonb_build_object('type', ?, 'amountDelta', ?), ?, 'SUCCESS', ?)
            """, actor, movementId, request.type().name(), delta, request.reason().trim(), requestId);
        idempotency.complete(actor.toString(), "CASH_MOVEMENT_RECORDED", idempotencyKey, movementId);
        return movement(movementId);
    }

    @Transactional
    public CashSession close(UUID sessionId, UUID actor, UUID requestId,
                             CashSessionController.CloseRequest request) {
        SessionRow session = lock(sessionId);
        if (!"OPEN".equals(session.status()))
            throw new AuthException(409, "La caja ya está cerrada.");
        if (session.rowVersion() != request.expectedVersion())
            throw new AuthException(409, "La caja cambió. Actualiza la vista y vuelve a intentarlo.");
        BigDecimal expected = expectedCash(sessionId);
        jdbc.update("""
            INSERT INTO wok.cash_reconciliations
                (cash_session_id, expected_cash, counted_cash, counted_by, is_final)
            VALUES (?, ?, ?, ?, true)
            """, sessionId, expected, request.countedCash(), actor);
        jdbc.update("""
            UPDATE wok.cash_sessions
            SET status = 'CLOSED', closed_by = ?, closed_at = now(), updated_by = ?, updated_at = now(),
                row_version = row_version + 1
            WHERE id = ? AND row_version = ?
            """, actor, actor, sessionId, request.expectedVersion());
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, result, request_id)
            VALUES (?, 'CASH_SESSION_CLOSED', 'CASH_SESSION', ?,
                    jsonb_build_object('expectedCash', ?), jsonb_build_object('countedCash', ?), 'SUCCESS', ?)
            """, actor, sessionId, expected, request.countedCash(), requestId);
        return details(sessionId);
    }

    @Transactional
    public Reconciliation reconcile(UUID sessionId, UUID actor, UUID requestId,
                                    CashSessionController.ReconciliationRequest request) {
        SessionRow session = lock(sessionId);
        if (!"OPEN".equals(session.status()))
            throw new AuthException(409, "La caja ya está cerrada.");
        BigDecimal expected = expectedCash(sessionId);
        String notes = request.notes() == null || request.notes().isBlank() ? null : request.notes().trim();
        UUID reconciliationId = jdbc.queryForObject("""
            INSERT INTO wok.cash_reconciliations
                (cash_session_id, expected_cash, counted_cash, counted_by, is_final, notes)
            VALUES (?, ?, ?, ?, false, ?) RETURNING id
            """, UUID.class, sessionId, expected, request.countedCash(), actor, notes);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'CASH_RECONCILED', 'CASH_SESSION', ?,
                    jsonb_build_object('expectedCash', ?, 'countedCash', ?), 'SUCCESS', ?)
            """, actor, sessionId, expected, request.countedCash(), requestId);
        return reconciliation(reconciliationId);
    }

    private CashSession toDto(SessionRow row) {
        BigDecimal expected = row.expectedCash() == null ? expectedCash(row.id()) : row.expectedCash();
        return new CashSession(row.id(), row.registerCode(), row.status(), expected, row.countedCash(),
                row.difference(), row.openedBy(), row.openedAt(), row.closedBy(), row.closedAt(), row.rowVersion(),
                breakdown(row.id()), reconciliations(row.id()), movements(row.id()));
    }

    private CashBreakdown breakdown(UUID sessionId) {
        BigDecimal[] totals = jdbc.queryForObject("""
            SELECT
              COALESCE(SUM(amount_delta) FILTER (WHERE movement_type = 'OPENING'), 0),
              COALESCE(SUM(amount_delta) FILTER (WHERE movement_type = 'SALE'), 0),
              COALESCE(SUM(amount_delta) FILTER (WHERE movement_type = 'INCOME'), 0),
              COALESCE(SUM(amount_delta) FILTER (WHERE movement_type = 'EXPENSE'), 0),
              COALESCE(SUM(amount_delta) FILTER (WHERE movement_type = 'WITHDRAWAL'), 0),
              COALESCE(SUM(amount_delta), 0)
            FROM wok.cash_movements WHERE cash_session_id = ?
            """, (rs, row) -> new BigDecimal[] {rs.getBigDecimal(1), rs.getBigDecimal(2), rs.getBigDecimal(3),
                rs.getBigDecimal(4), rs.getBigDecimal(5), rs.getBigDecimal(6)}, sessionId);
        BigDecimal tips = cashTips(sessionId);
        return new CashBreakdown(totals[0], totals[1], tips, totals[2].subtract(tips), totals[3].abs(),
                totals[4].abs(), totals[5]);
    }

    private BigDecimal cashTips(UUID sessionId) {
        BigDecimal tips = jdbc.queryForObject("""
            SELECT COALESCE(SUM(tip_amount), 0) FROM wok.payments
            WHERE cash_session_id = ? AND status = 'CAPTURED'
            """, BigDecimal.class, sessionId);
        return tips == null ? BigDecimal.ZERO : tips;
    }

    private List<Reconciliation> reconciliations(UUID sessionId) {
        return jdbc.query("""
            SELECT id, expected_cash, counted_cash, difference, is_final, notes, counted_at
            FROM wok.cash_reconciliations WHERE cash_session_id = ? ORDER BY counted_at, id
            """, (rs, row) -> new Reconciliation(rs.getObject("id", UUID.class), rs.getBigDecimal("expected_cash"),
                rs.getBigDecimal("counted_cash"), rs.getBigDecimal("difference"), rs.getBoolean("is_final"),
                rs.getString("notes"), rs.getTimestamp("counted_at").toInstant()), sessionId);
    }

    private Reconciliation reconciliation(UUID reconciliationId) {
        List<Reconciliation> found = jdbc.query("""
            SELECT id, expected_cash, counted_cash, difference, is_final, notes, counted_at
            FROM wok.cash_reconciliations WHERE id = ?
            """, (rs, row) -> new Reconciliation(rs.getObject("id", UUID.class), rs.getBigDecimal("expected_cash"),
                rs.getBigDecimal("counted_cash"), rs.getBigDecimal("difference"), rs.getBoolean("is_final"),
                rs.getString("notes"), rs.getTimestamp("counted_at").toInstant()), reconciliationId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos el arqueo de caja.");
        return found.getFirst();
    }

    private SessionRow load(UUID sessionId) {
        List<SessionRow> rows = jdbc.query(SESSION_SELECT + " WHERE s.id = ?", SESSION_MAPPER, sessionId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la caja.");
        return rows.getFirst();
    }

    private SessionRow lock(UUID sessionId) {
        List<SessionRow> rows = jdbc.query(SESSION_SELECT + " WHERE s.id = ? FOR UPDATE OF s",
                SESSION_MAPPER, sessionId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la caja.");
        return rows.getFirst();
    }

    private List<CashMovement> movements(UUID sessionId) {
        return jdbc.query("""
            SELECT id, movement_type, amount_delta, reason, responsible_user_id, occurred_at
            FROM wok.cash_movements WHERE cash_session_id = ? ORDER BY occurred_at, id
            """, MOVEMENT_MAPPER, sessionId);
    }

    private CashMovement movement(UUID movementId) {
        List<CashMovement> found = jdbc.query("""
            SELECT id, movement_type, amount_delta, reason, responsible_user_id, occurred_at
            FROM wok.cash_movements WHERE id = ?
            """, MOVEMENT_MAPPER, movementId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos el movimiento de caja.");
        return found.getFirst();
    }

    private BigDecimal expectedCash(UUID sessionId) {
        BigDecimal expected = jdbc.queryForObject("""
            SELECT COALESCE(SUM(amount_delta), 0) FROM wok.cash_movements WHERE cash_session_id = ?
            """, BigDecimal.class, sessionId);
        return expected == null ? BigDecimal.ZERO : expected;
    }

    private String fingerprint(String... parts) {
        String canonical = String.join("\n", parts);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    public record CashMovement(UUID id, String type, BigDecimal amountDelta, String reason,
                               UUID responsibleUserId, Instant occurredAt) {}

    public record CashBreakdown(BigDecimal opening, BigDecimal sales, BigDecimal tips, BigDecimal otherIncome,
                                BigDecimal expenses, BigDecimal withdrawals, BigDecimal expectedCash) {}

    public record Reconciliation(UUID id, BigDecimal expectedCash, BigDecimal countedCash, BigDecimal difference,
                                 boolean isFinal, String notes, Instant countedAt) {}

    public record CashSession(UUID id, String registerCode, String status, BigDecimal expectedCash,
                              BigDecimal countedCash, BigDecimal difference, UUID openedBy, Instant openedAt,
                              UUID closedBy, Instant closedAt, int rowVersion, CashBreakdown breakdown,
                              List<Reconciliation> reconciliations, List<CashMovement> movements) {}

    private record SessionRow(UUID id, String registerCode, String status, UUID openedBy, Instant openedAt,
                              UUID closedBy, Instant closedAt, int rowVersion, BigDecimal expectedCash,
                              BigDecimal countedCash, BigDecimal difference) {}
}
