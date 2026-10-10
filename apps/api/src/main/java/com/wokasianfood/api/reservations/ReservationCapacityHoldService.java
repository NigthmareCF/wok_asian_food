package com.wokasianfood.api.reservations;

import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.inventory.InventoryRequirements;
import com.wokasianfood.api.inventory.InventoryReservationService;
import com.wokasianfood.api.service.ServiceHoursPolicy;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReservationCapacityHoldService {
    private final JdbcTemplate jdbc;
    public ReservationCapacityHoldService(JdbcTemplate jdbc) {this.jdbc=jdbc;}
    @Transactional
    public void accept(UUID user,UUID quoteId,UUID reservationId,UUID requestId,ReservationRequestService.Request request) {
        if(quoteId==null) throw new AuthException(422,"Acepta una cotización vigente para continuar la reserva.");
        var quotes=jdbc.query("SELECT request_fingerprint,status,expires_at FROM wok.reservation_quotes WHERE id=? AND customer_user_id=? FOR UPDATE",
            (rs,n)->new Quote(rs.getString(1),rs.getString(2),rs.getTimestamp(3).toInstant()),quoteId,user);
        if(quotes.isEmpty())throw new AuthException(404,"No encontramos una cotización de tu cuenta.");
        Quote quote=quotes.getFirst();
        if(!quote.status().equals("ACTIVE")||!quote.expiry().isAfter(Instant.now()))throw new AuthException(409,"La cotización venció o ya se usó.");
        if(!quote.hash().equals(ReservationQuoteController.fingerprint(new ReservationQuoteController.Request(
            request.guests(),request.requestedAt(),request.preorder(),request.items()))))throw new AuthException(409,"La reserva cambió desde la cotización.");
        List<Snapshot> snapshots=snapshots(quoteId);
        for(Snapshot snapshot:snapshots) {
            List<BigDecimal> current=jdbc.query("SELECT price FROM wok.menu_items WHERE id=? AND status='ACTIVE' AND visibility='PUBLIC' FOR SHARE",
                (rs,n)->rs.getBigDecimal(1),snapshot.menuItem());
            if(current.isEmpty())throw new AuthException(409,"Un producto de la preorden dejó de estar disponible.");
            var selected=new ModifierSelectionService(jdbc).validate(snapshot.menuItem(),snapshot.modifiers());
            BigDecimal price=selected.stream().map(ModifierSelectionService.SelectedModifier::priceDelta).reduce(current.getFirst(),BigDecimal::add);
            if(price.compareTo(snapshot.price())!=0)throw new AuthException(409,"La preorden cambió de precio. Cotiza de nuevo.");
        }
        var required=InventoryRequirements.calculate(jdbc,snapshots.stream().map(s->new InventoryReservationService.Line(s.menuItem(),s.quantity(),s.modifiers())).toList());
        InventoryRequirements.lock(jdbc,required.keySet());InventoryRequirements.requireAvailable(jdbc,required,null);
        var reservation=jdbc.queryForObject("SELECT reservation_at,ends_at FROM wok.reservations WHERE id=?",
            (rs,n)->new Period(rs.getTimestamp(1),rs.getTimestamp(2)),reservationId);
        List<Table> tables=jdbc.query("SELECT id,capacity FROM wok.dining_tables WHERE active=true AND current_status<>'UNAVAILABLE' ORDER BY id FOR UPDATE",
            (rs,n)->new Table(rs.getObject(1,UUID.class),rs.getInt(2)));
        List<Table> chosen=new ArrayList<>();int seats=0;
        for(Table table:tables) {
            boolean taken=Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM wok.reservation_table_assignments a
                 WHERE a.table_id=? AND a.released_at IS NULL AND a.occupied_period&&tstzrange(?,?,'[)'))
                OR EXISTS(SELECT 1 FROM wok.reservation_capacity_hold_tables t JOIN wok.reservation_capacity_holds h ON h.id=t.hold_id
                 WHERE t.table_id=? AND h.status='ACTIVE' AND h.expires_at>now() AND t.occupied_period&&tstzrange(?,?,'[)'))
                """,Boolean.class,table.id(),reservation.start(),reservation.end(),table.id(),reservation.start(),reservation.end()));
            if(!taken){chosen.add(table);seats+=table.seats();if(seats>=request.guests())break;}
        }
        if(seats<request.guests())throw new AuthException(409,"No hay cupo para retener ese horario. Solicita otra cotización.");
        UUID hold=jdbc.queryForObject("""
            INSERT INTO wok.reservation_capacity_holds(quote_id,reservation_id,expires_at)
            VALUES(?,?,now()+make_interval(mins=>?)) RETURNING id
            """,UUID.class,quoteId,reservationId,new ServiceHoursPolicy(jdbc).current().holdMinutes());
        for(Table table:chosen)jdbc.update("INSERT INTO wok.reservation_capacity_hold_tables(hold_id,table_id,occupied_period) VALUES(?,?,tstzrange(?,?,'[)'))",
            hold,table.id(),reservation.start(),reservation.end());
        for(var resource:required.entrySet())jdbc.update("INSERT INTO wok.reservation_capacity_hold_inventory(hold_id,item_id,quantity) VALUES(?,?,?)",hold,resource.getKey(),resource.getValue());
        for(Snapshot snapshot:snapshots) {
            UUID item=jdbc.queryForObject("""
                INSERT INTO wok.reservation_request_items(request_id,menu_item_id,name_snapshot,quantity,unit_price,currency_id)
                VALUES(?,?,?,?,?,?) RETURNING id
                """,UUID.class,requestId,snapshot.menuItem(),snapshot.name(),snapshot.quantity(),snapshot.price(),snapshot.currency());
            for(var modifier:new ModifierSelectionService(jdbc).validate(snapshot.menuItem(),snapshot.modifiers()))jdbc.update("""
                INSERT INTO wok.reservation_request_item_modifiers(reservation_request_item_id,modifier_id,group_name_snapshot,modifier_name_snapshot,price_delta)
                VALUES(?,?,?,?,?)
                """,item,modifier.id(),modifier.groupName(),modifier.name(),modifier.priceDelta());
        }
        jdbc.update("UPDATE wok.reservation_quotes SET status='CONSUMED',reservation_id=? WHERE id=?",reservationId,quoteId);
    }
    @Transactional
    public void finish(UUID reservationId,UUID actor,boolean confirm) {
        var holds=jdbc.query("SELECT id,status,expires_at FROM wok.reservation_capacity_holds WHERE reservation_id=?",
            (rs,n)->new Hold(rs.getObject(1,UUID.class),rs.getString(2),rs.getTimestamp(3).toInstant()),reservationId);
        if(holds.isEmpty()) {if(confirm)throw new AuthException(409,"La solicitud no tiene hold vigente. Requiere una nueva cotización.");return;}
        Hold hold=holds.getFirst();
        if(confirm&&(!hold.status().equals("ACTIVE")||!hold.expiry().isAfter(Instant.now())))throw new AuthException(409,"El hold venció. Requiere una nueva cotización.");
        var items=jdbc.query("SELECT item_id FROM wok.reservation_capacity_hold_inventory WHERE hold_id=? ORDER BY item_id",(rs,n)->rs.getObject(1,UUID.class),hold.id());
        InventoryRequirements.lock(jdbc,items);
        var tables=jdbc.query("SELECT table_id FROM wok.reservation_capacity_hold_tables WHERE hold_id=? ORDER BY table_id",(rs,n)->rs.getObject(1,UUID.class),hold.id());
        int currentSeats=0;
        for(UUID table:tables){
            var available=jdbc.query("SELECT CASE WHEN active AND current_status<>'UNAVAILABLE' THEN capacity ELSE 0 END FROM wok.dining_tables WHERE id=? FOR UPDATE",(rs,n)->rs.getInt(1),table);
            if(confirm&&(available.isEmpty()||available.getFirst()==0))throw new AuthException(409,"Una mesa retenida ya no está disponible; requiere revisión.");
            if(!available.isEmpty())currentSeats+=available.getFirst();
        }
        if(confirm&&currentSeats<jdbc.queryForObject("SELECT party_size FROM wok.reservations WHERE id=?",Integer.class,reservationId))
            throw new AuthException(409,"La capacidad retenida cambió; requiere revisión y nueva cotización.");
        int ended=jdbc.update("UPDATE wok.reservation_capacity_holds SET status=?,ended_at=now() WHERE id=? AND status='ACTIVE' AND (expires_at>now() OR ?='RELEASED')",
            confirm?"CONVERTED":"RELEASED",hold.id(),confirm?"CONVERTED":"RELEASED");
        if(confirm&&ended!=1)throw new AuthException(409,"El hold venció durante la confirmación.");
        if(confirm) jdbc.update("""
            INSERT INTO wok.reservation_table_assignments(reservation_id,table_id,occupied_period,assigned_by)
            SELECT ?,table_id,occupied_period,? FROM wok.reservation_capacity_hold_tables WHERE hold_id=?
            """,reservationId,actor,hold.id());
        if(!confirm)jdbc.update("UPDATE wok.reservation_table_assignments SET released_at=now() WHERE reservation_id=? AND released_at IS NULL",reservationId);
    }
    @Scheduled(fixedDelayString="${wok.reservations.hold-expiry-poll-ms:5000}")
    @Transactional
    public void expireDue() {
        jdbc.update("UPDATE wok.reservation_quotes SET status='EXPIRED' WHERE status='ACTIVE' AND expires_at<=now()");
        jdbc.update("UPDATE wok.reservation_capacity_holds SET status='EXPIRED',ended_at=now() WHERE status='ACTIVE' AND expires_at<=now()");
    }
    private List<Snapshot> snapshots(UUID id) {
        return jdbc.query("SELECT menu_item_id,name_snapshot,quantity,unit_price,currency_id,modifier_ids FROM wok.reservation_quote_items WHERE quote_id=? ORDER BY menu_item_id",
            (rs,n)->new Snapshot(rs.getObject(1,UUID.class),rs.getString(2),rs.getInt(3),rs.getBigDecimal(4),rs.getObject(5,UUID.class),Arrays.asList((UUID[])rs.getArray(6).getArray())),id);
    }
    private record Quote(String hash,String status,Instant expiry) {}
    private record Snapshot(UUID menuItem,String name,int quantity,BigDecimal price,UUID currency,List<UUID> modifiers) {}
    private record Period(Timestamp start,Timestamp end) {}
    private record Table(UUID id,int seats) {}
    private record Hold(UUID id,String status,Instant expiry) {}
}
