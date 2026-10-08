package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;

class ClientIpResolverIntegrationTest extends PostgresIntegrationTest {
    @Autowired private Environment environment;

    @Test
    void defaultConfigurationIgnoresDirectSpoofingAndPreservesTheSocketPeer() {
        assertThat(environment.getProperty("server.forward-headers-strategy")).isEqualTo("none");
        assertThat(environment.getProperty("wok.http.trusted-proxies")).isNullOrEmpty();
        int before = peerAttempts();
        for (String forwarded : new String[] {"203.0.113.7", "2001:db8::7"}) {
            var response = post("/api/v1/auth/reset/request", null,
                    "{\"email\":\"ip-default-" + UUID.randomUUID() + "@example.test\"}",
                    Map.of("X-Forwarded-For", forwarded, "Forwarded", "for=198.51.100.7"));
            assertThat(response.statusCode()).as(response.body()).isEqualTo(202);
        }
        assertThat(peerAttempts()).isEqualTo(before + 2);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.auth_rate_limit_events
                WHERE action = 'RESET_REQUEST' AND scope = 'IP' AND subject <> '127.0.0.1'
                """, Integer.class)).isZero();
    }

    private int peerAttempts() {
        return jdbc.queryForObject("""
                SELECT count(*) FROM wok.auth_rate_limit_events
                WHERE action = 'RESET_REQUEST' AND scope = 'IP' AND subject = '127.0.0.1'
                """, Integer.class);
    }
}
