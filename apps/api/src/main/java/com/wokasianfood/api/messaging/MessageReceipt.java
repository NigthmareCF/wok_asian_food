package com.wokasianfood.api.messaging;

import java.time.Instant;
import java.util.UUID;

public record MessageReceipt(UUID messageId, String status, Instant createdAt, boolean idempotentReplay) {}
