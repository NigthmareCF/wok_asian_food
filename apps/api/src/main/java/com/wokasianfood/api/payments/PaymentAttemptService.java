package com.wokasianfood.api.payments;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.accounts.AccountFinancialTotalsService;
import com.wokasianfood.api.platform.IdempotencyStore;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Durable protocol specific to registration of in-person account payments. */
@Service
public class PaymentAttemptService {
    private static final String OPERATION = "ACCOUNT_PAYMENT_CAPTURED";
    private final JdbcTemplate jdbc;
    private final PaymentService payments;
    private final AccountFinancialTotalsService financialTotals;
    private final IdempotencyStore idempotency;
    private final TransactionTemplate write;
    private final TransactionTemplate read;

    PaymentAttemptService(JdbcTemplate jdbc, PaymentService payments, IdempotencyStore idempotency,
                          PlatformTransactionManager transactions, AccountFinancialTotalsService financialTotals) {
        this.jdbc = jdbc;
        this.payments = payments;
        this.financialTotals = financialTotals;
        this.idempotency = idempotency;
        write = new TransactionTemplate(transactions);
        write.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        read = new TransactionTemplate(transactions);
        read.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        read.setReadOnly(true);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    public Result prepare(UUID actor, UUID account, PaymentAttemptController.PrepareRequest request) {
        PaymentService.Normalized content = payments.normalize(account, request.payment());
        if (content.amount() == null) throw new AuthException(422, "La preparación requiere un importe explícito.");
        UUID id = write.execute(tx -> prepareLocked(actor, account, content, request.currency(),
                request.expectedPreviousAttemptId(), false, UUID.randomUUID(), UUID.randomUUID(), null));
        return get(actor, account, id);
    }

    // Used by the legacy adapter; preparation and capture are deliberately separate commits.
    UUID prepareLegacy(UUID actor, UUID requestId, UUID account, UUID key, PaymentService.Normalized content) {
        try {
        return write.execute(tx -> {
            lockAccount(account);
            Row existing = byKey(actor, key);
            if (existing != null) {
                matching(existing, account, content.hash());
                return existing.id();
            }
            // A pre-protocol claim with no stable result cannot be adopted or bypassed.
            if (Boolean.TRUE.equals(jdbc.queryForObject("""
                    SELECT EXISTS(SELECT 1 FROM wok.idempotency_keys
                    WHERE principal_scope = ? AND operation = ? AND key = ?)
                    """, Boolean.class, actor.toString(), OPERATION, key.toString())))
                throw new AuthException(409, "La operación anterior requiere consulta o conciliación.");
            Row previous = latest(account);
            return prepareLocked(actor, account, content, null, previous == null ? null : previous.id(),
                    true, key, requestId, "Nueva operación legacy explícita");
        });
        } catch (DataIntegrityViolationException competingIdentity) {
            // A simultaneous use of the same legacy key on another account must remain a conflict.
            Row winner = read.execute(tx -> byKey(actor, key));
            if (winner == null) throw competingIdentity;
            matching(winner, account, content.hash());
            return winner.id();
        }
    }

    public PaymentService.PaymentReceipt legacyCapture(UUID actor, UUID requestId, UUID account,
            UUID key, PaymentController.PaymentRequest request) {
        PaymentService.Normalized content = payments.normalize(account, request);
        // Historical replay performs no writes. Preserve claim -> attempt -> account mutex order.
        PaymentService.PaymentReceipt replay = write.execute(tx -> {
            List<Claim> rows = jdbc.query("""
                    SELECT request_hash, resource_id, status FROM wok.idempotency_keys
                    WHERE principal_scope = ? AND operation = ? AND key = ? FOR UPDATE
                    """, (rs, n) -> new Claim(rs.getString(1), rs.getObject(2, UUID.class), rs.getString(3)),
                    actor.toString(), OPERATION, key.toString());
            if (rows.isEmpty()) return null;
            Claim claim = rows.getFirst();
            if (!content.hash().equals(claim.hash())) throw new AuthException(409, "La clave ya se usó con otros datos.");
            if (!"COMPLETED".equals(claim.status())) return null;
            Row attempt = byKey(actor, key);
            if (attempt != null) owned(actor, account, attempt.id(), true);
            lockAccount(account);
            return payments.confirmed(actor, account, key);
        });
        if (replay != null) return replay;
        UUID id = prepareLegacy(actor, requestId, account, key, content);
        requestExecution(actor, account, id, null);
        Finance outcome = execute(actor, account, id);
        if (outcome.rejectionStatus() != null)
            throw new AuthException(outcome.rejectionStatus(), outcome.rejectionMessage());
        // Receipt anomalies occur AFTER confirmed financial commit and cannot erase its evidence.
        return read.execute(tx -> payments.receipt(outcome.paymentId(), outcome.replay()));
    }

    private UUID prepareLocked(UUID actor, UUID account, PaymentService.Normalized content, String currency,
            UUID expectedPrevious, boolean legacy, UUID key, UUID requestId, String reason) {
        lockAccount(account);
        Row active = active(account);
        if (active != null) {
            if (!legacy && active.owner().equals(actor) && !active.legacy()
                    && Objects.equals(active.previous(), expectedPrevious)
                    && sameContent(active, content, currency))
                return active.id();
            throw new AuthException(409, "La cuenta tiene un intento preparado o pendiente; consulta el original.");
        }
        Row previous = latest(account);
        if (!Objects.equals(expectedPrevious, previous == null ? null : previous.id()))
            throw new AuthException(409, "El antecedente cambió; consulta los intentos antes de preparar otro.");
        if (previous != null && "REJECTED".equals(previous.status()) && !legacy)
            throw new AuthException(409, "Usa el reemplazo explícito del intento rechazado.");
        return insert(actor, account, content, currency, previous, legacy, key, requestId, reason);
    }

    private UUID insert(UUID actor, UUID account, PaymentService.Normalized content, String currency,
            Row previous, boolean legacy, UUID key, UUID requestId, String reason) {
        PaymentService.Candidate candidate = payments.candidate(account, content, null, false);
        String actualCurrency = jdbc.queryForObject("SELECT code FROM wok.currencies WHERE id = ?",
                String.class, candidate.currencyId());
        if (currency != null && !actualCurrency.equals(currency))
            throw new AuthException(422, "La moneda no coincide con el saldo de la cuenta.");
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.payment_attempts
                (id, account_id, created_by, sequence, previous_attempt_id, amount, tip_amount,
                 currency_id, method, reference, register_code, capture_key, request_hash, legacy,
                 request_id, transition_reason, transition_actor)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, account, actor, previous == null ? 1 : previous.sequence() + 1,
                previous == null ? null : previous.id(), candidate.amount(), content.tip(), candidate.currencyId(),
                content.method().name(), content.reference(), content.registerCode(), key, content.hash(), legacy,
                requestId, reason, actor);
        audit(actor, id, previous == null ? "PAYMENT_ATTEMPT_PREPARED" : "PAYMENT_ATTEMPT_REPLACEMENT",
                account, requestId, reason);
        return id;
    }

