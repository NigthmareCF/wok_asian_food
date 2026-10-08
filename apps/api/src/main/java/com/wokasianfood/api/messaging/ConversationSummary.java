package com.wokasianfood.api.messaging;

import java.time.Instant;
import java.util.UUID;

public record ConversationSummary(UUID conversationId, String status, String handlingMode, Instant updatedAt, int version,
        String customerName, String lastMessage, Instant lastMessageAt) {}
