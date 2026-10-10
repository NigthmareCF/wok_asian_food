package com.wokasianfood.api.identity;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PhoneVerificationService {
    private final JdbcTemplate jdbc;
    private final ChallengeService codes;
    private final PhoneVerificationProvider provider;
    public PhoneVerificationService(JdbcTemplate jdbc, ChallengeService codes, PhoneVerificationProvider provider) {
        this.jdbc=jdbc;this.codes=codes;this.provider=provider;
    }
    public static String normalize(String phone) {
        if(phone==null) throw new AuthException(422,"Indica un teléfono con código de país.");
        String normalized=phone.replaceAll("[() .-]","");
        if(!normalized.matches("\\+[1-9][0-9]{6,14}"))
            throw new AuthException(422,"Usa el teléfono internacional con + y código de país.");
        return normalized;
    }
    private String lockPhone(UUID user) {
        List<String> rows=jdbc.query("SELECT phone FROM wok.users WHERE id=? AND status='ACTIVE' FOR UPDATE",
            (rs,n)->rs.getString(1),user);
        if(rows.isEmpty()) throw new AuthException(404,"No encontramos tu perfil.");
        return normalize(rows.getFirst());
    }
    @Transactional(noRollbackFor=AuthException.class)
    public Challenge start(UUID user, String phone) {
        String number=normalize(phone);
        if(!lockPhone(user).equals(number)) throw new AuthException(409,"Actualiza primero el teléfono de tu perfil.");
        if(!provider.available()) throw new AuthException(503,"No hay un canal autorizado de verificación telefónica disponible.");
        Integer recent=jdbc.queryForObject("""
            SELECT count(*) FROM wok.phone_verification_challenges
            WHERE user_id=? AND created_at>now()-interval '1 hour'
            """,Integer.class,user);
        Boolean tooSoon=jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM wok.phone_verification_challenges
            WHERE user_id=? AND created_at>now()-interval '60 seconds')
            """,Boolean.class,user);
        if(recent>=5||Boolean.TRUE.equals(tooSoon)) throw new AuthException(429,"Espera antes de solicitar otro código.");
        jdbc.update("UPDATE wok.phone_verification_challenges SET status='SUPERSEDED' WHERE user_id=? AND status='PENDING'",user);
        UUID id=UUID.randomUUID();Instant expires=Instant.now().plusSeconds(300);String code=codes.createCode();
        jdbc.update("""
            INSERT INTO wok.phone_verification_challenges(id,user_id,phone,code_digest,provider_real,expires_at)
            VALUES(?,?,?,?,?,?)
            """,id,user,number,codes.hash("phone:"+id+":"+user+":"+number,code),provider.provesRealPossession(),Timestamp.from(expires));
        try { provider.send(id,number,code,expires); }
        catch(RuntimeException failure) {
            jdbc.update("UPDATE wok.phone_verification_challenges SET status='FAILED' WHERE id=?",id);
            throw new AuthException(503,"No se pudo entregar el código. Inténtalo más tarde.");
        }
        return new Challenge(id,expires,false);
    }
    @Transactional(noRollbackFor=AuthException.class)
    public Status confirm(UUID user, UUID id, String code) {
        String phone=lockPhone(user);
        List<Row> rows=jdbc.query("""
            SELECT phone,code_digest,provider_real,expires_at,attempts,status
            FROM wok.phone_verification_challenges WHERE id=? AND user_id=? FOR UPDATE
            """,(rs,n)->new Row(rs.getString(1),rs.getString(2),rs.getBoolean(3),
            rs.getTimestamp(4).toInstant(),rs.getInt(5),rs.getString(6)),id,user);
        if(rows.isEmpty()) throw new AuthException(404,"No encontramos esa verificación.");
        Row row=rows.getFirst();
        if(!phone.equals(row.phone())) throw new AuthException(409,"El número cambió. Solicita un código nuevo.");
        if(!"PENDING".equals(row.status())) throw new AuthException(409,"El código ya no está disponible.");
        if(!row.expiry().isAfter(Instant.now())) {
            jdbc.update("UPDATE wok.phone_verification_challenges SET status='EXPIRED' WHERE id=?",id);
            throw new AuthException(410,"El código venció.");
        }
        boolean matches=code!=null&&code.matches("[0-9]{6}")
            &&codes.matches("phone:"+id+":"+user+":"+phone,code,row.digest());
        jdbc.update("UPDATE wok.phone_verification_challenges SET attempts=attempts+1,status=? WHERE id=?",
            matches?"VERIFIED":row.attempts()+1>=5?"FAILED":"PENDING",id);
        if(!matches) throw new AuthException(422,"El código no es válido.");
        jdbc.update("""
            INSERT INTO wok.phone_verifications(user_id,phone,verified_at,real_possession)
            VALUES(?,?,now(),?) ON CONFLICT(user_id) DO UPDATE
            SET phone=excluded.phone,verified_at=excluded.verified_at,real_possession=excluded.real_possession
            """,user,phone,row.real());
        jdbc.update("""
            INSERT INTO wok.audit_logs(actor_user_id,action,entity_type,entity_id,after_data,result,request_id)
            VALUES(?,'PHONE_VERIFIED','USER',?,jsonb_build_object('realPossession',?), 'SUCCESS',?)
            """,user,user,row.real(),id);
        return status(user);
    }
    public Status status(UUID user) {
        Boolean verified=jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM wok.phone_verifications v JOIN wok.users u ON u.id=v.user_id
            WHERE v.user_id=? AND v.verified_at IS NOT NULL AND v.real_possession=true
             AND regexp_replace(u.phone,'[() .-]','','g')=v.phone)
            """,Boolean.class,user);
        return new Status(Boolean.TRUE.equals(verified),provider.available());
    }
    public static void requireVerified(JdbcTemplate jdbc, UUID user, String phone) {
        String exact=normalize(phone);
        jdbc.queryForObject("SELECT id FROM wok.users WHERE id=? FOR SHARE",UUID.class,user);
        Boolean verified=jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM wok.phone_verifications v JOIN wok.users u ON u.id=v.user_id
             WHERE v.user_id=? AND v.phone=? AND v.verified_at IS NOT NULL AND v.real_possession=true
             AND regexp_replace(u.phone,'[() .-]','','g')=v.phone)
            """,Boolean.class,user,exact);
        if(!Boolean.TRUE.equals(verified)) throw new AuthException(422,"Delivery requiere verificar la posesión del teléfono exacto de contacto.");
    }
    public record Challenge(UUID challengeId,Instant expiresAt,boolean verified) {}
    public record Status(boolean verified,boolean transportAvailable) {}
    private record Row(String phone,String digest,boolean real,Instant expiry,int attempts,String status) {}
}