    public Result capture(UUID actor, UUID account, UUID id, long expectedVersion) {
        requestExecution(actor, account, id, expectedVersion);
        execute(actor, account, id);
        return get(actor, account, id);
    }

    // Package-visible boundary for crash/race regression tests; never writes financial data.
    void requestExecution(UUID actor, UUID account, UUID id, Long expectedVersion) {
        write.executeWithoutResult(tx -> {
            Row row = owned(actor, account, id, true);
            if ("RETIRED".equals(row.status())) throw new AuthException(409, "El intento fue retirado y no puede capturarse.");
            if (!"PREPARED".equals(row.status())) return; // same immutable operation, including replay after lost response
            version(row, expectedVersion);
            jdbc.update("""
                    UPDATE wok.payment_attempts SET status = 'PENDING', execution_requested_at = now(),
                    row_version = row_version + 1, updated_at = now(), transition_actor = ? WHERE id = ?
                    """, actor, id);
            audit(actor, id, "PAYMENT_ATTEMPT_REQUESTED", account, row.requestId(), null);
        });
    }

    private Finance execute(UUID actor, UUID account, UUID id) {
        // Identity/content are immutable; fetch without mutex to acquire claim BEFORE attempt/account/cash.
        Row identity = read.execute(tx -> owned(actor, account, id, false));
        if ("CONFIRMED".equals(identity.status())) return new Finance(identity.paymentId(), true, null, null);
        if ("REJECTED".equals(identity.status()))
            return new Finance(null, false, identity.rejectionStatus(), identity.rejectionMessage());
        if ("RETIRED".equals(identity.status()))
            throw new AuthException(409, "El intento fue retirado y no puede capturarse.");
        return write.execute(tx -> {
            IdempotencyStore.Result claim = idempotency.claim(actor.toString(), OPERATION,
                    identity.key(), identity.content().hash());
            Row row = owned(actor, account, id, true);
            lockAccount(account);
            if (claim.replay()) {
                if (!"CONFIRMED".equals(row.status()) || !claim.resourceId().equals(row.paymentId()))
                    throw new AuthException(409, "La evidencia del intento requiere conciliación.");
                return new Finance(claim.resourceId(), true, null, null);
            }
            if ("REJECTED".equals(row.status())) {
                removeOwnProvisionalClaim(actor, row);
                return new Finance(null, false, row.rejectionStatus(), row.rejectionMessage());
            }
            if (!"PENDING".equals(row.status())) throw new AuthException(409, "El intento no admite captura.");
            Row blocker = active(account);
            if (blocker == null || !blocker.id().equals(id))
                throw new AuthException(409, "La cuenta requiere revisión del intento activo.");
            PaymentService.Candidate candidate;
            try {
                candidate = payments.candidate(account, row.content(), row.currencyId(), true);
            } catch (AuthException rejection) {
                // candidate only reads/locks. No catch encloses payment/movement/account/audit writes.
                if (rejection.status() != 409 && rejection.status() != 422) throw rejection;
                removeOwnProvisionalClaim(actor, row);
                jdbc.update("""
                        UPDATE wok.payment_attempts SET status = 'REJECTED', rejection_status = ?,
                        rejection_message = ?, row_version = row_version + 1, updated_at = now(),
                        transition_actor = ? WHERE id = ?
                        """, rejection.status(), rejection.getMessage(), actor, id);
                audit(actor, id, "PAYMENT_ATTEMPT_REJECTED", account, row.requestId(), rejection.getMessage());
                return new Finance(null, false, rejection.status(), rejection.getMessage());
            }
            UUID payment = payments.writeCapture(actor, row.requestId(), account, row.content(), candidate);
            idempotency.complete(actor.toString(), OPERATION, row.key(), payment);
            // payment_id's UNIQUE index can upgrade this UPDATE to FOR UPDATE. Account is already
            // locked; a competing preparation sees PENDING and cannot insert a successor FK.
            jdbc.update("""
                    UPDATE wok.payment_attempts SET status = 'CONFIRMED', payment_id = ?,
                    row_version = row_version + 1, updated_at = now(), transition_actor = ? WHERE id = ?
                    """, payment, actor, id);
            audit(actor, id, "PAYMENT_ATTEMPT_CONFIRMED", account, row.requestId(), null);
            return new Finance(payment, false, null, null);
        });
    }

