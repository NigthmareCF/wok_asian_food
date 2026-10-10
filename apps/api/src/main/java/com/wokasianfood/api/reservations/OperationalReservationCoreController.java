package com.wokasianfood.api.reservations;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/operational/reservations/core")
@PreAuthorize("hasAnyRole('OPERATIONAL','ADMIN')")
public class OperationalReservationCoreController {
    private final JdbcTemplate jdbc;
    public OperationalReservationCoreController(JdbcTemplate jdbc){this.jdbc=jdbc;}
    @GetMapping public List<Reservation> list(){return jdbc.query("""
        SELECT id,status,party_size,reservation_at,row_version,preorder_order_id FROM wok.reservations
        WHERE status IN('REQUESTED','CONFIRMED','ARRIVED','SEATED') ORDER BY reservation_at,id LIMIT 100
        """,(rs,n)->new Reservation(rs.getObject(1,UUID.class),rs.getString(2),rs.getInt(3),rs.getTimestamp(4).toInstant(),rs.getInt(5),rs.getObject(6,UUID.class),
            jdbc.query("""
                SELECT t.id,t.name,a.id AS account_id FROM wok.reservation_table_assignments r
                JOIN wok.dining_tables t ON t.id=r.table_id
                LEFT JOIN wok.order_accounts a ON a.dining_table_id=t.id AND a.status='OPEN'
                WHERE r.reservation_id=? AND r.released_at IS NULL ORDER BY t.id
                """,(r,i)->new Table(r.getObject(1,UUID.class),r.getString(2),r.getObject(3,UUID.class)),rs.getObject(1,UUID.class)),
            jdbc.query("""
                SELECT i.id,i.name_snapshot,i.quantity FROM wok.reservation_request_items i
                JOIN wok.reservation_evaluations e ON e.request_id=i.request_id WHERE e.reservation_id=? ORDER BY i.id
                """,(r,i)->new Line(r.getObject(1,UUID.class),r.getString(2),r.getInt(3)),rs.getObject(1,UUID.class))));}
    public record Reservation(UUID id,String status,int guests,Instant requestedAt,int version,UUID preorderOrderId,List<Table> tables,List<Line> preorder) {}
    public record Table(UUID id,String name,UUID accountId) {}
    public record Line(UUID id,String name,int quantity) {}
}
