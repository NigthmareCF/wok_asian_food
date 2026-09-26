package com.wokasianfood.api.ai;

public interface AiProvider {
    Reply infer(String sanitizedPrompt);
    record Reply(String text, boolean needsHuman) {}
}
