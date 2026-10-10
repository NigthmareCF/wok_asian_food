package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Binds a submitted request to an owned, unexpired quote and consumes it atomically. */
@Service
public class OrderQuoteService {
    private final JdbcTemplate jdbc;
    private final KitchenQueueEstimator kitchenQueue;
    private final OrderCapacityHoldService capacityHolds;

    @Autowired
    public OrderQuoteService(JdbcTemplate jdbc, KitchenQueueEstimator kitchenQueue, OrderCapacityHoldService capacityHolds) {
        this.jdbc = jdbc; this.kitchenQueue = kitchenQueue; this.capacityHolds = capacityHolds;
    }

    OrderQuoteService(JdbcTemplate jdbc) {
        this(jdbc, new KitchenQueueEstimator(jdbc), new OrderCapacityHoldService(jdbc, 12));
    }

    @Transactional
    public void consume(UUID customerId, UUID quoteId, ClientOrderQuoteController.FulfillmentType fulfillment,
            Instant requestedFor, List<ClientOrderQuoteController.QuoteLineRequest> lines,
            BigDecimal currentSubtotal, UUID currencyId, UUID orderRequestId) {
        List<Quote> rows = jdbc.query("""
                SELECT id, fulfillment_type, request_fingerprint, subtotal, currency_id, status, expires_at
                FROM wok.order_quotes WHERE id = ? AND customer_user_id = ? FOR UPDATE
                """, (rs, row) -> new Quote(rs.getObject("id", UUID.class), rs.getString("fulfillment_type"),
                rs.getString("request_fingerprint"), rs.getBigDecimal("subtotal"),
                rs.getObject("currency_id", UUID.class), rs.getString("status"),
                rs.getTimestamp("expires_at").toInstant()), quoteId, customerId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos una cotización de tu cuenta.");
        Quote quote = rows.getFirst();
        if (!"ACTIVE".equals(quote.status()))
            throw new AuthException(409, "La cotización ya no está disponible. Solicita una nueva.");
        if (!quote.expiresAt().isAfter(Instant.now())) {
            jdbc.update("UPDATE wok.order_quotes SET status = 'EXPIRED' WHERE id = ?", quoteId);
            throw new AuthException(409, "La cotización venció. Actualiza el carrito para continuar.");
        }
        String currentFingerprint = ClientOrderQuoteController.fingerprint(fulfillment, requestedFor, lines);
        if (!quote.fulfillmentType().equals(fulfillment.name()) || !quote.fingerprint().equals(currentFingerprint))
            throw new AuthException(409, "El carrito o el horario cambió desde la cotización. Cotiza de nuevo.");
        if (!quote.currencyId().equals(currencyId) || quote.subtotal().compareTo(currentSubtotal) != 0) {
            throw new AuthException(409, "El precio cambió desde la cotización. Cotiza de nuevo antes de enviar.");
        }
        Map<UUID, Long> preparationByStation = jdbc.query("""
                SELECT mi.preparation_area_id, sum(mi.estimated_preparation_seconds::bigint * qi.quantity)::bigint AS seconds
                FROM wok.order_quote_items qi JOIN wok.menu_items mi ON mi.id = qi.menu_item_id
                WHERE qi.order_quote_id = ? GROUP BY mi.preparation_area_id ORDER BY mi.preparation_area_id
                """, rs -> {
            Map<UUID, Long> values = new LinkedHashMap<>();
            while (rs.next()) values.put(rs.getObject("preparation_area_id", UUID.class), rs.getLong("seconds"));
            return values;
        }, quoteId);
        com.wokasianfood.api.inventory.InventoryRequirements.lock(jdbc,capacityHolds.quoteRequirements(quoteId).keySet());
        KitchenQueueEstimator.Estimate estimate = kitchenQueue.estimate(preparationByStation, true, requestedFor);
        long etaSeconds = estimate.overallReadySeconds();
        if (etaSeconds > 86_400 || !requestedFor.isAfter(Instant.now().plusSeconds(etaSeconds)))
            throw new AuthException(409, "La cola de cocina cambió. Revisa otra hora antes de enviar la solicitud.");
        int consumed = jdbc.update("""
                UPDATE wok.order_quotes SET status = 'CONSUMED', consumed_order_request_id = ?, consumed_at = now()
                WHERE id = ? AND customer_user_id = ? AND status = 'ACTIVE' AND expires_at > now()
        """, orderRequestId, quoteId, customerId);
        if (consumed != 1) throw new AuthException(409, "La cotización dejó de estar disponible.");
        capacityHolds.create(quoteId, orderRequestId, requestedFor, preparationByStation);
    }

    private record Quote(UUID id, String fulfillmentType, String fingerprint, BigDecimal subtotal,
            UUID currencyId, String status, Instant expiresAt) {}
}
