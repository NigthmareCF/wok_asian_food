package com.wokasianfood.api.email;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class EmailOutboxWorkerIntegrationTest extends PostgresIntegrationTest {
    @Autowired
    private EmailOutboxWorker worker;

    @Test
    void marksExpiredFinalAttemptDeadAfterWorkerCrash() {
        UUID messageId = jdbc.queryForObject("""
                INSERT INTO wok.email_outbox(recipient, template_code, payload, status, attempt_count, next_attempt_at)
                VALUES ('retry-test@wok.test', 'ACCOUNT_VERIFICATION', '{}'::jsonb, 'SENDING', 5, now() - interval '1 minute')
                RETURNING id
                """, UUID.class);

        worker.sendNext();

        assertThat(jdbc.queryForMap("SELECT status, last_error FROM wok.email_outbox WHERE id = ?", messageId))
                .containsEntry("status", "DEAD")
                .containsEntry("last_error", "Delivery lease expired after maximum attempts");
    }
}
