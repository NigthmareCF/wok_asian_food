package com.wokasianfood.api.identity;

import java.time.Instant;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class PhoneVerificationConfiguration {
    @Bean
    @ConditionalOnMissingBean(PhoneVerificationProvider.class)
    PhoneVerificationProvider unavailablePhoneTransport() {
        return new PhoneVerificationProvider() {
            public boolean available() { return false; }
            public boolean provesRealPossession() { return false; }
            public void send(UUID id, String phone, String code, Instant expiry) {
                throw new AuthException(503,"No hay un canal autorizado de verificación telefónica disponible.");
            }
        };
    }
}