    private void removeOwnProvisionalClaim(UUID actor, Row row) {
        jdbc.update("""
                DELETE FROM wok.idempotency_keys WHERE principal_scope = ? AND operation = ? AND key = ?
                AND request_hash = ? AND status = 'IN_PROGRESS' AND resource_id IS NULL
                """, actor.toString(), OPERATION, row.key().toString(), row.content().hash());
    }

    public Result retire(UUID actor, UUID account, UUID id, PaymentAttemptController.RetireRequest request) {
        String reason = reason(request.reason());
        write.executeWithoutResult(tx -> {
            Row row = owned(actor, account, id, true);
            if ("RETIRED".equals(row.status()) && reason.equals(row.retiredReason())
                    && row.requestedAt() == null && row.resolution() == null
                    && request.expectedVersion() == row.version() - 1) return;
            version(row, request.expectedVersion());
            if (!"PREPARED".equals(row.status()) || row.requestedAt() != null || row.paymentId() != null)
                throw new AuthException(409, "Solo se puede retirar una preparación nunca solicitada.");
            lockAccount(account);
            jdbc.update("""
                    UPDATE wok.payment_attempts SET status = 'RETIRED', retired_reason = ?,
                    row_version = row_version + 1, updated_at = now(), transition_actor = ? WHERE id = ?
                    """, reason, actor, id);
            audit(actor, id, "PAYMENT_ATTEMPT_RETIRED", account, row.requestId(), reason);
        });
        return get(actor, account, id);
    }

