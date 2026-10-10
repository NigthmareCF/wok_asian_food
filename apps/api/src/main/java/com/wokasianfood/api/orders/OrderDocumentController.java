package com.wokasianfood.api.orders;

import com.wokasianfood.api.accounts.AccountFinancialTotalsService;
import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Immutable response from one database snapshot; printable HTML, explicitly never a DTE/FEL. */
@RestController
public class OrderDocumentController {
    private static final String NOTICE="COMPROBANTE / PRECUENTA — NO ES DTE — NO FEL CERTIFICADO";
    private final JdbcTemplate jdbc;private final AccountFinancialTotalsService totals;
    public OrderDocumentController(JdbcTemplate jdbc,AccountFinancialTotalsService totals){this.jdbc=jdbc;this.totals=totals;}
    @GetMapping("/api/v1/client/order-requests/{requestId}/documents/{kind}")
    @PreAuthorize("hasRole('CLIENT')")
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Document owned(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID requestId,@PathVariable String kind){
        var ids=jdbc.query("SELECT order_id FROM wok.order_requests WHERE id=? AND customer_user_id=? AND order_id IS NOT NULL",
            (rs,n)->rs.getObject(1,UUID.class),requestId,UUID.fromString(jwt.getSubject()));
        if(ids.isEmpty())throw new AuthException(404,"No encontramos un pedido aceptado de tu cuenta.");
        if("COMMAND".equals(kind))throw new AuthException(403,"La comanda corresponde a Operativo.");
        return render(ids.getFirst(),kind,false);
    }
    @GetMapping("/api/v1/operational/orders/{orderId}/documents/{kind}")
    @PreAuthorize("hasAnyAuthority('orders:manage','accounts:manage','payments:manage')")
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Document operational(@PathVariable UUID orderId,@PathVariable String kind){return render(orderId,kind,true);}
    private Document render(UUID id,String kind,boolean operational){
        if(!List.of("COMMAND","PREBILL","RECEIPT").contains(kind))throw new AuthException(422,"Tipo de documento inválido.");
        var headers=jdbc.query("SELECT account_id,code,status FROM wok.orders WHERE id=?",(rs,n)->new Header(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3)),id);
        if(headers.isEmpty())throw new AuthException(404,"No encontramos ese pedido.");Header header=headers.getFirst();
        String title="COMMAND".equals(kind)?"COMANDA":"PREBILL".equals(kind)?"PRECUENTA":"COMPROBANTE";
        StringBuilder html=new StringBuilder("<article class=\"wok-print-document\"><h1>").append(title).append("</h1><p>")
            .append(NOTICE).append("</p><h2>WOK Asian Food</h2><p>").append(escape(header.code())).append(" · ").append(escape(header.status())).append("</p><table><thead><tr><th>Cantidad</th><th>Producto</th><th>Importe</th></tr></thead><tbody>");
        var lines=jdbc.query("""
            SELECT oi.id,oi.name_snapshot,oi.quantity,oi.unit_price,oi.line_total,c.code,oi.notes,pa.name AS station
            FROM wok.order_items oi JOIN wok.orders o ON o.id=oi.order_id JOIN wok.currencies c ON c.id=o.currency_id
            JOIN wok.preparation_areas pa ON pa.id=oi.preparation_area_id WHERE oi.order_id=? ORDER BY pa.code,oi.id
            """,(rs,n)->new Line(rs.getObject(1,UUID.class),rs.getString(2),rs.getInt(3),rs.getBigDecimal(4),rs.getBigDecimal(5),rs.getString(6),rs.getString(7),rs.getString(8)),id);
        for(Line line:lines){html.append("<tr><td>").append(line.quantity()).append("</td><td>").append(escape(line.name()));
            for(String modifier:jdbc.query("SELECT group_name_snapshot||': '||modifier_name_snapshot FROM wok.order_item_modifiers WHERE order_item_id=? ORDER BY group_name_snapshot,modifier_name_snapshot",(rs,n)->rs.getString(1),line.id()))html.append("<br>").append(escape(modifier));
            if("COMMAND".equals(kind))html.append("<br>").append(escape(line.station())).append("<br>").append(escape(line.notes()));
            html.append("</td><td>").append("COMMAND".equals(kind)?"":escape(line.currency()+" "+line.total().toPlainString())).append("</td></tr>");}
        html.append("</tbody></table>");
        if(!"COMMAND".equals(kind))for(var total:totals.totals(header.account()).currencies())html.append("<section><h3>").append(escape(total.currency())).append("</h3><p>Total ").append(total.total().toPlainString())
            .append(" · Pagado ").append(total.paid().toPlainString()).append(" · Saldo ").append(total.balance().toPlainString()).append("</p><p>Propinas ").append(total.tips().toPlainString()).append("</p></section>");
        html.append("<p>").append(NOTICE).append("</p></article>");return new Document(id,title,NOTICE,html.toString());
    }
    static String escape(String value){return value==null?"":value.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;");}
    public record Document(UUID orderId,String title,String notice,String html) {}
    private record Header(UUID account,String code,String status) {}
    private record Line(UUID id,String name,int quantity,BigDecimal unit,BigDecimal total,String currency,String notes,String station) {}
}
