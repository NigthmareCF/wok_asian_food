package com.wokasianfood.api.ai;

import org.springframework.stereotype.Component;

/** Deterministic development adapter; it does not access business data or confirm operations. */
@Component
public class MockAiProvider implements AiProvider {
    @Override
    public Reply infer(String sanitizedPrompt) {
        if (sanitizedPrompt.contains("[timeout]") || sanitizedPrompt.contains("[unavailable]"))
            throw new IllegalStateException("Mock inference unavailable");
        if (sanitizedPrompt.contains("[handoff]"))
            return new Reply("Te pondremos en contacto con nuestro equipo.", true);
        return new Reply("Puedo orientarte sobre el menú y los servicios de WOK. Para confirmar disponibilidad o un pedido, consulta al equipo.", false);
    }
}