    public Result replacement(UUID actor, UUID account, UUID id,
            PaymentAttemptController.ReplacementRequest request) {
        PaymentService.Normalized content = payments.normalize(account, request.payment().payment());
        String reason = reason(request.reason());
        if (content.amount() == null || !id.equals(request.payment().expectedPreviousAttemptId()))
            throw new AuthException(422, "El reemplazo requiere importe y antecedente explícitos.");
        UUID successor = write.execute(tx -> {
            Row row = owned(actor, account, id, true);
            version(row, request.expectedVersion());
            if (!"REJECTED".equals(row.status()))
                throw new AuthException(409, "Solo un rechazo acreditado permite reemplazo.");
            lockAccount(account);
            List<Row> successors = rows("a.previous_attempt_id = ?", false, id);
            if (!successors.isEmpty()) {
                Row next = successors.getFirst();
                if (next.owner().equals(actor) && sameContent(next, content, request.payment().currency())
                        && reason.equals(next.transitionReason()))
                    return next.id();
                throw new AuthException(409, "El intento ya tiene otra operación sucesora.");
            }
            if (active(account) != null || !latest(account).id().equals(id))
                throw new AuthException(409, "La cuenta ya tiene otro intento.");
            return insert(actor, account, content, request.payment().currency(), row, false,
                    UUID.randomUUID(), UUID.randomUUID(), reason);
        });
        return get(actor, account, successor);
    }

    public Result get(UUID actor, UUID account, UUID id) {
        return read.execute(tx -> result(owned(actor, account, id, false)));
    }
    public Result legacyReference(UUID actor, UUID account, UUID key) {
        return read.execute(tx -> {
            Row row = byKey(actor, key);
            if (row == null || !row.legacy() || !row.account().equals(account))
                throw new AuthException(404, "No encontramos un intento durable propio para esa referencia.");
            return result(row);
        });
    }
    public PreparationContext context(UUID actor, UUID account) {
        return read.execute(tx -> {
            List<String> states = jdbc.queryForList("SELECT status FROM wok.order_accounts WHERE id = ?", String.class, account);
            if (states.isEmpty()) throw new AuthException(404, "No encontramos la cuenta.");
            Row blocker = active(account), previous = latest(account);
            var totals = financialTotals.totals(account);
            var single = totals.single();
            boolean payable = single != null && single.currency() != null && single.balance().signum() > 0
                    && single.total().signum() >= 0 && single.paid().signum() >= 0 && single.tips().signum() >= 0
                    && Boolean.TRUE.equals(jdbc.queryForObject("""
                        SELECT count(*) > 0 AND count(*) FILTER (WHERE status NOT IN ('SERVED','CLOSED')) = 0
                        FROM wok.orders WHERE account_id = ? AND status <> 'CANCELLED'
                        """, Boolean.class, account));
            boolean canPrepare = blocker == null && (previous == null || !"REJECTED".equals(previous.status()))
                    && List.of("OPEN", "IN_COBRO").contains(states.getFirst()) && payable;
            return new PreparationContext(account, canPrepare, blocker == null && previous != null ? previous.id() : null,
                    blocker != null && blocker.owner().equals(actor) ? result(blocker) : null,
                    blocker != null && !blocker.owner().equals(actor));
        });
    }

    public History history(UUID actor, UUID account, UUID cursor) {
        return read.execute(tx -> {
            Row boundary = cursor == null ? null : owned(actor, account, cursor, false);
            String where = "a.created_by = ?" + (account == null ? "" : " AND a.account_id = ?");
            java.util.ArrayList<Object> args = new java.util.ArrayList<>();
            args.add(actor);
            if (account != null) args.add(account);
            if (boundary != null) {
                where += " AND (a.created_at, a.id) < (?, ?)";
                args.add(boundary.createdAt()); args.add(boundary.id());
            }
            List<Row> page = rows(where + " ORDER BY a.created_at DESC, a.id DESC LIMIT 51", false, args.toArray());
            boolean more = page.size() > 50;
            List<Result> items = page.stream().limit(50).map(this::result).toList();
            Row blocker = account == null ? null : active(account);
            return new History(items, more ? items.getLast().attemptId() : null,
                    blocker != null && !blocker.owner().equals(actor));
        });
    }

