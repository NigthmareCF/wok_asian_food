package com.wokasianfood.api.payments;

import com.wokasianfood.api.identity.AuthException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** No capture, claim insertion/deletion, financial repair or physical-money inference lives here. */
@Service
public class PaymentAttemptResolutionService {
    private static final String OPERATION = "ACCOUNT_PAYMENT_CAPTURED";
    private final JdbcTemplate jdbc;
    private final PaymentAttemptService attempts;
    private final TransactionTemplate read;
    private final TransactionTemplate write;

    PaymentAttemptResolutionService(JdbcTemplate jdbc, PaymentAttemptService attempts,
            PlatformTransactionManager transactions) {
        this.jdbc = jdbc; this.attempts = attempts;
        read = new TransactionTemplate(transactions);
        read.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        read.setReadOnly(true); read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        write = new TransactionTemplate(transactions);
        write.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        write.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    public Review review(UUID actor, UUID account, UUID id) {
        return read.execute(tx -> review(actor, attempts.resolutionRow(account,id,false)));
    }
    private Review review(UUID actor, PaymentAttemptService.Row row) {
        List<Claim> claims = claims(row,false);
        boolean registered = row.paymentId() != null || claims.stream().anyMatch(c -> c.resource() != null
                && Boolean.TRUE.equals(jdbc.queryForObject("""
                    SELECT EXISTS(SELECT 1 FROM wok.payments WHERE id=? AND account_id=?
                        AND captured_by=? AND status='CAPTURED')
                    """,Boolean.class,c.resource(),row.account(),row.owner())));
        boolean eligible = !row.owner().equals(actor) && List.of("PREPARED","PENDING").contains(row.status())
                && row.paymentId() == null && claims.isEmpty();
        return new Review(row.owner(), attempts.result(row), registered,
                claims.isEmpty() ? "ABSENT" : claims.getFirst().status(),
                eligible ? List.of("RETIRE_WITH_EVIDENCE") : List.of());
    }

    public Queue queue(UUID account, UUID cursor) {
        return read.execute(tx -> {
            PaymentAttemptService.Row boundary = null;
            if (cursor != null) {
                List<PaymentAttemptService.Row> found = attempts.rows("a.id = ?"+(account==null?"":" AND a.account_id = ?"),
                        false,account==null?new Object[]{cursor}:new Object[]{cursor,account});
                if(found.isEmpty()) throw new AuthException(404,"No encontramos el cursor en esta revisión.");
                boundary=found.getFirst();
            }
            String where="a.status IN ('PREPARED','PENDING')";
            List<Object> args=new ArrayList<>();
            if(account!=null){where+=" AND a.account_id = ?";args.add(account);}
            if(boundary!=null){where+=" AND (a.created_at,a.id) < (?,?)";args.add(boundary.createdAt());args.add(boundary.id());}
            List<PaymentAttemptService.Row> rows=attempts.rows(where+" ORDER BY a.created_at DESC,a.id DESC LIMIT 51",false,args.toArray());
            List<QueueItem> items=rows.stream().limit(50).map(r->new QueueItem(r.id(),r.account(),r.owner(),r.status(),r.version(),r.createdAt())).toList();
            return new Queue(items,rows.size()>50?"resolution:"+items.getLast().attemptId():null);
        });
    }

    public Review resolve(UUID actor, UUID account, UUID id, UUID requestId,
            PaymentAttemptResolutionController.ResolutionRequest request) {
        String reason=text(request.reason(),500), evidence=text(request.evidenceSummary(),1000);
        String reference=request.evidenceReference()==null?null:text(request.evidenceReference(),200);
        if(request.expectedVersion()==null || request.expectedVersion()<1)
            throw failure(422,"STALE_ATTEMPT_VERSION","Se requiere una versión válida.");
        if(!"NOT_RECEIVED".equals(request.physicalReceiptStatus()))
            throw failure(422,"PHYSICAL_RECEIPT_UNRESOLVED","Dinero recibido o incierto no permite retirar. Se necesita revisar el registro original.");
        PaymentAttemptService.Row identity=read.execute(tx->attempts.resolutionRow(account,id,false));
        separateActor(actor,identity);
        write.executeWithoutResult(tx->{
            // Existing claim FIRST. An absent row is not a fence against later INSERT.
            claims(identity,true);
            PaymentAttemptService.Row row=attempts.resolutionRow(account,id,true);
            separateActor(actor,row);
            if("RETIRED".equals(row.status())) {
                var old=row.resolution();
                if(old!=null && old.actorId().equals(actor) && old.expectedVersion()==request.expectedVersion()
                        && old.reason().equals(reason) && old.evidenceSummary().equals(evidence)
                        && Objects.equals(old.evidenceReference(),reference)
                        && old.physicalReceiptStatus().equals(request.physicalReceiptStatus())) return;
                throw failure(409,"STALE_ATTEMPT_VERSION","El intento ya fue retirado con otra decisión.");
            }
            attempts.lockAccount(account);
            if("CONFIRMED".equals(row.status()) || row.paymentId()!=null)
                throw failure(409,"CONFIRMED_EVIDENCE_EXISTS","La confirmación se conserva; este intento no puede retirarse.");
            if(row.version()!=request.expectedVersion())
                throw failure(409,"STALE_ATTEMPT_VERSION","La versión cambió. Consulta nuevamente antes de resolver.");
            if(!List.of("PREPARED","PENDING").contains(row.status()))
                throw failure(409,"RECONCILIATION_REQUIRED","Este resultado no permite resolución excepcional.");
            // NEVER wait on a claim after holding attempt/account: a financial executor may hold
            // an uncommitted claim and be waiting on this attempt. Its RETIRED check rolls it back.
            if(!claims(row,false).isEmpty())
                throw failure(409,"RECONCILIATION_REQUIRED","Existe evidencia idempotente que requiere revisión; no se elimina ni se deduce ausencia de captura.");
            if(Boolean.TRUE.equals(jdbc.queryForObject("""
                    SELECT EXISTS(SELECT 1 FROM wok.payment_attempts WHERE previous_attempt_id = ?)
                        OR EXISTS(SELECT 1 FROM wok.payment_attempts WHERE account_id = ?
                            AND status IN ('PREPARED','PENDING') AND id <> ?)
                        OR (SELECT id FROM wok.payment_attempts WHERE account_id = ? ORDER BY sequence DESC LIMIT 1) <> ?
                    """,Boolean.class,id,account,id,account,id)))
                throw failure(409,"RECONCILIATION_REQUIRED","La cuenta tiene otro intento; se necesita revisión.");
            jdbc.update("""
                    UPDATE wok.payment_attempts SET status='RETIRED',retired_reason=?,row_version=row_version+1,
                        updated_at=now(),transition_actor=?,resolved_by=?,resolved_at=now(),resolution_reason=?,
                        resolution_evidence=?,resolution_evidence_reference=?,resolution_expected_version=?,
                        resolution_physical_receipt_status='NOT_RECEIVED' WHERE id=? AND account_id=?
                    """,reason,actor,actor,reason,evidence,reference,row.version(),id,account);
            jdbc.update("""
                    INSERT INTO wok.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,result,request_id)
                    SELECT ?,'PAYMENT_ATTEMPT_RESOLVED_WITHOUT_CAPTURE','PAYMENT_ATTEMPT',a.id,
                        jsonb_build_object('status',?::text,'version',?::bigint,'executionRequestedAt',a.execution_requested_at),
                        jsonb_build_object('accountId',a.account_id,'ownerId',a.created_by,'status',a.status,'version',a.row_version,
                            'executionRequestedAt',a.execution_requested_at,'resolvedBy',a.resolved_by,'resolvedAt',a.resolved_at,
                            'reason',a.resolution_reason,'evidenceSummary',a.resolution_evidence,
                            'evidenceReference',a.resolution_evidence_reference,'physicalReceiptStatus',a.resolution_physical_receipt_status),
                        'SUCCESS',? FROM wok.payment_attempts a WHERE a.id=? AND a.account_id=?
                    """,actor,row.status(),row.version(),requestId,id,account);
        });
        return review(actor,account,id);
    }
    private List<Claim> claims(PaymentAttemptService.Row row,boolean lock) {
        return jdbc.query("SELECT status,resource_id FROM wok.idempotency_keys WHERE principal_scope=? AND operation=? AND key=?"
                        +(lock?" FOR UPDATE":""),
                (rs,n)->new Claim(rs.getString(1),rs.getObject(2,UUID.class)),row.owner().toString(),OPERATION,row.key().toString());
    }
    private void separateActor(UUID actor,PaymentAttemptService.Row row) {
        if(row.owner().equals(actor))
            throw failure(403,"SEPARATE_RESPONSIBLE_REQUIRED","Otro responsable autorizado debe resolver este intento; no puedes resolver el que creaste.");
    }
    private String text(String value,int maximum) {
        if(value==null || value.isBlank() || value.length()>maximum)
            throw failure(422,"RESOLUTION_EVIDENCE_REQUIRED","Se requieren motivo y evidencia válidos; no incluyas secretos ni datos de tarjetas.");
        return value.trim();
    }
    private static ResolutionFailure failure(int status,String code,String message) {
        return new ResolutionFailure(status,code,message);
    }
    public static class ResolutionFailure extends AuthException {
        private final String code;
        ResolutionFailure(int status,String code,String message){super(status,message);this.code=code;}
        public String code(){return code;}
    }
    private record Claim(String status,UUID resource) {}
    public record Review(UUID ownerUserId,PaymentAttemptService.Result attempt,boolean registeredCapture,
            String claimState,List<String> availableActions) {}
    public record QueueItem(UUID attemptId,UUID accountId,UUID ownerUserId,String status,long version,OffsetDateTime createdAt) {}
    public record Queue(List<QueueItem> items,String nextCursor) {}
}
