package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.inventory.InventoryRequirements;
import com.wokasianfood.api.inventory.InventoryReservationService;
import com.wokasianfood.api.platform.IdempotencyStore;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Consent changes only the reservation snapshot; no order, kitchen ticket or payment is created. */
@Service
public class ReservationSubstitutionService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore keys;
    public ReservationSubstitutionService(JdbcTemplate jdbc,IdempotencyStore keys){this.jdbc=jdbc;this.keys=keys;}

    @Transactional
    public OrderSubstitutionController.Receipt propose(UUID actor,UUID reservation,UUID key,OrderSubstitutionController.Proposal request){
        var claim=keys.claim(actor.toString(),"PREORDER_SUBSTITUTION_PROPOSE",key,hash(reservation+"|"+request));
        if(claim.replay())return receipt(claim.resourceId());
        Reservation r=reservation(reservation);
        requireMutable(r,request.expectedOrderVersion());
        var lines=jdbc.query("""
            SELECT i.id,i.name_snapshot,i.unit_price,i.quantity,i.currency_id FROM wok.reservation_request_items i
            JOIN wok.reservation_evaluations e ON e.request_id=i.request_id WHERE e.reservation_id=? AND i.id=? FOR UPDATE OF i
            """,(rs,n)->new Original(rs.getObject(1,UUID.class),rs.getString(2),rs.getBigDecimal(3),rs.getInt(4),rs.getObject(5,UUID.class)),reservation,request.orderItemId());
        if(lines.isEmpty())throw new AuthException(404,"No encontramos esa línea en la preorden.");
        Original old=lines.getFirst();Replacement replacement=replacement(request.replacementMenuItemId(),request.modifierIds());
        var optionNames=new com.wokasianfood.api.catalog.ModifierSelectionService(jdbc).validate(request.replacementMenuItemId(),request.modifierIds()).stream().map(m->m.groupName()+": "+m.name()).toList();
        String displayName=replacement.name()+(optionNames.isEmpty()?"":" ("+String.join(", ",optionNames)+")");
        if(!old.currency().equals(replacement.currency()))throw new AuthException(422,"La sustitución no puede cambiar de moneda.");
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM wok.reservation_preorder_substitutions WHERE reservation_item_id=? AND status IN('PENDING_CONSENT','CONSENTED') AND expires_at>now())",Boolean.class,old.id())))
            throw new AuthException(409,"Ya existe una propuesta pendiente para esta línea.");
        jdbc.update("UPDATE wok.reservation_preorder_substitutions SET status='EXPIRED',row_version=row_version+1 WHERE reservation_item_id=? AND status IN('PENDING_CONSENT','CONSENTED') AND expires_at<=now()",old.id());
        UUID id=UUID.randomUUID();
        jdbc.update(connection->{var s=connection.prepareStatement("""
            INSERT INTO wok.reservation_preorder_substitutions(id,reservation_id,reservation_item_id,customer_user_id,
            replacement_menu_item_id,replacement_name,replacement_unit_price,currency_id,original_name,original_price,quantity,
            modifier_ids,price_difference,expected_reservation_version,reason,expires_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,now()+interval '12 minutes')
            """);Object[] values={id,reservation,old.id(),r.customer(),request.replacementMenuItemId(),displayName,replacement.price(),replacement.currency(),old.name(),old.price(),old.quantity()};
            for(int i=0;i<values.length;i++)s.setObject(i+1,values[i]);
            s.setArray(12,connection.createArrayOf("uuid",request.modifierIds().toArray(UUID[]::new)));
            s.setBigDecimal(13,replacement.price().subtract(old.price()).multiply(BigDecimal.valueOf(old.quantity())));
            s.setInt(14,r.version());s.setString(15,request.reason().trim());return s;});
        event(actor,id,"PROPOSED",request.reason(),key);keys.complete(actor.toString(),"PREORDER_SUBSTITUTION_PROPOSE",key,id);return receipt(id);
    }
    @Transactional
    public OrderSubstitutionController.Receipt consent(UUID actor,UUID id,UUID key,OrderSubstitutionController.Consent request){
        var claim=keys.claim(actor.toString(),"PREORDER_SUBSTITUTION_CONSENT",key,hash(id+"|"+request));
        requireOwner(actor,id);if(claim.replay())return receipt(claim.resourceId());
        Row row=lock(id);requirePending(row,request.expectedVersion(),"PENDING_CONSENT");
        jdbc.update("UPDATE wok.reservation_preorder_substitutions SET status=?,consented_at=CASE WHEN ? THEN now() ELSE NULL END,row_version=row_version+1 WHERE id=?",request.accept()?"CONSENTED":"DECLINED",request.accept(),id);
        event(actor,id,request.accept()?"CONSENTED":"DECLINED",null,key);keys.complete(actor.toString(),"PREORDER_SUBSTITUTION_CONSENT",key,id);return receipt(id);
    }
    @Transactional
    public OrderSubstitutionController.Receipt decide(UUID actor,UUID id,UUID key,OrderSubstitutionController.Decision request){
        var claim=keys.claim(actor.toString(),"PREORDER_SUBSTITUTION_DECIDE",key,hash(id+"|"+request));
        if(claim.replay())return receipt(claim.resourceId());
        var ids=jdbc.query("SELECT reservation_id FROM wok.reservation_preorder_substitutions WHERE id=?",(rs,n)->rs.getObject(1,UUID.class),id);
        if(ids.isEmpty())throw new AuthException(404,"No encontramos esa propuesta.");
        // Reservation-before-proposal is shared with conversion, which locks account then reservation.
        Reservation reservation=reservation(ids.getFirst());Row row=lock(id);
        if(request.apply())requirePending(row,request.expectedVersion(),"CONSENTED");
        else if(row.version()!=request.expectedVersion()||!List.of("PENDING_CONSENT","CONSENTED").contains(row.status()))throw new AuthException(409,"La propuesta cambió.");
        if(request.apply()){
            requireMutable(reservation,row.reservationVersion());
            Replacement replacement=replacement(row.replacement(),row.modifiers());
            if(replacement.price().compareTo(row.price())!=0||!replacement.currency().equals(row.currency()))throw new AuthException(409,"El precio o moneda propuestos cambiaron; requiere nuevo consentimiento.");
            var old=jdbc.query("SELECT unit_price,name_snapshot,quantity FROM wok.reservation_request_items WHERE id=? FOR UPDATE",(rs,n)->new Original(row.item(),rs.getString(2),rs.getBigDecimal(1),rs.getInt(3),replacement.currency()),row.item());
            if(old.isEmpty()||old.getFirst().price().compareTo(row.originalPrice())!=0||!old.getFirst().name().equals(row.originalName())||old.getFirst().quantity()!=row.quantity())throw new AuthException(409,"La línea original cambió; requiere nueva propuesta.");
            var inventory=InventoryRequirements.calculate(jdbc,List.of(new InventoryReservationService.Line(row.replacement(),row.quantity(),row.modifiers())));
            InventoryRequirements.lock(jdbc,inventory.keySet());InventoryRequirements.requireAvailable(jdbc,inventory,null);
            jdbc.update("UPDATE wok.reservation_request_items SET menu_item_id=?,name_snapshot=?,unit_price=?,currency_id=? WHERE id=?",row.replacement(),replacement.name(),row.price(),replacement.currency(),row.item());
            jdbc.update("DELETE FROM wok.reservation_request_item_modifiers WHERE reservation_request_item_id=?",row.item());
            for(var modifier:new com.wokasianfood.api.catalog.ModifierSelectionService(jdbc).validate(row.replacement(),row.modifiers()))jdbc.update("INSERT INTO wok.reservation_request_item_modifiers(reservation_request_item_id,modifier_id,group_name_snapshot,modifier_name_snapshot,price_delta) VALUES(?,?,?,?,?)",row.item(),modifier.id(),modifier.groupName(),modifier.name(),modifier.priceDelta());
            jdbc.update("UPDATE wok.reservations SET row_version=row_version+1,updated_at=now(),updated_by=? WHERE id=?",actor,ids.getFirst());
        }
        int changed=jdbc.update("UPDATE wok.reservation_preorder_substitutions SET status=?,row_version=row_version+1 WHERE id=? AND (expires_at>now() OR ?=false)",request.apply()?"APPLIED":"REJECTED",id,request.apply());
        if(changed!=1)throw new AuthException(410,"La propuesta venció durante la revisión.");
        event(actor,id,request.apply()?"APPLIED":"REJECTED",request.reason(),key);keys.complete(actor.toString(),"PREORDER_SUBSTITUTION_DECIDE",key,id);return receipt(id);
    }
    public List<OrderSubstitutionController.Receipt> list(UUID user,boolean operational){return jdbc.query("SELECT id FROM wok.reservation_preorder_substitutions WHERE (? OR customer_user_id=?::uuid) ORDER BY created_at DESC LIMIT 100",(rs,n)->receipt(rs.getObject(1,UUID.class)),operational,user);}
    @Scheduled(fixedDelayString="${wok.reservations.hold-expiry-poll-ms:5000}")
    public void expireDue(){jdbc.update("UPDATE wok.reservation_preorder_substitutions SET status='EXPIRED',row_version=row_version+1 WHERE status IN('PENDING_CONSENT','CONSENTED') AND expires_at<=now()");}
    private Reservation reservation(UUID id){var rows=jdbc.query("SELECT r.row_version,r.status,r.preorder_order_id,p.user_id FROM wok.reservations r JOIN wok.customer_profiles p ON p.id=r.customer_id WHERE r.id=? FOR UPDATE OF r",(rs,n)->new Reservation(rs.getInt(1),rs.getString(2),rs.getObject(3,UUID.class),rs.getObject(4,UUID.class)),id);if(rows.isEmpty())throw new AuthException(404,"No encontramos esa reserva.");return rows.getFirst();}
    private void requireMutable(Reservation r,int version){if(r.version()!=version||r.order()!=null||!List.of("CONFIRMED","ARRIVED","SEATED").contains(r.status()))throw new AuthException(409,"La reserva cambió o su preorden ya se convirtió; revisa el pedido actual.");}
    private void requirePending(Row r,int version,String status){if(r.version()!=version||!r.status().equals(status))throw new AuthException(409,"La propuesta cambió o falta consentimiento.");if(!r.expiry().isAfter(Instant.now()))throw new AuthException(410,"La propuesta venció.");}
    private void requireOwner(UUID user,UUID id){if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM wok.reservation_preorder_substitutions WHERE id=? AND customer_user_id=?)",Boolean.class,id,user)))throw new AuthException(404,"No encontramos esa propuesta en tu cuenta.");}
    private Replacement replacement(UUID id,List<UUID> modifiers){var rows=jdbc.query("SELECT name,price,currency_id FROM wok.menu_items WHERE id=? AND status='ACTIVE' AND visibility='PUBLIC' FOR SHARE",(rs,n)->new Replacement(rs.getString(1),rs.getBigDecimal(2),rs.getObject(3,UUID.class)),id);if(rows.isEmpty())throw new AuthException(422,"El sustituto no está publicado.");var r=rows.getFirst();return new Replacement(r.name(),RequestQuoteBridge.price(jdbc,id,r.price(),modifiers),r.currency());}
    private Row lock(UUID id){var rows=jdbc.query("SELECT * FROM wok.reservation_preorder_substitutions WHERE id=? FOR UPDATE",(rs,n)->new Row(rs.getString("status"),rs.getInt("row_version"),rs.getTimestamp("expires_at").toInstant(),rs.getInt("expected_reservation_version"),rs.getObject("reservation_item_id",UUID.class),rs.getObject("replacement_menu_item_id",UUID.class),rs.getBigDecimal("replacement_unit_price"),Arrays.asList((UUID[])rs.getArray("modifier_ids").getArray()),rs.getBigDecimal("original_price"),rs.getString("original_name"),rs.getInt("quantity"),rs.getObject("currency_id",UUID.class)),id);if(rows.isEmpty())throw new AuthException(404,"No encontramos esa propuesta.");return rows.getFirst();}
    private OrderSubstitutionController.Receipt receipt(UUID id){return jdbc.queryForObject("SELECT s.*,c.code AS currency FROM wok.reservation_preorder_substitutions s JOIN wok.currencies c ON c.id=s.currency_id WHERE s.id=?",(rs,n)->new OrderSubstitutionController.Receipt(id,null,null,rs.getObject("reservation_item_id",UUID.class),rs.getString("replacement_name"),rs.getInt("quantity"),rs.getBigDecimal("replacement_unit_price"),rs.getBigDecimal("price_difference"),rs.getString("currency"),rs.getString("status"),"NOT_REQUIRED",false,rs.getInt("row_version"),rs.getTimestamp("expires_at").toInstant(),rs.getString("reason"),rs.getString("original_name"),rs.getBigDecimal("original_price"),true,rs.getObject("reservation_id",UUID.class)),id);}
    private void event(UUID actor,UUID id,String status,String reason,UUID key){jdbc.update("INSERT INTO wok.audit_logs(actor_user_id,action,entity_type,entity_id,after_data,reason,result,request_id) VALUES(?,'PREORDER_SUBSTITUTION','RESERVATION_SUBSTITUTION',?,jsonb_build_object('status',?),?,'SUCCESS',?)",actor,id,status,reason,key);}
    private String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private record Reservation(int version,String status,UUID order,UUID customer){}
    private record Original(UUID id,String name,BigDecimal price,int quantity,UUID currency){}
    private record Replacement(String name,BigDecimal price,UUID currency){}
    private record Row(String status,int version,Instant expiry,int reservationVersion,UUID item,UUID replacement,BigDecimal price,List<UUID> modifiers,BigDecimal originalPrice,String originalName,int quantity,UUID currency){}
}
