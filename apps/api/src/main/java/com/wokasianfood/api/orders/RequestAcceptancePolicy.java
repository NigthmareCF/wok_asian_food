package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

final class RequestAcceptancePolicy {
    private RequestAcceptancePolicy() {}
    static void prepare(JdbcTemplate jdbc,UUID requestId) {
        var headers=jdbc.query("""
            SELECT r.fulfillment_type,r.requested_for,r.policy_review_required,r.override_by,r.logistics_confirmed_at,
                r.customer_user_id,r.contact_phone,h.status AS hold_status,h.expires_at,r.created_at
            FROM wok.order_requests r LEFT JOIN wok.order_capacity_holds h ON h.order_request_id=r.id
            WHERE r.id=?
            """,(rs,n)->new Header(rs.getString(1),rs.getTimestamp(2).toInstant(),rs.getBoolean(3),
                rs.getObject(4,UUID.class),rs.getTimestamp(5),rs.getObject(6,UUID.class),rs.getString(7),
                rs.getString(8),rs.getTimestamp(9),rs.getTimestamp(10).toInstant()),requestId);
        Header header=headers.getFirst();
        if(!"ACTIVE".equals(header.holdStatus())||header.expiry()==null||!header.expiry().toInstant().isAfter(Instant.now()))
            throw new AuthException(409,"El hold venció o no existe. El cliente debe aceptar una nueva cotización.");
        if(header.review()&&header.override()==null) throw new AuthException(409,"Esta solicitud requiere un override autorizado.");
        if(header.override()!=null) {
            Boolean authorized=jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM wok.user_roles ur JOIN wok.roles r ON r.id=ur.role_id
                JOIN wok.users u ON u.id=ur.user_id WHERE ur.user_id=? AND ur.revoked_at IS NULL
                AND r.code='ADMIN' AND r.active=true AND u.status='ACTIVE')
                """,Boolean.class,header.override());
            if(!Boolean.TRUE.equals(authorized)) throw new AuthException(409,"La autorización del override ya no está vigente.");
        }
        if("DELIVERY".equals(header.fulfillment())) {
            com.wokasianfood.api.identity.PhoneVerificationService.requireVerified(jdbc,header.customer(),header.phone());
            if(header.logistics()==null) throw new AuthException(409,"Operativo debe confirmar la logística del delivery.");
        }
        var holds=new OrderCapacityHoldService(jdbc,12);holds.lockInventory(requestId);
        List<Line> lines=jdbc.query("""
            SELECT ri.id,ri.menu_item_id,ri.quantity,ri.unit_price,mi.price,mi.preparation_area_id,
                mi.estimated_preparation_seconds FROM wok.order_request_items ri
            JOIN wok.menu_items mi ON mi.id=ri.menu_item_id WHERE ri.order_request_id=? ORDER BY ri.menu_item_id
            """,(rs,n)->new Line(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getInt(3),
                rs.getBigDecimal(4),rs.getBigDecimal(5),rs.getObject(6,UUID.class),rs.getLong(7)),requestId);
        Map<UUID,Long> preparation=new LinkedHashMap<>();
        for(Line line:lines) {
            List<UUID> modifiers=jdbc.query("SELECT modifier_id FROM wok.order_request_item_modifiers WHERE order_request_item_id=? ORDER BY modifier_id",
                (rs,n)->rs.getObject(1,UUID.class),line.id());
            if(RequestQuoteBridge.price(jdbc,line.menuItem(),line.current(),modifiers).compareTo(line.quoted())!=0)
                throw new AuthException(409,"El precio cambió; solicita una cotización nueva con consentimiento del cliente.");
            preparation.merge(line.station(),line.preparation()*line.quantity(),Long::sum);
        }
        long eta=new KitchenQueueEstimator(jdbc).estimate(preparation,true,header.requestedFor(),requestId).overallReadySeconds();
        var policy=new com.wokasianfood.api.service.ServiceHoursPolicy(jdbc);
        var assessment=policy.assess(header.fulfillment(),header.requestedFor(),header.receivedAt(),0);
        if(assessment.requiresHumanReview()&&header.override()==null)throw new AuthException(409,"La política vigente requiere un override autorizado.");
        var current=policy.assess(header.fulfillment(),header.requestedFor(),Instant.now(),eta);
        // Delivery cutoff uses reception time; pickup preparation uses the actual acceptance time.
        if("PICKUP".equals(header.fulfillment())&&current.requiresHumanReview()&&header.override()==null)
            throw new AuthException(409,"La preparación actual requiere un override autorizado.");
        holds.finish(requestId,OrderCapacityHoldService.EndState.CONVERTED);
    }
    private record Header(String fulfillment,Instant requestedFor,boolean review,UUID override,Timestamp logistics,
        UUID customer,String phone,String holdStatus,Timestamp expiry,Instant receivedAt) {}
    private record Line(UUID id,UUID menuItem,int quantity,BigDecimal quoted,BigDecimal current,UUID station,long preparation) {}
}
