package com.wokasianfood.api.service;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.LocalTime;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
public class PublicServicePolicyController {
    private final ServiceHoursPolicy policy;
    private final JdbcTemplate jdbc;
    public PublicServicePolicyController(ServiceHoursPolicy policy, JdbcTemplate jdbc) {
        this.policy=policy; this.jdbc=jdbc;
    }
    @GetMapping("/api/v1/public/service-policy")
    public ServiceHoursPolicy.Policy current() { return policy.current(); }

    @PutMapping("/api/v1/admin/service-policy")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public ServiceHoursPolicy.Policy update(@AuthenticationPrincipal Jwt jwt, @RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody Update request) {
        UUID actor=UUID.fromString(jwt.getSubject());
        var keys=new com.wokasianfood.api.platform.IdempotencyStore(jdbc);
        var claim=keys.claim(actor.toString(),"SERVICE_POLICY_UPDATE",key,request.toString());
        if(claim.replay()) return jdbc.queryForObject("SELECT snapshot->>'version',snapshot->>'holdMinutes',snapshot->>'tableLastArrival',snapshot->>'deliveryReviewFrom',snapshot->>'pickupLastArrival',snapshot->>'pickupNewPreparationUntil' FROM wok.service_policy_change_receipts WHERE id=?",
            (rs,n)->new ServiceHoursPolicy.Policy(Long.parseLong(rs.getString(1)),Integer.parseInt(rs.getString(2)),LocalTime.parse(rs.getString(3)),LocalTime.parse(rs.getString(4)),LocalTime.parse(rs.getString(5)),LocalTime.parse(rs.getString(6))),claim.resourceId());
        if(request.tableLastArrival().isAfter(LocalTime.of(21,15))||request.deliveryReviewFrom().isAfter(LocalTime.of(20,0)))
            throw new AuthException(422,"La política no puede extender la llegada máxima ni eliminar la revisión delivery desde las 20:00.");
        if (request.pickupNewPreparationUntil().isAfter(request.pickupLastArrival()))
            throw new AuthException(422,"El cutoff de preparación supera el de recogida.");
        int updated=jdbc.update("""
            UPDATE wok.service_policy SET hold_minutes=?, table_last_arrival=?, delivery_review_from=?,
                pickup_last_arrival=?, pickup_new_preparation_until=?, version=version+1,
                updated_by=?, updated_at=now() WHERE id=1 AND version=?
            """, request.holdMinutes(),request.tableLastArrival(),request.deliveryReviewFrom(),
            request.pickupLastArrival(),request.pickupNewPreparationUntil(),actor,request.expectedVersion());
        if(updated!=1) throw new AuthException(409,"La política cambió. Actualiza antes de continuar.");
        jdbc.update("""
            INSERT INTO wok.audit_logs(actor_user_id,action,entity_type,entity_id,after_data,result,request_id)
            VALUES(?,'SERVICE_POLICY_UPDATED','SERVICE_POLICY',?,
                jsonb_build_object('version',?,'reason',?), 'SUCCESS',?)
            """, actor,new UUID(0,1),request.expectedVersion()+1,request.reason().trim(),UUID.randomUUID());
        var result=policy.current();
        UUID receipt=jdbc.queryForObject("INSERT INTO wok.service_policy_change_receipts(snapshot) VALUES(jsonb_build_object('version',?,'holdMinutes',?,'tableLastArrival',?,'deliveryReviewFrom',?,'pickupLastArrival',?,'pickupNewPreparationUntil',?)) RETURNING id",UUID.class,result.version(),result.holdMinutes(),result.tableLastArrival().toString(),result.deliveryReviewFrom().toString(),result.pickupLastArrival().toString(),result.pickupNewPreparationUntil().toString());
        keys.complete(actor.toString(),"SERVICE_POLICY_UPDATE",key,receipt);
        return result;
    }
    public record Update(@Positive long expectedVersion,@Min(1) @Max(60) int holdMinutes,
        @NotNull LocalTime tableLastArrival,@NotNull LocalTime deliveryReviewFrom,
        @NotNull LocalTime pickupLastArrival,@NotNull LocalTime pickupNewPreparationUntil,
        @NotBlank @jakarta.validation.constraints.Size(min=3,max=500) String reason) {}
}