    // Only the resolution service uses this bridge, inside its own consistent transaction.
    Result result(Row row) {
        PaymentService.PaymentReceipt receipt = null;
        String availability = null;
        Confirmation confirmation = null;
        if ("CONFIRMED".equals(row.status())) {
            // Stable payment evidence independent of the current scalar account balance.
            confirmation = jdbc.queryForObject("""
                    SELECT captured_at FROM wok.payments WHERE id = ?
                    """, (rs, n) -> new Confirmation(row.paymentId(), row.content().amount(), row.content().tip(),
                    row.currency(), row.content().method().name(), rs.getObject(1, OffsetDateTime.class)), row.paymentId());
            try {
                receipt = payments.receipt(row.paymentId(), true);
                availability = "AVAILABLE";
            } catch (AuthException anomaly) {
                if (anomaly.status() != 409) throw anomaly;
                availability = "RECONCILIATION_REQUIRED";
            }
        }
        List<String> actions = switch (row.status()) {
            case "PREPARED" -> List.of("CAPTURE", "RETIRE");
            case "PENDING" -> List.of("CONTINUE_SAME_ATTEMPT");
            case "REJECTED" -> rows("a.previous_attempt_id = ?", false, row.id()).isEmpty()
                    && active(row.account()) == null && latest(row.account()).id().equals(row.id())
                    ? List.of("REPLACE") : List.of();
            default -> List.of();
        };
        return new Result(row.id(), row.account(), row.version(), row.status(), row.previous(), row.content().amount(),
                row.content().tip(), row.currency(), row.content().method().name(), row.content().reference(),
                row.content().registerCode(), row.requestedAt(), confirmation, availability,
                receipt == null ? null : receipt.balance(), row.rejectionStatus(), row.rejectionMessage(), actions, row.resolution());
    }

    private Row owned(UUID actor, UUID account, UUID id, boolean lock) {
        List<Row> found = rows("a.id = ? AND a.created_by = ?" + (account == null ? "" : " AND a.account_id = ?"),
                lock, account == null ? new Object[]{id, actor} : new Object[]{id, actor, account});
        if (found.isEmpty()) throw new AuthException(404, "No encontramos un intento propio para esta cuenta.");
        return found.getFirst();
    }
    private Row byKey(UUID actor, UUID key) {
        List<Row> found = rows("a.created_by = ? AND a.capture_key = ?", false, actor, key);
        return found.isEmpty() ? null : found.getFirst();
    }
    private Row active(UUID account) {
        List<Row> found = rows("a.account_id = ? AND a.status IN ('PREPARED', 'PENDING')", false, account);
        return found.isEmpty() ? null : found.getFirst();
    }
    private Row latest(UUID account) {
        List<Row> found = rows("a.account_id = ? ORDER BY a.sequence DESC LIMIT 1", false, account);
        return found.isEmpty() ? null : found.getFirst();
    }
    Row resolutionRow(UUID account, UUID id, boolean lock) {
        List<Row> found = rows("a.id = ? AND a.account_id = ?", lock, id, account);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos ese intento en la cuenta.");
        return found.getFirst();
    }
    List<Row> rows(String where, boolean lock, Object... args) {
        // Serialize mutators without blocking KEY SHARE acquired by a successor's predecessor FK.
        // FOR UPDATE here would invert preparation's account -> FK against replay's attempt -> account.
        // Financial confirmation may upgrade the lock only after acquiring the account (see execute).
        return jdbc.query("""
                SELECT a.*, c.code AS currency FROM wok.payment_attempts a
                JOIN wok.currencies c ON c.id = a.currency_id WHERE
                """ + where + (lock ? " FOR NO KEY UPDATE OF a" : ""), (rs, n) -> new Row(
                rs.getObject("id", UUID.class), rs.getObject("account_id", UUID.class), rs.getObject("created_by", UUID.class),
                rs.getLong("sequence"), rs.getObject("previous_attempt_id", UUID.class),
                new PaymentService.Normalized(PaymentController.PaymentMethod.valueOf(rs.getString("method")),
                        rs.getBigDecimal("amount"), rs.getBigDecimal("tip_amount"), rs.getString("reference"),
                        rs.getString("register_code"), rs.getString("request_hash")),
                rs.getObject("currency_id", UUID.class), rs.getString("currency"), rs.getObject("capture_key", UUID.class),
                rs.getBoolean("legacy"), rs.getString("status"), rs.getLong("row_version"),
                rs.getObject("execution_requested_at", OffsetDateTime.class), rs.getObject("payment_id", UUID.class),
                rs.getObject("rejection_status", Integer.class), rs.getString("rejection_message"),
                rs.getString("retired_reason"), rs.getString("transition_reason"), rs.getObject("request_id", UUID.class),
                rs.getObject("created_at", OffsetDateTime.class), rs.getObject("resolved_by", UUID.class) == null ? null
                    : new Resolution(rs.getObject("resolved_by", UUID.class), rs.getObject("resolved_at", OffsetDateTime.class),
                        rs.getString("resolution_reason"), rs.getString("resolution_evidence"),
                        rs.getString("resolution_evidence_reference"), rs.getLong("resolution_expected_version"),
                        rs.getString("resolution_physical_receipt_status"))), args);
    }
    void lockAccount(UUID account) {
        List<UUID> found = jdbc.query("SELECT id FROM wok.order_accounts WHERE id = ? FOR UPDATE",
                (rs, n) -> rs.getObject(1, UUID.class), account);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos la cuenta.");
    }
    private void matching(Row row, UUID account, String hash) {
        if (!row.account().equals(account) || !row.content().hash().equals(hash))
            throw new AuthException(409, "La clave ya se usó con otros datos.");
    }
    private boolean sameContent(Row row, PaymentService.Normalized content, String currency) {
        // Keep the legacy fingerprint/normalization unchanged. Its delimiter-based encoding is
        // not sufficient evidence of equality for prepare/replacement in the new protocol.
        PaymentService.Normalized stored = row.content();
        return stored.method() == content.method()
                && stored.amount().compareTo(content.amount()) == 0
                && stored.tip().compareTo(content.tip()) == 0
                && Objects.equals(stored.reference(), content.reference())
                && stored.registerCode().equals(content.registerCode())
                && row.currency().equals(currency);
    }
    private void version(Row row, Long expected) {
        if (expected != null && row.version() != expected)
            throw new AuthException(409, "La versión del intento cambió; consulta su estado.");
    }
    private String reason(String value) {
        if (value == null || value.isBlank() || value.length() > 500)
            throw new AuthException(422, "Se requiere un motivo de hasta 500 caracteres.");
        return value.trim();
    }
    private void audit(UUID actor, UUID id, String action, UUID account, UUID requestId, String reason) {
        jdbc.update("""
                INSERT INTO wok.audit_logs(actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
                SELECT ?, ?, 'PAYMENT_ATTEMPT', a.id,
                jsonb_build_object('accountId', a.account_id, 'reason', ?::text, 'status', a.status,
                    'version', a.row_version, 'amount', a.amount, 'tipAmount', a.tip_amount,
                    'currencyId', a.currency_id, 'previousAttemptId', a.previous_attempt_id,
                    'paymentId', a.payment_id, 'executionRequestedAt', a.execution_requested_at), 'SUCCESS', ?
                FROM wok.payment_attempts a WHERE a.id = ? AND a.account_id = ?
                """, actor, action, reason, requestId, id, account);
    }

