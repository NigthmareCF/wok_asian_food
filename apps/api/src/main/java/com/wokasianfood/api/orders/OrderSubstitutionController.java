package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.hibernate.validator.constraints.CodePointLength;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
public class OrderSubstitutionController {
    private final Substitutions service;private final ReservationSubstitutionService preorders;
    public OrderSubstitutionController(Substitutions service,ReservationSubstitutionService preorders){this.service=service;this.preorders=preorders;}
    @PostMapping("/api/v1/operational/reservations/{reservationId}/order-substitutions")
    @PreAuthorize("hasAuthority('orders:manage')")
    public Receipt converted(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID reservationId,@RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody Proposal request){return service.proposeReservation(user(jwt),reservationId,key,request);}
    @PostMapping("/api/v1/operational/order-requests/{requestId}/substitutions")
    @PreAuthorize("hasAuthority('orders:manage')")
    public Receipt propose(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID requestId,
        @RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody Proposal request){return service.propose(user(jwt),requestId,key,request);}
    @GetMapping("/api/v1/client/substitutions")
    @PreAuthorize("hasRole('CLIENT')")
    public List<Receipt> owned(@AuthenticationPrincipal Jwt jwt){return java.util.stream.Stream.concat(service.list(user(jwt),false).stream(),preorders.list(user(jwt),false).stream()).toList();}
    @GetMapping("/api/v1/operational/substitutions")
    @PreAuthorize("hasAuthority('orders:manage')")
    public List<Receipt> operations(){return java.util.stream.Stream.concat(service.list(null,true).stream(),preorders.list(null,true).stream()).toList();}
    @PostMapping("/api/v1/client/substitutions/{id}/decision")
    @PreAuthorize("hasRole('CLIENT')")
    public Receipt consent(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("Idempotency-Key") UUID key,
        @Valid @RequestBody Consent request){return service.consent(user(jwt),id,key,request);}
    @PostMapping("/api/v1/operational/substitutions/{id}/decision")
    @PreAuthorize("hasAuthority('orders:manage')")
    public Receipt decide(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("Idempotency-Key") UUID key,
        @Valid @RequestBody Decision request){return service.decide(user(jwt),id,key,request);}
    private UUID user(Jwt jwt){return UUID.fromString(jwt.getSubject());}
    public record Proposal(@NotNull UUID orderItemId,@NotNull UUID replacementMenuItemId,
        @Size(max=30) List<@NotNull UUID> modifierIds,@Positive int expectedOrderVersion,
        @NotBlank @CodePointLength(min=3,max=500) String reason){public Proposal{modifierIds=modifierIds==null?List.of():modifierIds.stream().sorted().toList();}}
    public record Consent(boolean accept,@Positive int expectedVersion) {}
    public record Decision(boolean apply,@Positive int expectedVersion,boolean override,
        @NotBlank @CodePointLength(min=3,max=500) String reason) {}
    public record Receipt(UUID id,UUID orderRequestId,UUID orderId,UUID orderItemId,String replacementName,
        int quantity,BigDecimal replacementUnitPrice,BigDecimal priceDifference,String currency,
        String status,String financialResolution,boolean manualReview,int version,Instant expiresAt,String reason,String originalName,BigDecimal originalUnitPrice,boolean preorder,UUID reservationId) {}

