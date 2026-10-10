package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.hibernate.validator.constraints.CodePointLength;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/client/order-requests")
@PreAuthorize("hasRole('CLIENT')")
public class ClientOrderChangeController {
    private final OrderChangeRequestService changes;

    public ClientOrderChangeController(OrderChangeRequestService changes) { this.changes = changes; }

    @PostMapping("/{orderRequestId}/change-requests")
    @ResponseStatus(HttpStatus.CREATED)
    public OrderChangeReceipt submit(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderRequestId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody CancellationRequest request) {
        UUID actor = UUID.fromString(jwt.getSubject());
        return changes.submit(actor, requestId == null ? UUID.randomUUID() : requestId,
                orderRequestId, idempotencyKey, request);
    }

    @GetMapping("/change-requests")
    public List<OrderChangeReceipt> list(@AuthenticationPrincipal Jwt jwt) {
        return changes.listForCustomer(UUID.fromString(jwt.getSubject()));
    }

    @GetMapping("/{orderRequestId}/change-requests/current")
    public OrderChangeReceipt current(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID orderRequestId) {
        return changes.currentForCustomer(UUID.fromString(jwt.getSubject()), orderRequestId);
    }

    @RestController
    @RequestMapping("/api/v1/operational/order-change-requests")
    @PreAuthorize("hasAuthority('orders:manage')")
    static class OperationalController {
        private final OrderChangeRequestService changes;
        OperationalController(OrderChangeRequestService changes) { this.changes = changes; }

        @GetMapping
        public List<OrderChangeReceipt> list(@RequestParam(defaultValue = "PENDING_REVIEW") String status) {
            return changes.listForOperations(status);
        }

        @PatchMapping("/{changeRequestId}")
        public OrderChangeReceipt decide(@AuthenticationPrincipal Jwt jwt,
                @PathVariable UUID changeRequestId,
                @RequestHeader("Idempotency-Key") UUID idempotencyKey,
                @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
                @Valid @RequestBody DecisionRequest request) {
            return changes.decide(UUID.fromString(jwt.getSubject()),
                    requestId == null ? UUID.randomUUID() : requestId, changeRequestId, idempotencyKey, request);
        }
    }

    public record CancellationRequest(@NotBlank @CodePointLength(min = 3, max = 500) String reason) {
        public CancellationRequest { reason = reason == null ? null : reason.trim(); }
    }
    public record DecisionRequest(@NotNull Decision decision, @Positive int expectedVersion,
                                  @CodePointLength(min = 3, max = 500) String reason,Boolean override) {
        public DecisionRequest(Decision decision,int version,String reason){this(decision,version,reason,false);}
        public DecisionRequest { reason = reason == null || reason.isBlank() ? null : reason.trim(); override=Boolean.TRUE.equals(override); }
    }
    public enum Decision { APPROVE, REJECT }
    public record OrderChangeReceipt(UUID id, UUID orderRequestId, String orderCode, String requestType,
            String status, String reason, String decisionReason, int expectedOrderVersion, int version,
            Instant requestedAt, Instant decidedAt) {}

    @Service
    static class OrderChangeRequestService {
        private final JdbcTemplate jdbc;
        private final IdempotencyStore idempotency;
        private final OrderService orders;

        OrderChangeRequestService(JdbcTemplate jdbc, IdempotencyStore idempotency, OrderService orders) {
            this.jdbc = jdbc; this.idempotency = idempotency; this.orders = orders;
        }

