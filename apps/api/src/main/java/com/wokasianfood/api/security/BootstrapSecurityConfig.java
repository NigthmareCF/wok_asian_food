package com.wokasianfood.api.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Red de seguridad que cubre los endpoints base. Solo intercepta las rutas que
 * declara: el resto de la API queda a cargo de SecurityConfig, que es el catch-all.
 */
@Configuration
@EnableWebSecurity
public class BootstrapSecurityConfig {
    @Bean
    @Order(1)
    SecurityFilterChain bootstrapSecurityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .securityMatcher("/actuator/health", "/actuator/info", "/api/v1/openapi/**",
                        "/swagger-ui.html", "/swagger-ui/**")
                .authorizeHttpRequests(authorize -> authorize
                        .anyRequest()
                        .permitAll())
                .build();
    }
}
