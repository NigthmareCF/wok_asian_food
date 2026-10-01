package com.wokasianfood.api.email;

public interface EmailProvider {
    void send(String recipient, String subject, String body);
}