        @Transactional
        OrderChangeReceipt submit(UUID customerId, UUID requestId, UUID orderRequestId,
                                  UUID idempotencyKey, CancellationRequest request) {
            String reason = normalizedReason(request.reason(), true);
            String fingerprint = fingerprint(orderRequestId + "|CANCEL_ORDER|" + reason);
            IdempotencyStore.Result claim = idempotency.claim(customerId.toString(), "ORDER_CHANGE_REQUEST",
                    idempotencyKey, fingerprint);
            if (claim.replay()) return getOwned(customerId, claim.resourceId());

            List<SourceOrder> sourceRows = jdbc.query("""
                SELECT o.id AS order_id, o.code, o.status, o.channel, o.row_version, o.account_id,
                       source.status AS request_status, source.fulfillment_type,
                       NULL::text AS dispatch_status
                FROM wok.order_requests source
                JOIN wok.orders o ON o.id = source.order_id

                WHERE source.id = ? AND source.customer_user_id = ?
                  AND source.status = 'ACCEPTED' AND source.order_id IS NOT NULL
                FOR UPDATE OF source, o
                """, (rs, row) -> new SourceOrder(rs.getObject("order_id", UUID.class), rs.getString("code"),
                    rs.getString("status"), rs.getString("channel"), rs.getInt("row_version"),
                    rs.getObject("account_id", UUID.class), rs.getString("fulfillment_type"),
                    rs.getString("dispatch_status")), orderRequestId, customerId);
            if (sourceRows.isEmpty()) throw new AuthException(404, "No encontramos un pedido aceptado de tu cuenta.");
            SourceOrder source = sourceRows.getFirst();
            validateCancellable(source);
            boolean pending = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM wok.order_change_requests
                    WHERE order_id = ? AND request_type = 'CANCEL_ORDER' AND status = 'PENDING_REVIEW')
                """, Boolean.class, source.orderId()));
            if (pending) throw new AuthException(409, "Ya hay una solicitud de cancelación pendiente para este pedido.");

            UUID id = UUID.randomUUID();
            jdbc.update("""
                INSERT INTO wok.order_change_requests
                    (id, order_id, order_request_id, customer_user_id, request_type, reason,
                     expected_order_version, request_id)
                VALUES (?, ?, ?, ?, 'CANCEL_ORDER', ?, ?, ?)
                """, id, source.orderId(), orderRequestId, customerId, reason, source.version(), requestId);
            jdbc.update("""
                INSERT INTO wok.order_change_request_events
                    (order_change_request_id, event_type, actor_user_id, reason, request_id)
                VALUES (?, 'SUBMITTED', ?, ?, ?)
                """, id, customerId, reason, requestId);
            jdbc.update("""
                INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
                VALUES (?, 'ORDER_CANCELLATION_REQUESTED', 'ORDER', ?,
                        jsonb_build_object('changeRequestId', ?, 'sourceRequestId', ?, 'orderVersion', ?),
                        'SUCCESS', ?)
                """, customerId, source.orderId(), id, orderRequestId, source.version(), requestId);
            idempotency.complete(customerId.toString(), "ORDER_CHANGE_REQUEST", idempotencyKey, id);
            return receipt(id);
        }

        List<OrderChangeReceipt> listForCustomer(UUID customerId) {
            return jdbc.query("""
                SELECT c.id, c.order_request_id, o.code, c.request_type, c.status, c.reason,
                       c.decision_reason, c.expected_order_version, c.row_version, c.created_at, c.decided_at
                FROM wok.order_change_requests c JOIN wok.orders o ON o.id = c.order_id
                WHERE c.customer_user_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT 100
                """, OrderChangeRequestService::map, customerId);
        }

        OrderChangeReceipt currentForCustomer(UUID customerId, UUID orderRequestId) {
            List<OrderChangeReceipt> rows = jdbc.query("""
                SELECT c.id, c.order_request_id, o.code, c.request_type, c.status, c.reason,
                       c.decision_reason, c.expected_order_version, c.row_version, c.created_at, c.decided_at
                FROM wok.order_change_requests c JOIN wok.orders o ON o.id = c.order_id
                WHERE c.order_request_id = ? AND c.customer_user_id = ?
                ORDER BY c.created_at DESC, c.id DESC LIMIT 1
                """, OrderChangeRequestService::map, orderRequestId, customerId);
            if (rows.isEmpty()) throw new AuthException(404, "No encontramos una solicitud de cambio para este pedido.");
            return rows.getFirst();
        }

        List<OrderChangeReceipt> listForOperations(String status) {
            String normalized = status == null ? "PENDING_REVIEW" : status.trim().toUpperCase();
            if (!List.of("PENDING_REVIEW", "APPROVED", "REJECTED").contains(normalized))
                throw new AuthException(422, "Estado de solicitud de cambio inválido.");
            return jdbc.query("""
                SELECT c.id, c.order_request_id, o.code, c.request_type, c.status, c.reason,
                       c.decision_reason, c.expected_order_version, c.row_version, c.created_at, c.decided_at
                FROM wok.order_change_requests c JOIN wok.orders o ON o.id = c.order_id
                WHERE c.status = ? ORDER BY c.created_at, c.id LIMIT 100
                """, OrderChangeRequestService::map, normalized);
        }

        @Transactional
        OrderChangeReceipt decide(UUID actor, UUID requestId, UUID changeRequestId,
                                  UUID idempotencyKey, DecisionRequest request) {
            String normalized = normalizedReason(request.reason(), request.decision() == Decision.REJECT);
            String reason = normalized == null ? "" : normalized;
            String fingerprint = fingerprint(changeRequestId + "|" + request.decision() + "|"
                    + request.expectedVersion() + "|" + reason + "|" + request.override());
            IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "ORDER_CHANGE_DECIDED",
                    idempotencyKey, fingerprint);
            if (claim.replay()) return receipt(claim.resourceId());
            List<PendingChange> rows = jdbc.query("""
                SELECT id, order_id, status, expected_order_version, row_version, request_type
                FROM wok.order_change_requests WHERE id = ? FOR UPDATE
                """, (rs, row) -> new PendingChange(rs.getObject("id", UUID.class),
                    rs.getObject("order_id", UUID.class), rs.getString("status"),
                    rs.getInt("expected_order_version"), rs.getInt("row_version"), rs.getString("request_type")), changeRequestId);
            if (rows.isEmpty()) throw new AuthException(404, "No encontramos la solicitud de cambio.");
            PendingChange change = rows.getFirst();
            if (!"PENDING_REVIEW".equals(change.status())) throw new AuthException(409, "La solicitud ya fue resuelta.");
            if (request.expectedVersion() != change.version()) throw new AuthException(409, "La solicitud cambió. Actualiza la cola operativa.");
            String decisionReason = reason.isBlank() ? null : reason;
            if (request.decision() == Decision.REJECT && decisionReason == null)
                throw new AuthException(422, "Indica el motivo para no aceptar la cancelación.");

            if (request.decision() == Decision.APPROVE) {
                cancelOrder(actor, requestId, change.orderId(), change.expectedOrderVersion(),request.override(),request.reason());
            }
            String nextStatus = request.decision() == Decision.APPROVE ? "APPROVED" : "REJECTED";
            jdbc.update("""
                UPDATE wok.order_change_requests SET status = ?, decision_reason = ?, decided_by = ?, decided_at = now(),
                    updated_at = now(), row_version = row_version + 1 WHERE id = ? AND row_version = ?
                """, nextStatus, decisionReason, actor, changeRequestId, request.expectedVersion());
            jdbc.update("""
                INSERT INTO wok.order_change_request_events
                    (order_change_request_id, event_type, actor_user_id, reason, request_id)
                VALUES (?, ?, ?, ?, ?)
                """, changeRequestId, nextStatus, actor, decisionReason, requestId);
            jdbc.update("""
                INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id, before_data,
                    after_data, reason, result, request_id)
                VALUES (?, 'ORDER_CANCELLATION_DECIDED', 'ORDER_CHANGE_REQUEST', ?,
                    jsonb_build_object('status', 'PENDING_REVIEW', 'version', ?),
                    jsonb_build_object('status', ?, 'version', ?), ?, 'SUCCESS', ?)
                """, actor, changeRequestId, change.version(), nextStatus, change.version() + 1, decisionReason, requestId);
            idempotency.complete(actor.toString(), "ORDER_CHANGE_DECIDED", idempotencyKey, changeRequestId);
            return receipt(changeRequestId);
        }

        private void cancelOrder(UUID actor, UUID requestId, UUID orderId, int expectedVersion,boolean override,String reason) {
            // Mismo orden de bloqueo que pagos y pedidos: cuenta antes del pedido.
            List<UUID> accounts = jdbc.query("SELECT account_id FROM wok.orders WHERE id = ?",
                    (rs, row) -> rs.getObject(1, UUID.class), orderId);
            if (accounts.isEmpty()) throw new AuthException(404, "No encontramos el pedido asociado.");
            jdbc.query("SELECT id FROM wok.order_accounts WHERE id = ? FOR UPDATE",
                    (rs, row) -> rs.getObject(1, UUID.class), accounts.getFirst());
            List<CancellationOrder> rows = jdbc.query("""
                SELECT id, account_id, status, row_version FROM wok.orders WHERE id = ? FOR UPDATE
                """, (rs, row) -> new CancellationOrder(rs.getObject("id", UUID.class),
                    rs.getObject("account_id", UUID.class), rs.getString("status"), rs.getInt("row_version")), orderId);
            if (rows.isEmpty()) throw new AuthException(404, "No encontramos el pedido asociado.");
            CancellationOrder order = rows.getFirst();
            if (order.version() != expectedVersion) throw new AuthException(409, "El pedido cambió desde que se solicitó la cancelación.");
            if (!List.of("SENT", "PREPARING", "READY").contains(order.status()))
                throw new AuthException(409, "El pedido ya avanzó y no puede cancelarse desde esta solicitud.");
            boolean captured = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM wok.payments WHERE account_id = ? AND status = 'CAPTURED')
                """, Boolean.class, order.accountId()));
            if (captured) throw new AuthException(409, "El pedido tiene un pago registrado. Coordina la cancelacion con el equipo; no se generan devoluciones.");
            orders.changeStatus(actor, requestId, orderId,
                    new OperationalOrderController.StatusRequest(OrderService.OrderStatus.CANCELLED,
                            expectedVersion, reason==null?"CANCELLED_BY_CUSTOMER_REQUEST":reason,override));
        }

        private OrderChangeReceipt getOwned(UUID customerId, UUID id) {
            List<OrderChangeReceipt> found = jdbc.query("""
                SELECT c.id, c.order_request_id, o.code, c.request_type, c.status, c.reason,
                       c.decision_reason, c.expected_order_version, c.row_version, c.created_at, c.decided_at
                FROM wok.order_change_requests c JOIN wok.orders o ON o.id = c.order_id
                WHERE c.id = ? AND c.customer_user_id = ?
                """, OrderChangeRequestService::map, id, customerId);
            if (found.isEmpty()) throw new AuthException(409, "No se pudo recuperar la solicitud idempotente.");
            return found.getFirst();
        }

        private OrderChangeReceipt receipt(UUID id) {
            List<OrderChangeReceipt> found = jdbc.query("""
                SELECT c.id, c.order_request_id, o.code, c.request_type, c.status, c.reason,
                       c.decision_reason, c.expected_order_version, c.row_version, c.created_at, c.decided_at
                FROM wok.order_change_requests c JOIN wok.orders o ON o.id = c.order_id WHERE c.id = ?
                """, OrderChangeRequestService::map, id);
            if (found.isEmpty()) throw new AuthException(404, "No encontramos la solicitud de cambio.");
            return found.getFirst();
        }

        private static OrderChangeReceipt map(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
            return new OrderChangeReceipt(rs.getObject("id", UUID.class), rs.getObject("order_request_id", UUID.class),
                    rs.getString("code"), rs.getString("request_type"), rs.getString("status"), rs.getString("reason"),
                    rs.getString("decision_reason"), rs.getInt("expected_order_version"), rs.getInt("row_version"),
                    rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("decided_at") == null
                            ? null : rs.getTimestamp("decided_at").toInstant());
        }

        private static void validateCancellable(SourceOrder source) {
            if (!List.of("PICKUP","DELIVERY").contains(source.channel()) || !source.channel().equals(source.fulfillmentType()))
                throw new AuthException(422, "Este canal requiere coordinar la cancelación directamente con el equipo.");
            if (!List.of("SENT", "PREPARING", "READY").contains(source.status()))
                throw new AuthException(409, "El pedido ya avanzó y requiere atención directa del equipo.");
        }

        private static String fingerprint(String input) {
            try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
            catch (NoSuchAlgorithmException error) { throw new IllegalStateException("SHA-256 unavailable", error); }
        }

        private static String normalizedReason(String value, boolean required) {
            String reason = value == null ? null : value.trim();
            if (reason == null || reason.isBlank()) {
                if (required) throw new AuthException(422, "Indica un motivo de 3 a 500 caracteres.");
                return null;
            }
            // PostgreSQL UTF-8 cuenta caracteres, no unidades UTF-16; no aplicar NFC/NFKC.
            int characters = reason.codePointCount(0, reason.length());
            if (characters < 3 || characters > 500)
                throw new AuthException(422, "El motivo debe tener de 3 a 500 caracteres.");
            return reason;
        }

        private record SourceOrder(UUID orderId, String code, String status, String channel, int version,
                                   UUID accountId, String fulfillmentType, String dispatchStatus) {}
        private record PendingChange(UUID id, UUID orderId, String status, int expectedOrderVersion,
                                     int version, String requestType) {}
        private record CancellationOrder(UUID id, UUID accountId, String status, int version) {}
        private record BigDecimalBalance(java.math.BigDecimal amount) {}
    }
}
