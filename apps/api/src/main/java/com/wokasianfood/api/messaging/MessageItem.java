package com.wokasianfood.api.messaging;

import java.time.Instant;
import java.util.UUID;

public record MessageItem(UUID messageId, String senderType, String body, String status, Instant createdAt) {}
