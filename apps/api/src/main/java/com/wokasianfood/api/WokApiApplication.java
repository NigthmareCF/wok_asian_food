package com.wokasianfood.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class WokApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(WokApiApplication.class, args);
    }
}
