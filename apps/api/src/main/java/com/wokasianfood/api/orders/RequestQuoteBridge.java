package com.wokasianfood.api.orders;

import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Additive hooks used by the existing request controllers, preserving their owned receipts/replay. */
final class RequestQuoteBridge {
    private RequestQuoteBridge() {}
    static BigDecimal price(JdbcTemplate jdbc, UUID menuItem,BigDecimal base,List<UUID> modifierIds) {
        return new ModifierSelectionService(jdbc).validate(menuItem,modifierIds).stream()
            .map(ModifierSelectionService.SelectedModifier::priceDelta).reduce(base,BigDecimal::add);
    }
    static void consume(JdbcTemplate jdbc, UUID customer, UUID quoteId, String fulfillment,
            Instant requestedFor,List<ClientOrderQuoteController.QuoteLineRequest> lines,
            BigDecimal subtotal,UUID currency,UUID requestId) {
        if(quoteId==null) throw new AuthException(422,"Acepta una cotización vigente para continuar formalmente la solicitud.");
        var holds=new OrderCapacityHoldService(jdbc,12);
        new OrderQuoteService(jdbc,new KitchenQueueEstimator(jdbc),holds).consume(customer,quoteId,
            ClientOrderQuoteController.FulfillmentType.valueOf(fulfillment),requestedFor,lines,subtotal,currency,requestId);
        for(var line:lines) {
            UUID item=jdbc.queryForObject("SELECT id FROM wok.order_request_items WHERE order_request_id=? AND menu_item_id=?",UUID.class,requestId,line.menuItemId());
            for(var modifier:new ModifierSelectionService(jdbc).validate(line.menuItemId(),line.modifierIds()))
                jdbc.update("""
                    INSERT INTO wok.order_request_item_modifiers(order_request_item_id,modifier_id,group_name_snapshot,modifier_name_snapshot,price_delta)
                    VALUES(?,?,?,?,?)
                    """,item,modifier.id(),modifier.groupName(),modifier.name(),modifier.priceDelta());
        }
        boolean review=new com.wokasianfood.api.service.ServiceHoursPolicy(jdbc)
            .assess(fulfillment,requestedFor,jdbc.queryForObject("SELECT created_at FROM wok.order_requests WHERE id=?",java.sql.Timestamp.class,requestId).toInstant(),0).requiresHumanReview();
        jdbc.update("UPDATE wok.order_requests SET policy_review_required=? WHERE id=?",review,requestId);
    }
}
