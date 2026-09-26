package com.wokasianfood.api.ai;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class AiGatewayTest {
    @Test void outOfScopeQueryNeverCallsProvider() {
        AiProvider provider = prompt -> { throw new AssertionError("AI was called for unrelated request"); };
        var result = new AiGateway(provider, "mock").reply("Resuelve mi tarea de álgebra");
        assertFalse(result.needsHuman());
        assertTrue(result.text().contains("WOK Asian Food"));
    }

    @Test void disabledRuntimeFallsBackToHuman() {
        var result = new AiGateway(new MockAiProvider(), "disabled").reply("Quiero hacer un pedido");
        assertTrue(result.needsHuman());
    }

    @Test void runtimeFailureDoesNotBreakCore() {
        var result = new AiGateway(new MockAiProvider(), "mock").reply("pedido [timeout]");
        assertTrue(result.needsHuman());
    }
}
