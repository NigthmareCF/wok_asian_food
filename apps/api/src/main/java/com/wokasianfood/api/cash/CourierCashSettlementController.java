package com.wokasianfood.api.cash;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/courier-cash")
@PreAuthorize("hasAuthority('cash:manage')")
class CourierCashSettlementController {
    private final CourierCashSettlementService settlements;

    CourierCashSettlementController(CourierCashSettlementService settlements) {
        this.settlements = settlements;
    }

    @GetMapping("/pending")
    List<CourierCashSettlementService.PendingCollection> pending() {
        return settlements.pending();
    }

    @PostMapping("/{collectionId}/settle")
    @ResponseStatus(HttpStatus.CREATED)
    CourierCashSettlementService.Settlement settle(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID collectionId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody SettleRequest request) {
        return settlements.settle(UUID.fromString(jwt.getSubject()), collectionId,
                request.cashSessionId(), idempotencyKey, requestId == null ? UUID.randomUUID() : requestId);
    }

    record SettleRequest(@NotNull UUID cashSessionId) {}
}

@Service
class CourierCashSettlementService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    CourierCashSettlementService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    @Transactional(readOnly = true)
    List<PendingCollection> pending() {
        return jdbc.query("""
            SELECT c.id, c.payment_id, p.account_id, c.courier_user_id, u.display_name AS courier_name,
                   p.amount, p.tip_amount, p.currency_id, cur.code AS currency, c.recorded_at
            FROM wok.courier_cash_collections c
            JOIN wok.payments p ON p.id = c.payment_id AND p.status = 'CAPTURED'
            JOIN wok.users u ON u.id = c.courier_user_id
            JOIN wok.currencies cur ON cur.id = p.currency_id
            WHERE c.status = 'PENDING_SETTLEMENT'
            ORDER BY c.recorded_at, c.id
            LIMIT 500
            """, (rs, row) -> new PendingCollection(rs.getObject("id", UUID.class),
                rs.getObject("payment_id", UUID.class), rs.getObject("account_id", UUID.class),
                rs.getObject("courier_user_id", UUID.class), rs.getString("courier_name"),
                rs.getBigDecimal("amount"), rs.getBigDecimal("tip_amount"), rs.getString("currency"),
                rs.getTimestamp("recorded_at").toInstant()));
    }

    @Transactional
    Settlement settle(UUID actor, UUID collectionId, UUID cashSessionId, UUID idempotencyKey, UUID requestId) {
        String scope = "COURIER_CASH_SETTLED";
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), scope, idempotencyKey,
                collectionId + "\n" + cashSessionId);
        if (claim.replay()) return receipt(claim.resourceId(), true);

        List<CollectionRow> collections = jdbc.query("""
            SELECT c.id, c.status, p.id AS payment_id, p.amount, p.tip_amount, p.status AS payment_status
            FROM wok.courier_cash_collections c
            JOIN wok.payments p ON p.id = c.payment_id
            WHERE c.id = ? FOR UPDATE OF c, p
            """, (rs, row) -> new CollectionRow(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getObject("payment_id", UUID.class), rs.getBigDecimal("amount"),
                rs.getBigDecimal("tip_amount"), rs.getString("payment_status")), collectionId);
        if (collections.isEmpty()) throw new AuthException(404, "No encontramos el efectivo pendiente del repartidor.");
        CollectionRow collection = collections.getFirst();
        if (!"PENDING_SETTLEMENT".equals(collection.status()) || !"CAPTURED".equals(collection.paymentStatus()))
            throw new AuthException(409, "Este cobro ya fue liquidado o no está disponible.");

        List<String> sessions = jdbc.query("""
            SELECT status FROM wok.cash_sessions WHERE id = ? FOR UPDATE
            """, (rs, row) -> rs.getString("status"), cashSessionId);
        if (sessions.isEmpty()) throw new AuthException(404, "No encontramos la caja indicada.");
        if (!"OPEN".equals(sessions.getFirst())) throw new AuthException(409, "La caja ya está cerrada.");

        UUID saleMovementId = jdbc.queryForObject("""
            INSERT INTO wok.cash_movements
                (cash_session_id, movement_type, amount_delta, payment_id, reason, responsible_user_id, request_id)
            VALUES (?, 'SALE', ?, ?, 'Liquidación de efectivo cobrado por repartidor', ?, ?) RETURNING id
            """, UUID.class, cashSessionId, collection.amount(), collection.paymentId(), actor, requestId);
        if (collection.tip().signum() > 0) {
            jdbc.update("""
                INSERT INTO wok.cash_movements
                    (cash_session_id, movement_type, amount_delta, reason, responsible_user_id, request_id)
                VALUES (?, 'INCOME', ?, 'Propina entregada por repartidor', ?, ?)
                """, cashSessionId, collection.tip(), actor, UUID.randomUUID());
        }
        int changed = jdbc.update("""
            UPDATE wok.courier_cash_collections
            SET status = 'SETTLED', settled_by = ?, settled_at = now(), settled_cash_session_id = ?
            WHERE id = ? AND status = 'PENDING_SETTLEMENT'
            """, actor, cashSessionId, collectionId);
        if (changed != 1) throw new AuthException(409, "La liquidación cambió. Actualiza la vista.");
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'COURIER_CASH_SETTLED', 'COURIER_CASH_COLLECTION', ?,
                    jsonb_build_object('cashSessionId', ?, 'amount', ?, 'tip', ?), 'SUCCESS', ?)
            """, actor, collectionId, cashSessionId, collection.amount(), collection.tip(), requestId);
        idempotency.complete(actor.toString(), scope, idempotencyKey, collectionId);
        return new Settlement(collectionId, collection.paymentId(), cashSessionId, saleMovementId,
                collection.amount(), collection.tip(), false);
    }

    private Settlement receipt(UUID collectionId, boolean replay) {
        return jdbc.query("""
            SELECT c.id, c.payment_id, c.settled_cash_session_id, p.amount, p.tip_amount,
                   (SELECT id FROM wok.cash_movements WHERE payment_id = p.id) AS sale_movement_id
            FROM wok.courier_cash_collections c JOIN wok.payments p ON p.id = c.payment_id WHERE c.id = ?
            """, (rs, row) -> new Settlement(rs.getObject("id", UUID.class),
                rs.getObject("payment_id", UUID.class), rs.getObject("settled_cash_session_id", UUID.class),
                rs.getObject("sale_movement_id", UUID.class), rs.getBigDecimal("amount"),
                rs.getBigDecimal("tip_amount"), replay), collectionId).stream().findFirst()
                .orElseThrow(() -> new AuthException(404, "No encontramos la liquidación."));
    }

    record PendingCollection(UUID collectionId, UUID paymentId, UUID accountId, UUID courierUserId,
            String courierName, BigDecimal amount, BigDecimal tip, String currency, java.time.Instant recordedAt) {}
    record Settlement(UUID collectionId, UUID paymentId, UUID cashSessionId, UUID cashMovementId,
            BigDecimal amount, BigDecimal tip, boolean idempotentReplay) {}
    private record CollectionRow(UUID id, String status, UUID paymentId, BigDecimal amount,
            BigDecimal tip, String paymentStatus) {}
}
