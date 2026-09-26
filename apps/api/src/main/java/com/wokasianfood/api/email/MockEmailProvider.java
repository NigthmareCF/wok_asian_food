package com.wokasianfood.api.email;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Dev/test adapter; contents stay in process memory and are never exposed as an API. */
@Component
@ConditionalOnProperty(name = "wok.email.mode", havingValue = "mock")
public class MockEmailProvider implements EmailProvider {
    private final List<SentEmail> sent = new CopyOnWriteArrayList<>();
    @Override public void send(String recipient, String subject, String body) {
        sent.add(new SentEmail(recipient, subject, body));
    }
    public List<SentEmail> sent() { return List.copyOf(sent); }
    public record SentEmail(String recipient, String subject, String body) {}
}
