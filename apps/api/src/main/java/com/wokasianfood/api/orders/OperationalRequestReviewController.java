package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.hibernate.validator.constraints.CodePointLength;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/operational/order-requests")
public class OperationalRequestReviewController {
    private final JdbcTemplate jdbc;
    public OperationalRequestReviewController(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    @PostMapping("/{requestId}/logistics-confirmation")
    @PreAuthorize("hasAuthority('orders:manage')")
    @Transactional
    public ReviewReceipt logistics(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID requestId,@RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody Reason request) {
        return record(UUID.fromString(jwt.getSubject()),requestId,request.reason(),false,key);
    }
    @PostMapping("/{requestId}/override")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public ReviewReceipt override(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID requestId,@RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody Reason request) {
        return record(UUID.fromString(jwt.getSubject()),requestId,request.reason(),true,key);
    }
    private ReviewReceipt record(UUID actor,UUID id,String reason,boolean override,UUID key) {
        var keys=new com.wokasianfood.api.platform.IdempotencyStore(jdbc);
        String operation=override?"ORDER_REQUEST_OVERRIDE":"DELIVERY_LOGISTICS_CONFIRMED";
        String fingerprint=id+"|"+reason.trim();
        var claim=keys.claim(actor.toString(),operation,key,fingerprint);
        if(claim.replay())return new ReviewReceipt(claim.resourceId(),override?"OVERRIDE_RECORDED":"LOGISTICS_CONFIRMED");
        var states=jdbc.query("SELECT status,fulfillment_type FROM wok.order_requests WHERE id=? FOR UPDATE",
            (rs,n)->new String[]{rs.getString(1),rs.getString(2)},id);
        if(states.isEmpty()) throw new AuthException(404,"No encontramos esa solicitud.");
        if(!states.getFirst()[0].equals("PENDING_REVIEW")) throw new AuthException(409,"La solicitud ya fue atendida.");
        if(!override && !states.getFirst()[1].equals("DELIVERY")) throw new AuthException(422,"La confirmación logística corresponde a delivery.");
        if(override) jdbc.update("UPDATE wok.order_requests SET override_by=?,override_reason=? WHERE id=?",actor,reason.trim(),id);
        else jdbc.update("UPDATE wok.order_requests SET logistics_confirmed_by=?,logistics_confirmed_at=now(),logistics_reason=? WHERE id=?",actor,reason.trim(),id);
        jdbc.update("""
            INSERT INTO wok.audit_logs(actor_user_id,action,entity_type,entity_id,reason,result,request_id)
            VALUES(?,?,'ORDER_REQUEST',?,?,'SUCCESS',?)
            """,actor,override?"ORDER_REQUEST_OVERRIDE":"DELIVERY_LOGISTICS_CONFIRMED",id,reason.trim(),UUID.randomUUID());
        keys.complete(actor.toString(),operation,key,id);
        return new ReviewReceipt(id,override?"OVERRIDE_RECORDED":"LOGISTICS_CONFIRMED");
    }
    public record Reason(@NotBlank @CodePointLength(min=3,max=500) String reason) {}
    public record ReviewReceipt(UUID requestId,String status) {}
}
