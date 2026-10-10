package com.wokasianfood.api.reservations;

import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.service.ServiceHoursPolicy;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/client/reservation-quotes")
@PreAuthorize("hasRole('CLIENT')")
public class ReservationQuoteController {
    private final JdbcTemplate jdbc;
    private final OperationalCapacityService capacity;
    public ReservationQuoteController(JdbcTemplate jdbc,OperationalCapacityService capacity) {this.jdbc=jdbc;this.capacity=capacity;}
    @PostMapping
    @Transactional
    public Receipt quote(@AuthenticationPrincipal Jwt jwt,@RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody Request request) {
        UUID user=UUID.fromString(jwt.getSubject());String fingerprint=fingerprint(request);
        jdbc.queryForObject("SELECT id FROM wok.users WHERE id=? FOR UPDATE",UUID.class,user);
        var existing=jdbc.query("SELECT id,request_fingerprint FROM wok.reservation_quotes WHERE customer_user_id=? AND idempotency_key=?",
            (rs,n)->new Existing(rs.getObject(1,UUID.class),rs.getString(2)),user,key);
        if(!existing.isEmpty()) {
            if(!existing.getFirst().hash().equals(fingerprint)) throw new AuthException(409,"La clave de cotización ya se usó con otros datos.");
            return receipt(user,existing.getFirst().id());
        }
        var assessment=capacity.assessTable(request.guests(),request.requestedAt(),Instant.now(),request.preorder()&&!request.items().isEmpty());
        if(assessment.decision()==OperationalCapacityService.Decision.REJECT||assessment.decision()==OperationalCapacityService.Decision.SUGGEST_OTHER_TIME)
            throw new AuthException(422,assessment.publicMessage());
        var policy=new ServiceHoursPolicy(jdbc).current();
        if(request.requestedAt().atZone(ServiceHoursPolicy.ZONE).toLocalTime().equals(policy.tableLastArrival())
                &&(!request.preorder()||request.items().isEmpty())) throw new AuthException(422,"La llegada límite requiere una preorden completa.");
        UUID id=jdbc.queryForObject("""
            INSERT INTO wok.reservation_quotes(customer_user_id,idempotency_key,request_fingerprint,party_size,requested_at,preorder_complete,expires_at)
            VALUES(?,?,?,?,?,?,now()+interval '12 minutes') RETURNING id
            """,UUID.class,user,key,fingerprint,request.guests(),Timestamp.from(request.requestedAt()),request.preorder());
        UUID currency=null;
        for(Line line:normalized(request.items())) {
            var products=jdbc.query("""
                SELECT mi.name,mi.price,mi.currency_id FROM wok.menu_items mi
                JOIN wok.items i ON i.id=mi.item_id AND i.active=true
                JOIN wok.menu_categories c ON c.id=mi.category_id AND c.active=true
                JOIN wok.preparation_areas a ON a.id=mi.preparation_area_id AND a.active=true
                WHERE mi.id=? AND mi.status='ACTIVE' AND mi.visibility='PUBLIC' FOR SHARE OF mi
                """,(rs,n)->new Product(rs.getString(1),rs.getBigDecimal(2),rs.getObject(3,UUID.class)),line.menuItemId());
            if(products.isEmpty()) throw new AuthException(422,"Un producto de la preorden ya no está disponible.");
            Product product=products.getFirst();
            if(currency!=null&&!currency.equals(product.currency())) throw new AuthException(422,"La preorden no puede mezclar monedas.");
            currency=product.currency();
            BigDecimal price=new ModifierSelectionService(jdbc).validate(line.menuItemId(),line.modifierIds()).stream()
                .map(ModifierSelectionService.SelectedModifier::priceDelta).reduce(product.price(),BigDecimal::add);
            UUID[] ids=line.modifierIds().toArray(UUID[]::new);
            jdbc.update(connection->{var statement=connection.prepareStatement("""
                INSERT INTO wok.reservation_quote_items(quote_id,menu_item_id,name_snapshot,quantity,unit_price,currency_id,modifier_ids)
                VALUES(?,?,?,?,?,?,?)
                """);statement.setObject(1,id);statement.setObject(2,line.menuItemId());statement.setString(3,product.name());
                statement.setInt(4,line.quantity());statement.setBigDecimal(5,price);statement.setObject(6,product.currency());
                statement.setArray(7,connection.createArrayOf("uuid",ids));return statement;});
        }
        return receipt(user,id);
    }
    @GetMapping("/{id}")
    public Receipt get(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {return receipt(UUID.fromString(jwt.getSubject()),id);}
    private Receipt receipt(UUID user,UUID id) {
        var items=jdbc.query("SELECT name_snapshot,quantity,unit_price,c.code FROM wok.reservation_quote_items qi JOIN wok.currencies c ON c.id=qi.currency_id WHERE quote_id=? ORDER BY menu_item_id",
            (rs,n)->new PricedLine(rs.getString(1),rs.getInt(2),rs.getBigDecimal(3),rs.getString(4)),id);
        BigDecimal subtotal=items.stream().map(l->l.unitPrice().multiply(BigDecimal.valueOf(l.quantity()))).reduce(BigDecimal.ZERO,BigDecimal::add);
        var rows=jdbc.query("""
            SELECT id,status,expires_at,party_size,requested_at,preorder_complete FROM wok.reservation_quotes
            WHERE id=? AND customer_user_id=?
            """,(rs,n)->new Receipt(rs.getObject(1,UUID.class),rs.getString(2),rs.getTimestamp(3).toInstant(),rs.getInt(4),
                rs.getTimestamp(5).toInstant(),rs.getBoolean(6),new ServiceHoursPolicy(jdbc).current().holdMinutes(),
                "Cotizar no reserva. Al continuar formalmente se retienen cupo e inventario temporalmente; Operativo debe confirmar.",items,subtotal,items.isEmpty()?null:items.getFirst().currency()),id,user);
        if(rows.isEmpty()) throw new AuthException(404,"No encontramos esa cotización.");return rows.getFirst();
    }
    static List<Line> normalized(List<Line> lines) {
        if(lines==null)return List.of();
        if(lines.size()>20||lines.stream().anyMatch(l->l.menuItemId()==null||l.quantity()<1||l.quantity()>50)
            ||lines.stream().map(Line::menuItemId).distinct().count()!=lines.size()) throw new AuthException(422,"Revisa las líneas de la preorden.");
        return lines.stream().sorted(Comparator.comparing(l->l.menuItemId().toString())).toList();
    }
    static String fingerprint(Request request) {
        String value=request.guests()+"|"+request.requestedAt()+"|"+request.preorder()+"|"+normalized(request.items());
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(Exception e){throw new IllegalStateException(e);}
    }
    public record Request(@Min(1) @Max(50) int guests,@NotNull Instant requestedAt,boolean preorder,
        @Size(max=20) List<@Valid Line> items) {public Request{items=items==null?List.of():List.copyOf(items);}}
    public record Line(@NotNull UUID menuItemId,@Min(1) @Max(50) int quantity,@Size(max=30) List<@NotNull UUID> modifierIds) {
        public Line{modifierIds=modifierIds==null?List.of():modifierIds.stream().sorted().toList();}
    }
    public record Receipt(UUID quoteId,String status,Instant expiresAt,int guests,Instant requestedAt,boolean preorderComplete,int holdMinutes,String message,List<PricedLine> items,BigDecimal subtotal,String currency) {}
    public record PricedLine(String name,int quantity,BigDecimal unitPrice,String currency) {}
    private record Existing(UUID id,String hash) {}
    private record Product(String name,BigDecimal price,UUID currency) {}
}
