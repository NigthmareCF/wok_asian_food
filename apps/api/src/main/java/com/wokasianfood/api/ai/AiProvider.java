package com.wokasianfood.api.ai;

/** Inference port. Implementations receive only a validated WOK-domain prompt and no database handle. */
public interface AiProvider {
    Reply infer(String sanitizedPrompt);

    record Reply(String text, boolean needsHuman) {}
}
