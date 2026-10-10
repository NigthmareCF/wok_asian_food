package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

final class OrderMutationGuard {
    private OrderMutationGuard() {}
    static void requireNoUncertainPayment(JdbcTemplate jdbc,UUID account) {
        Boolean uncertain=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM wok.payment_attempts WHERE account_id=? AND status IN ('PREPARED','PENDING'))",Boolean.class,account);
        if(Boolean.TRUE.equals(uncertain))throw new AuthException(409,"Resuelve primero el intento de pago pendiente o incierto.");
    }
    static void requireOverride(JdbcTemplate jdbc,UUID actor,boolean override,String reason) {
        if(!override||reason==null||reason.trim().codePointCount(0,reason.trim().length())<3)
            throw new AuthException(409,"PREPARING/READY requiere revisión manual y override autorizado con motivo.");
        Boolean authorized=jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM wok.user_roles ur JOIN wok.roles r ON r.id=ur.role_id
            JOIN wok.users u ON u.id=ur.user_id WHERE ur.user_id=? AND ur.revoked_at IS NULL
            AND r.code='ADMIN' AND r.active=true AND u.status='ACTIVE')
            """,Boolean.class,actor);
        if(!Boolean.TRUE.equals(authorized))throw new AuthException(403,"No tienes autorización para este override.");
    }
}
