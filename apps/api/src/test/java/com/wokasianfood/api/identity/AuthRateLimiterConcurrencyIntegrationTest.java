package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class AuthRateLimiterConcurrencyIntegrationTest extends PostgresIntegrationTest {
    @Autowired
    private AuthRateLimiter rateLimiter;

    @Test
    void concurrentLoginRequestsCannotExceedThePerIpWindowLimit() throws Exception {
        int requestCount = 32;
        String ip = "198.18.42.77";
        CountDownLatch ready = new CountDownLatch(requestCount);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> requests = new ArrayList<>();

        try (ExecutorService executor = Executors.newFixedThreadPool(requestCount)) {
            for (int index = 0; index < requestCount; index++) {
                int request = index;
                requests.add(executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    try {
                        rateLimiter.check(AuthRateLimiter.Action.LOGIN, "rate-test-" + request + "@wok.test", ip);
                        return true;
                    } catch (AuthException limited) {
                        if (limited.status() != 429) throw limited;
                        return false;
                    }
                }));
            }
            ready.await();
            start.countDown();
            int accepted = 0;
            for (Future<Boolean> request : requests) if (request.get()) accepted++;

            assertThat(accepted).isEqualTo(20);
        }

        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.auth_rate_limit_events
                WHERE action = 'LOGIN' AND scope = 'IP' AND subject = ?
                """, Integer.class, ip)).isEqualTo(requestCount);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.security_events
                WHERE event_type = 'AUTH_RATE_LIMITED' AND ip_address = ?::inet
                  AND details->>'action' = 'LOGIN'
                """, Integer.class, ip)).isEqualTo(12);
    }
}