    @Service
    static class Substitutions {
        private final JdbcTemplate jdbc;private final IdempotencyStore keys;private final OrderService orders;
        Substitutions(JdbcTemplate jdbc,IdempotencyStore keys,OrderService orders){this.jdbc=jdbc;this.keys=keys;this.orders=orders;}
        @Transactional
        Receipt propose(UUID actor,UUID requestId,UUID key,Proposal request){return propose(actor,requestId,key,request,false);}
        @Transactional
        Receipt proposeReservation(UUID actor,UUID reservationId,UUID key,Proposal request){return propose(actor,reservationId,key,request,true);}
        private Receipt propose(UUID actor,UUID requestId,UUID key,Proposal request,boolean reservation){
            var claim=keys.claim(actor.toString(),"SUBSTITUTION_PROPOSE",key,hash(reservation+"|"+requestId+"|"+request));
            if(claim.replay())return receipt(claim.resourceId());
            var source=jdbc.query(reservation?"""
                SELECT r.preorder_order_id,p.user_id,o.row_version,o.status,i.quantity,i.unit_price,o.currency_id,o.account_id
                FROM wok.reservations r JOIN wok.customer_profiles p ON p.id=r.customer_id JOIN wok.orders o ON o.id=r.preorder_order_id JOIN wok.order_items i ON i.order_id=o.id
                WHERE r.id=? AND i.id=? AND r.status IN ('CONFIRMED','ARRIVED','SEATED')
                """:"""
                SELECT r.order_id,r.customer_user_id,o.row_version,o.status,i.quantity,i.unit_price,o.currency_id,o.account_id
                FROM wok.order_requests r JOIN wok.orders o ON o.id=r.order_id JOIN wok.order_items i ON i.order_id=o.id
                WHERE r.id=? AND i.id=? AND r.status='ACCEPTED'
                """,(rs,n)->new Source(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getInt(3),rs.getString(4),
                    rs.getInt(5),rs.getBigDecimal(6),rs.getObject(7,UUID.class),rs.getObject(8,UUID.class)),requestId,request.orderItemId());
            if(source.isEmpty())throw new AuthException(404,"No encontramos esa línea en un pedido aceptado.");Source old=source.getFirst();
            lockAccountOrder(old.account(),old.order());
            int version=jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id=?",Integer.class,old.order());
            if(version!=request.expectedOrderVersion()||!List.of("SENT","PREPARING","READY").contains(old.status()))throw new AuthException(409,"El pedido cambió o ya no admite sustituciones.");
            OrderMutationGuard.requireNoUncertainPayment(jdbc,old.account());
            var replacements=jdbc.query("""
                SELECT name,price,currency_id FROM wok.menu_items WHERE id=? AND status='ACTIVE' AND visibility='PUBLIC' FOR SHARE
                """,(rs,n)->new Replacement(rs.getString(1),rs.getBigDecimal(2),rs.getObject(3,UUID.class)),request.replacementMenuItemId());
            if(replacements.isEmpty())throw new AuthException(422,"El sustituto no está publicado.");Replacement replacement=replacements.getFirst();
            if(!old.currency().equals(replacement.currency()))throw new AuthException(422,"La sustitución no puede cambiar de moneda.");
            BigDecimal price=RequestQuoteBridge.price(jdbc,request.replacementMenuItemId(),replacement.price(),request.modifierIds());
            String displayName=replacement.name()+modifierDescription(request.replacementMenuItemId(),request.modifierIds());
            BigDecimal difference=price.subtract(old.price()).multiply(BigDecimal.valueOf(old.quantity()));
            boolean paid=paid(old.account());
            if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM wok.order_substitution_requests WHERE order_item_id=? AND status IN ('PENDING_CONSENT','CONSENTED','FINANCIAL_REVIEW_REQUIRED'))",Boolean.class,request.orderItemId())))throw new AuthException(409,"Ya existe una propuesta pendiente para esta línea.");
            UUID id=UUID.randomUUID();
            jdbc.update(connection->{var statement=connection.prepareStatement("""
                INSERT INTO wok.order_substitution_requests(id,order_request_id,order_id,order_item_id,customer_user_id,proposed_by,
                  replacement_menu_item_id,replacement_name,replacement_unit_price,modifier_ids,quantity,price_difference,
                  expected_order_version,reason,expires_at,financial_resolution,reservation_id)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,now()+interval '12 minutes',?,?)
                """);Object[] values={id,reservation?null:requestId,old.order(),request.orderItemId(),old.customer(),actor,request.replacementMenuItemId(),displayName,price};
                for(int i=0;i<values.length;i++)statement.setObject(i+1,values[i]);
                statement.setArray(10,connection.createArrayOf("uuid",request.modifierIds().toArray(UUID[]::new)));
                statement.setInt(11,old.quantity());statement.setBigDecimal(12,difference);statement.setInt(13,version);
                statement.setString(14,request.reason().trim());statement.setString(15,paid&&difference.signum()!=0?"BLOCKED_NO_CONTRACT":"NOT_REQUIRED");statement.setObject(16,reservation?requestId:null);return statement;});
            jdbc.update("UPDATE wok.order_substitution_requests SET original_snapshot=(SELECT jsonb_build_object('menuItemId',i.menu_item_id,'name',i.name_snapshot,'unitPrice',i.unit_price,'quantity',i.quantity,'modifiers',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM wok.order_item_modifiers m WHERE m.order_item_id=i.id),'[]'::jsonb)) FROM wok.order_items i WHERE i.id=?) WHERE id=?",request.orderItemId(),id);
            event(actor,id,"PROPOSED",request.reason(),key);keys.complete(actor.toString(),"SUBSTITUTION_PROPOSE",key,id);return receipt(id);
        }
        @Transactional
        Receipt consent(UUID user,UUID id,UUID key,Consent request){
            var claim=keys.claim(user.toString(),"SUBSTITUTION_CONSENT",key,hash(id+"|"+request));
            if(claim.replay()){Receipt r=receipt(claim.resourceId());requireOwner(user,id);return r;}
            requireOwner(user,id);var row=lock(id);
            if(!row.status().equals("PENDING_CONSENT")||row.version()!=request.expectedVersion())throw new AuthException(409,"La propuesta cambió o ya fue atendida.");
            if(!row.expiry().isAfter(Instant.now()))throw new AuthException(410,"La propuesta venció.");
            String status=request.accept()?(row.financial().equals("NOT_REQUIRED")?"CONSENTED":"FINANCIAL_REVIEW_REQUIRED"):"DECLINED";
            jdbc.update("UPDATE wok.order_substitution_requests SET status=?,consented_at=CASE WHEN ? THEN now() ELSE NULL END,row_version=row_version+1 WHERE id=?",
                status,request.accept(),id);event(user,id,status,null,key);keys.complete(user.toString(),"SUBSTITUTION_CONSENT",key,id);return receipt(id);
        }
        @Transactional
        Receipt decide(UUID actor,UUID id,UUID key,Decision request){
            var claim=keys.claim(actor.toString(),"SUBSTITUTION_DECIDE",key,hash(id+"|"+request));if(claim.replay())return receipt(claim.resourceId());
            UUID order=jdbc.queryForObject("SELECT order_id FROM wok.order_substitution_requests WHERE id=?",UUID.class,id);
            UUID account=jdbc.queryForObject("SELECT account_id FROM wok.orders WHERE id=?",UUID.class,order);lockAccountOrder(account,order);
            var row=lock(id);
            if(row.version()!=request.expectedVersion()||!List.of("CONSENTED","FINANCIAL_REVIEW_REQUIRED","PENDING_CONSENT").contains(row.status()))throw new AuthException(409,"La propuesta cambió o ya fue resuelta.");
            if(request.apply()){
                if(row.consented()==null)throw new AuthException(409,"Falta el consentimiento explícito del cliente.");
                if(!row.expiry().isAfter(Instant.now()))throw new AuthException(410,"La propuesta venció.");
                OrderMutationGuard.requireNoUncertainPayment(jdbc,account);
                if(row.financial().equals("NOT_REQUIRED")&&paid(account)&&row.difference().signum()!=0){
                    jdbc.update("UPDATE wok.order_substitution_requests SET financial_resolution='BLOCKED_NO_CONTRACT',status='FINANCIAL_REVIEW_REQUIRED',row_version=row_version+1 WHERE id=?",id);
                    event(actor,id,"FINANCIAL_REVIEW_REQUIRED",request.reason(),key);keys.complete(actor.toString(),"SUBSTITUTION_DECIDE",key,id);return receipt(id);
                }
                if(!row.financial().equals("NOT_REQUIRED"))throw new AuthException(409,"La diferencia pagada requiere un contrato real de ajuste o devolución, aún no disponible. El consentimiento queda registrado sin cargos ni reembolsos.");
                String status=jdbc.queryForObject("SELECT status FROM wok.orders WHERE id=?",String.class,order);
                int version=jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id=?",Integer.class,order);
                if(version!=row.orderVersion()||!List.of("SENT","PREPARING","READY").contains(status))throw new AuthException(409,"El pedido cambió. Propón una sustitución nueva.");
                if(!status.equals("SENT"))OrderMutationGuard.requireOverride(jdbc,actor,request.override(),request.reason());
                orders.applyConsentedSubstitution(actor,key,order,row.item(),row.replacement(),row.price(),row.modifiers());
            }
            int changed=jdbc.update("UPDATE wok.order_substitution_requests SET status=?,decision_reason=?,decided_by=?,decided_at=now(),row_version=row_version+1 WHERE id=? AND (expires_at>now() OR ?=false)",
                request.apply()?"APPLIED":"REJECTED",request.reason().trim(),actor,id,request.apply());
            if(changed!=1)throw new AuthException(410,"La propuesta venció durante la revisión.");
            event(actor,id,request.apply()?"APPLIED":"REJECTED",request.reason(),key);keys.complete(actor.toString(),"SUBSTITUTION_DECIDE",key,id);return receipt(id);
        }
        List<Receipt> list(UUID user,boolean operational){return jdbc.query("SELECT id FROM wok.order_substitution_requests WHERE (? OR customer_user_id=?::uuid) ORDER BY created_at DESC LIMIT 100",
            (rs,n)->receipt(rs.getObject(1,UUID.class)),operational,user);}
        private void requireOwner(UUID user,UUID id){Boolean owned=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM wok.order_substitution_requests WHERE id=? AND customer_user_id=?)",Boolean.class,id,user);if(!Boolean.TRUE.equals(owned))throw new AuthException(404,"No encontramos esa propuesta en tu cuenta.");}
        private void lockAccountOrder(UUID account,UUID order){jdbc.queryForObject("SELECT id FROM wok.order_accounts WHERE id=? FOR UPDATE",UUID.class,account);jdbc.queryForObject("SELECT id FROM wok.orders WHERE id=? FOR UPDATE",UUID.class,order);}
        private boolean paid(UUID account){return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM wok.payments WHERE account_id=? AND status='CAPTURED')",Boolean.class,account));}
        private String modifierDescription(UUID item,List<UUID> modifiers){var names=new com.wokasianfood.api.catalog.ModifierSelectionService(jdbc).validate(item,modifiers).stream().map(m->m.groupName()+": "+m.name()).toList();return names.isEmpty()?"":" ("+String.join(", ",names)+")";}
        private Row lock(UUID id){var rows=jdbc.query("""
            SELECT status,row_version,expires_at,financial_resolution,consented_at,order_item_id,replacement_menu_item_id,
                replacement_unit_price,modifier_ids,expected_order_version,price_difference
            FROM wok.order_substitution_requests WHERE id=? FOR UPDATE
            """,(rs,n)->new Row(rs.getString(1),rs.getInt(2),rs.getTimestamp(3).toInstant(),rs.getString(4),rs.getTimestamp(5),
                rs.getObject(6,UUID.class),rs.getObject(7,UUID.class),rs.getBigDecimal(8),Arrays.asList((UUID[])rs.getArray(9).getArray()),rs.getInt(10),rs.getBigDecimal(11)),id);
            if(rows.isEmpty())throw new AuthException(404,"No encontramos esa propuesta.");return rows.getFirst();}
        private Receipt receipt(UUID id){return jdbc.queryForObject("""
            SELECT s.*,s.original_snapshot->>'name' AS original_name,(s.original_snapshot->>'unitPrice')::numeric AS original_price,c.code AS currency,o.status AS order_status FROM wok.order_substitution_requests s
            JOIN wok.orders o ON o.id=s.order_id JOIN wok.currencies c ON c.id=o.currency_id WHERE s.id=?
            """,(rs,n)->new Receipt(id,rs.getObject("order_request_id",UUID.class),rs.getObject("order_id",UUID.class),rs.getObject("order_item_id",UUID.class),
                rs.getString("replacement_name"),rs.getInt("quantity"),rs.getBigDecimal("replacement_unit_price"),rs.getBigDecimal("price_difference"),rs.getString("currency"),
                rs.getString("status"),rs.getString("financial_resolution"),List.of("PREPARING","READY").contains(rs.getString("order_status")),rs.getInt("row_version"),rs.getTimestamp("expires_at").toInstant(),rs.getString("reason"),rs.getString("original_name"),rs.getBigDecimal("original_price"),false,rs.getObject("reservation_id",UUID.class)),id);}
        private void event(UUID actor,UUID id,String type,String reason,UUID key){
            jdbc.update("INSERT INTO wok.order_substitution_events(substitution_id,actor_user_id,event_type,reason,request_id) VALUES(?,?,?,?,?)",id,actor,type,reason,key);
            jdbc.update("INSERT INTO wok.audit_logs(actor_user_id,action,entity_type,entity_id,after_data,reason,result,request_id) VALUES(?,'SUBSTITUTION_DECISION','ORDER_SUBSTITUTION',?,jsonb_build_object('status',?),?,'SUCCESS',?)",actor,id,type,reason,key);}
        private String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
        private record Source(UUID order,UUID customer,int version,String status,int quantity,BigDecimal price,UUID currency,UUID account) {}
        private record Replacement(String name,BigDecimal price,UUID currency) {}
        private record Row(String status,int version,Instant expiry,String financial,Timestamp consented,UUID item,UUID replacement,BigDecimal price,List<UUID> modifiers,int orderVersion,BigDecimal difference) {}
    }
}