    record Row(UUID id, UUID account, UUID owner, long sequence, UUID previous,
            PaymentService.Normalized content, UUID currencyId, String currency, UUID key, boolean legacy,
            String status, long version, OffsetDateTime requestedAt, UUID paymentId, Integer rejectionStatus,
            String rejectionMessage, String retiredReason, String transitionReason, UUID requestId, OffsetDateTime createdAt,
            Resolution resolution) {}
    private record Claim(String hash, UUID paymentId, String status) {}
    private record Finance(UUID paymentId, boolean replay, Integer rejectionStatus, String rejectionMessage) {}
    public record Confirmation(UUID paymentId, BigDecimal amount, BigDecimal tipAmount, String currency,
                               String method, OffsetDateTime capturedAt) {}
    public record Result(UUID attemptId, UUID accountId, long version, String status, UUID previousAttemptId,
            BigDecimal amount, BigDecimal tipAmount, String currency, String method, String reference, String registerCode,
            OffsetDateTime executionRequestedAt, Confirmation confirmation, String receiptAvailability,
            BigDecimal balance, Integer rejectionStatus, String rejectionMessage, List<String> availableActions,
            Resolution resolution) {}
    public record Resolution(UUID actorId, OffsetDateTime resolvedAt, String reason, String evidenceSummary,
            String evidenceReference, long expectedVersion, String physicalReceiptStatus) {}
    public record PreparationContext(UUID accountId, boolean canPrepare, UUID expectedPreviousAttemptId,
            Result ownActiveAttempt, boolean blockedByAnotherOperator) {}
    public record History(List<Result> items, UUID nextCursor, boolean blockedByAnotherOperator) {}
}
