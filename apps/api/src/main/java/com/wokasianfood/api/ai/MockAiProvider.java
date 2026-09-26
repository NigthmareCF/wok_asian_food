package com.wokasianfood.api.ai;

import org.springframework.stereotype.Component;

@Component
public class MockAiProvider implements AiProvider {
    @Override public Reply infer(String sanitizedPrompt) {
        if (sanitizedPrompt.contains("[timeout]")) throw new RuntimeException("Mock timeout");
        if (sanitizedPrompt.contains("[unavailable]")) throw new RuntimeException("Mock unavailable");
        if (sanitizedPrompt.contains("[handoff]")) return new Reply("Te pondremos en contacto con nuestro equipo.", true);
        return new Reply("Puedo ayudarte con pedidos, menú, reservas y servicios de WOK Asian Food.", false);
    }
}
