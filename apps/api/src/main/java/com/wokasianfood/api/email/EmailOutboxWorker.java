package com.wokasianfood.api.email;

import com.wokasianfood.api.identity.AuthSecrets;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Email is sent after the registration transaction commits; SMTP failure leaves work for retry. */
@Component
public class EmailOutboxWorker {
    private static final int MAX_ATTEMPTS = 5;
    private final JdbcTemplate jdbc;
    private final ObjectProvider<EmailProvider> providers;
    private final AuthSecrets secrets;

    public EmailOutboxWorker(JdbcTemplate jdbc, ObjectProvider<EmailProvider> providers, AuthSecrets secrets) {
        this.jdbc = jdbc; this.providers = providers; this.secrets = secrets;
    }

    @Scheduled(fixedDelayString = "${wok.email.poll-ms:5000}")
    public void sendNext() {
        jdbc.update("""
            UPDATE wok.email_outbox
            SET status = 'DEAD', last_error = 'Delivery lease expired after maximum attempts'
            WHERE status = 'SENDING' AND next_attempt_at <= now() AND attempt_count >= ?
            """, MAX_ATTEMPTS);
        EmailProvider provider = providers.getIfAvailable();
        if (provider == null) return;
        List<QueuedEmail> claimed = jdbc.query("""
            UPDATE wok.email_outbox SET status = 'SENDING', attempt_count = attempt_count + 1,
                next_attempt_at = now() + interval '5 minutes'
            WHERE id = (
              SELECT id FROM wok.email_outbox WHERE status IN ('PENDING', 'FAILED', 'SENDING')
                AND next_attempt_at <= now() AND attempt_count < ?
              ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
            ) RETURNING id, recipient, template_code, payload->>'nonce' AS nonce,
                         payload->>'ciphertext' AS ciphertext
            """, (rs, row) -> new QueuedEmail(rs.getObject("id", UUID.class), rs.getString("recipient"),
                rs.getString("template_code"), rs.getString("nonce"), rs.getString("ciphertext")), MAX_ATTEMPTS);
        if (claimed.isEmpty()) return;
        QueuedEmail message = claimed.getFirst();
        try {
            String code = decrypt(message.nonce, message.ciphertext);
            String subject = "ACCOUNT_VERIFICATION".equals(message.template) ? "Verifica tu cuenta WOK" : "Recupera tu cuenta WOK";
            provider.send(message.recipient, subject, "Tu código WOK es " + code + ". Vence en 15 minutos.");
            jdbc.update("UPDATE wok.email_outbox SET status = 'SENT', sent_at = now(), last_error = NULL WHERE id = ?", message.id);
        } catch (RuntimeException error) {
            jdbc.update("""
                UPDATE wok.email_outbox SET status = CASE WHEN attempt_count >= 5 THEN 'DEAD' ELSE 'FAILED' END,
                  next_attempt_at = now() + interval '1 minute' * attempt_count, last_error = ? WHERE id = ?
                """, error.getClass().getSimpleName(), message.id);
        }
    }

    private String decrypt(String nonceBase64, String ciphertextBase64) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256"); mac.init(secrets.challengeKey());
            byte[] key = mac.doFinal("wok-email-outbox-encryption-v1".getBytes(StandardCharsets.UTF_8));
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(128, Base64.getDecoder().decode(nonceBase64)));
            return new String(cipher.doFinal(Base64.getDecoder().decode(ciphertextBase64)), StandardCharsets.UTF_8);
        } catch (Exception error) { throw new IllegalStateException("Cannot decrypt queued email", error); }
    }

    private record QueuedEmail(UUID id, String recipient, String template, String nonce, String ciphertext) {}
}
