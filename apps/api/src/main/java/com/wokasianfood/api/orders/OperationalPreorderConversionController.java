package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Only this explicit operational action converts an intent preorder into a kitchen order. */
@RestController
@RequestMapping("/api/v1/operational/reservations")
@PreAuthorize("hasAuthority('orders:manage')")
public class OperationalPreorderConversionController {
    private final JdbcTemplate jdbc;
    private final OrderService orders;
    public OperationalPreorderConversionController(JdbcTemplate jdbc,OrderService orders){this.jdbc=jdbc;this.orders=orders;}
    @PostMapping("/{reservationId}/preorder-conversion")
    @Transactional
    public Receipt convert(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID reservationId,
            @RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody Request request) {
        UUID actor=UUID.fromString(jwt.getSubject());
        // Same account-before-order convention as existing finance; then reservation and stock.
        var accounts=jdbc.query("SELECT dining_table_id,status FROM wok.order_accounts WHERE id=? FOR UPDATE",
            (rs,n)->new Account(rs.getObject(1,UUID.class),rs.getString(2)),request.accountId());
        if(accounts.isEmpty()||accounts.getFirst().table()==null||!accounts.getFirst().status().equals("OPEN"))
            throw new AuthException(409,"Selecciona una cuenta abierta de la mesa asignada.");
        var rows=jdbc.query("SELECT status,row_version,party_size,preorder_order_id FROM wok.reservations WHERE id=? FOR UPDATE",
            (rs,n)->new Reservation(rs.getString(1),rs.getInt(2),rs.getInt(3),rs.getObject(4,UUID.class)),reservationId);
        if(rows.isEmpty())throw new AuthException(404,"No encontramos esa reserva.");Reservation reservation=rows.getFirst();
        if(reservation.order()!=null) {
            UUID account=jdbc.queryForObject("SELECT account_id FROM wok.orders WHERE id=?",UUID.class,reservation.order());
            if(!request.accountId().equals(account))throw new AuthException(409,"La preorden ya se convirtió en otra cuenta.");
            return new Receipt(reservationId,reservation.order(),true);
        }
        if(!List.of("CONFIRMED","ARRIVED","SEATED").contains(reservation.status())||reservation.version()!=request.expectedVersion())
            throw new AuthException(409,"La reserva cambió o no está confirmada.");
        Boolean assigned=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM wok.reservation_table_assignments WHERE reservation_id=? AND table_id=? AND released_at IS NULL)",
            Boolean.class,reservationId,accounts.getFirst().table());
        if(!Boolean.TRUE.equals(assigned))throw new AuthException(409,"La cuenta no pertenece a una mesa de esta reserva.");
        List<Line> snapshots=jdbc.query("""
            SELECT ri.menu_item_id,ri.quantity,ri.unit_price,mi.price,
             ARRAY(SELECT modifier_id FROM wok.reservation_request_item_modifiers m WHERE m.reservation_request_item_id=ri.id ORDER BY modifier_id)
            FROM wok.reservation_request_items ri JOIN wok.reservation_evaluations e ON e.request_id=ri.request_id
            JOIN wok.menu_items mi ON mi.id=ri.menu_item_id WHERE e.reservation_id=? ORDER BY ri.menu_item_id
            """,(rs,n)->new Line(rs.getObject(1,UUID.class),rs.getInt(2),rs.getBigDecimal(3),rs.getBigDecimal(4),
                Arrays.asList((UUID[])rs.getArray(5).getArray())),reservationId);
        if(snapshots.isEmpty())throw new AuthException(422,"La reserva no tiene preorden para convertir.");
        for(Line line:snapshots)if(RequestQuoteBridge.price(jdbc,line.menuItem(),line.current(),line.modifiers()).compareTo(line.snapshot())!=0)
            throw new AuthException(409,"La preorden cambió de precio. Requiere decisión del cliente antes de convertir.");
        var receipt=orders.open(actor,UUID.randomUUID(),key,new OperationalOrderController.OpenOrderRequest(
            request.accountId(),"DINE_IN",reservation.guests(),"Preorden de reserva "+reservationId,
            snapshots.stream().map(l->new OperationalOrderController.OrderLineRequest(l.menuItem(),l.quantity(),"DINE_IN",null,l.modifiers())).toList()));
        UUID order=receipt.orderId();
        jdbc.update("UPDATE wok.reservations SET preorder_order_id=?,status='SEATED',arrival_at=coalesce(arrival_at,now()),row_version=row_version+1,updated_at=now(),updated_by=? WHERE id=?",
            order,actor,reservationId);
        jdbc.update("INSERT INTO wok.reservation_status_history(reservation_id,from_status,to_status,reason,actor_user_id,request_id) VALUES(?,?,'SEATED','EXPLICIT_PREORDER_CONVERSION',?,?)",
            reservationId,reservation.status(),actor,key);
        jdbc.update("INSERT INTO wok.audit_logs(actor_user_id,action,entity_type,entity_id,after_data,result,request_id) VALUES(?,'PREORDER_CONVERTED','RESERVATION',?,jsonb_build_object('orderId',?::text),'SUCCESS',?)",
            actor,reservationId,order,key);
        return new Receipt(reservationId,order,false);
    }
    public record Request(@NotNull UUID accountId,@Positive int expectedVersion) {}
    public record Receipt(UUID reservationId,UUID orderId,boolean idempotentReplay) {}
    private record Account(UUID table,String status) {}
    private record Reservation(String status,int version,int guests,UUID order) {}
    private record Line(UUID menuItem,int quantity,BigDecimal snapshot,BigDecimal current,List<UUID> modifiers) {}
}
