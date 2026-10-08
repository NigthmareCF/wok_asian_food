package com.wokasianfood.api.messaging;

import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/client/conversations")
@PreAuthorize("hasRole('CLIENT')")
public class ClientMessagingController {
    private final CustomerMessagingService messaging;

    public ClientMessagingController(CustomerMessagingService messaging) { this.messaging = messaging; }

    @PostMapping
    public ConversationSummary open(@AuthenticationPrincipal Jwt jwt) {
        return messaging.open(UUID.fromString(jwt.getSubject()));
    }

    @GetMapping
    public List<ConversationSummary> list(@AuthenticationPrincipal Jwt jwt) {
        return messaging.listForCustomer(UUID.fromString(jwt.getSubject()));
    }

    @GetMapping("/{conversationId}/messages")
    public List<MessageItem> messages(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId) {
        return messaging.messagesForCustomer(UUID.fromString(jwt.getSubject()), conversationId);
    }

    @PostMapping("/{conversationId}/messages")
    public MessageReceipt send(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId, @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @Valid @RequestBody MessageSubmission submission) {
        return messaging.sendFromCustomer(UUID.fromString(jwt.getSubject()), conversationId,
                idempotencyKey, submission.body());
    }

    public record MessageSubmission(@NotBlank @Size(max = 4000) String body) {}
}

/**
 * Shared staff queue for APP conversations.
 *
 * <p>Deliberate model decision: conversations are a shared inbox, not per-agent ownership. Neither
 * {@code conversations} nor the schema defines an assignee, so any active OPERATIONAL or ADMIN staff
 * may read and answer any conversation, and the first reply moves it out of {@code WAITING}. This
 * matches single-site counter service, where whoever is free takes the next conversation. Access is
 * still bounded to active staff by {@code @PreAuthorize} and by the {@code channel = 'APP'} checks
 * below, which keep staff out of other channels. Switching to per-agent ownership requires an
 * {@code assigned_to} column plus a claim endpoint; see {@code docs/frontend/channels/OPERATIVO.md}.
 */
@RestController
@RequestMapping("/api/v1/operational/conversations")
@PreAuthorize("hasAnyRole('OPERATIONAL', 'ADMIN')")
class OperationalMessagingController {
    private final CustomerMessagingService messaging;

    OperationalMessagingController(CustomerMessagingService messaging) { this.messaging = messaging; }

    @GetMapping
    public List<ConversationSummary> waiting() { return messaging.waitingForHuman(); }

    @GetMapping("/{conversationId}/messages")
    public List<MessageItem> messages(@PathVariable UUID conversationId) {
        return messaging.messagesForStaff(conversationId);
    }

    @PostMapping("/{conversationId}/messages")
    public MessageReceipt reply(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId, @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @Valid @RequestBody ClientMessagingController.MessageSubmission submission) {
        return messaging.sendFromHuman(UUID.fromString(jwt.getSubject()), conversationId,
                idempotencyKey, submission.body());
    }

    @PatchMapping("/{conversationId}/close")
    public ConversationCloseReceipt close(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID conversationId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody CloseConversationRequest request) {
        return messaging.close(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, conversationId, idempotencyKey, request);
    }

    public record CloseConversationRequest(@Positive int expectedVersion,
            @NotBlank @Size(min = 3, max = 500) String reason) {}
}

@Service
class CustomerMessagingService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    @Autowired
    CustomerMessagingService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    CustomerMessagingService(JdbcTemplate jdbc) { this(jdbc, new IdempotencyStore(jdbc)); }

    @Transactional
    ConversationSummary open(UUID userId) {
        UUID customerId = requireActiveCustomer(userId);
        lockCustomer(customerId);
        List<ConversationSummary> current = jdbc.query("""
            SELECT id, status, handling_mode, updated_at, row_version
            FROM wok.conversations WHERE customer_id = ? AND channel = 'APP'
              AND status IN ('OPEN', 'WAITING') ORDER BY updated_at DESC, id DESC LIMIT 1
            """, (rs, row) -> new ConversationSummary(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getString("handling_mode"), rs.getTimestamp("updated_at").toInstant(),
                rs.getInt("row_version"), null, null, null), customerId);
        if (!current.isEmpty()) return current.getFirst();
        return jdbc.query("""
            INSERT INTO wok.conversations(customer_id, channel, status, handling_mode, created_by, updated_by)
            VALUES (?, 'APP', 'OPEN', 'HUMAN', ?, ?) RETURNING id, status, handling_mode, updated_at, row_version
            """, (rs, row) -> new ConversationSummary(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getString("handling_mode"), rs.getTimestamp("updated_at").toInstant(),
                rs.getInt("row_version"), null, null, null),
            customerId, userId, userId).getFirst();
    }

    List<ConversationSummary> listForCustomer(UUID userId) {
        UUID customerId = requireActiveCustomer(userId);
        return jdbc.query("""
            SELECT c.id, c.status, c.handling_mode, c.updated_at, c.row_version,
                   latest.body AS last_message, latest.created_at AS last_message_at
            FROM wok.conversations c
            LEFT JOIN LATERAL (
                SELECT m.body, m.created_at FROM wok.messages m WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC, m.id DESC LIMIT 1
            ) latest ON true
            WHERE c.customer_id = ? AND c.channel = 'APP'
            ORDER BY c.updated_at DESC, c.id DESC LIMIT 20
            """, (rs, row) -> new ConversationSummary(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getString("handling_mode"), rs.getTimestamp("updated_at").toInstant(), rs.getInt("row_version"),
                null, rs.getString("last_message"),
                rs.getTimestamp("last_message_at") == null ? null : rs.getTimestamp("last_message_at").toInstant()), customerId);
    }

    List<MessageItem> messagesForCustomer(UUID userId, UUID conversationId) {
        List<UUID> owned = jdbc.query("""
            SELECT c.id FROM wok.conversations c JOIN wok.customer_profiles cp ON cp.id = c.customer_id
            JOIN wok.users u ON u.id = cp.user_id AND u.status = 'ACTIVE'
            WHERE c.id = ? AND cp.user_id = ? AND c.channel = 'APP'
            """, (rs, row) -> rs.getObject("id", UUID.class), conversationId, userId);
        if (owned.isEmpty()) throw notFound();
        return recentMessages(conversationId);
    }

    List<MessageItem> messagesForStaff(UUID conversationId) {
        if (!jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM wok.conversations WHERE id = ? AND channel = 'APP')",
                Boolean.class, conversationId)) throw notFound();
        return recentMessages(conversationId);
    }

    List<ConversationSummary> waitingForHuman() {
        return jdbc.query("""
            SELECT c.id, c.status, c.handling_mode, c.updated_at, c.row_version, cp.full_name,
                   latest.body AS last_message, latest.created_at AS last_message_at
            FROM wok.conversations c JOIN wok.customer_profiles cp ON cp.id = c.customer_id
            LEFT JOIN LATERAL (
                SELECT m.body, m.created_at FROM wok.messages m WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC, m.id DESC LIMIT 1
            ) latest ON true
            WHERE c.channel = 'APP' AND c.status = 'WAITING'
            ORDER BY c.updated_at, c.id LIMIT 100
            """, (rs, row) -> new ConversationSummary(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getString("handling_mode"), rs.getTimestamp("updated_at").toInstant(), rs.getInt("row_version"),
                rs.getString("full_name"),
                rs.getString("last_message"), rs.getTimestamp("last_message_at") == null ? null : rs.getTimestamp("last_message_at").toInstant()));
    }

    @Transactional
    ConversationCloseReceipt close(UUID actorId, UUID requestId, UUID conversationId, UUID key,
            OperationalMessagingController.CloseConversationRequest request) {
        String reason = request.reason().trim();
        String fingerprint = closeFingerprint(conversationId, request.expectedVersion(), reason);
        var claim = idempotency.claim(actorId.toString(), "APP_CONVERSATION_CLOSED", key, fingerprint);
        if (claim.replay()) return closeReceipt(claim.resourceId(), true);

        List<ConversationVersion> rows = jdbc.query("""
            SELECT status, row_version FROM wok.conversations
            WHERE id = ? AND channel = 'APP' FOR UPDATE
            """, (rs, row) -> new ConversationVersion(rs.getString("status"), rs.getInt("row_version")),
                conversationId);
        if (rows.isEmpty()) throw notFound();
        ConversationVersion current = rows.getFirst();
        if ("CLOSED".equals(current.status()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La conversación ya está cerrada.");
        if (current.version() != request.expectedVersion())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La conversación cambió. Actualiza el hilo antes de cerrarlo.");

        int changed = jdbc.update("""
            UPDATE wok.conversations SET status = 'CLOSED', closed_at = now(), updated_at = now(),
                updated_by = ?, row_version = row_version + 1
            WHERE id = ? AND channel = 'APP' AND status IN ('OPEN', 'WAITING') AND row_version = ?
            """, actorId, conversationId, request.expectedVersion());
        if (changed != 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La conversación cambió. Actualiza el hilo antes de cerrarlo.");
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, 'APP_CONVERSATION_CLOSED', 'CONVERSATION', ?,
                jsonb_build_object('status', ?, 'version', ?),
                jsonb_build_object('status', 'CLOSED', 'version', ?), ?, 'SUCCESS', ?)
            """, actorId, conversationId, current.status(), current.version(), current.version() + 1,
                reason, requestId);
        idempotency.complete(actorId.toString(), "APP_CONVERSATION_CLOSED", key, conversationId);
        return closeReceipt(conversationId, false);
    }

    private ConversationCloseReceipt closeReceipt(UUID conversationId, boolean replay) {
        List<ConversationCloseReceipt> rows = jdbc.query("""
            SELECT id, status, closed_at, row_version FROM wok.conversations
            WHERE id = ? AND channel = 'APP'
            """, (rs, row) -> new ConversationCloseReceipt(rs.getObject("id", UUID.class),
                rs.getString("status"), rs.getTimestamp("closed_at").toInstant(), rs.getInt("row_version"), replay),
                conversationId);
        if (rows.isEmpty()) throw notFound();
        return rows.getFirst();
    }

    private String closeFingerprint(UUID conversationId, int expectedVersion, String reason) {
        try {
            var digest = java.security.MessageDigest.getInstance("SHA-256");
            var bytes = (conversationId + "|" + expectedVersion + "|" + reason)
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
            return java.util.HexFormat.of().formatHex(digest.digest(bytes));
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", impossible);
        }
    }

    @Transactional
    MessageReceipt sendFromCustomer(UUID userId, UUID conversationId, UUID key, String body) {
        List<ConversationAccess> rows = jdbc.query("""
            SELECT c.id, c.status FROM wok.conversations c JOIN wok.customer_profiles cp ON cp.id = c.customer_id
            JOIN wok.users u ON u.id = cp.user_id AND u.status = 'ACTIVE'
            WHERE c.id = ? AND cp.user_id = ? AND c.channel = 'APP' FOR UPDATE OF c
            """, (rs, row) -> new ConversationAccess(rs.getString("status")), conversationId, userId);
        if (rows.isEmpty()) throw notFound();
        return append(userId, conversationId, key, body, "CUSTOMER", "INBOUND", rows.getFirst().status);
    }

    @Transactional
    MessageReceipt sendFromHuman(UUID userId, UUID conversationId, UUID key, String body) {
        List<ConversationAccess> rows = jdbc.query("""
            SELECT status FROM wok.conversations WHERE id = ? AND channel = 'APP' FOR UPDATE
            """, (rs, row) -> new ConversationAccess(rs.getString("status")), conversationId);
        if (rows.isEmpty()) throw notFound();
        return append(userId, conversationId, key, body, "HUMAN", "OUTBOUND", rows.getFirst().status);
    }

    private MessageReceipt append(UUID actorId, UUID conversationId, UUID key, String rawBody,
            String senderType, String direction, String conversationStatus) {
        String body = rawBody == null ? "" : rawBody.trim();
        if (body.isEmpty() || body.length() > 4000)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El mensaje debe tener entre 1 y 4000 caracteres.");
        List<MessageReceipt> prior = jdbc.query("""
            SELECT id, sender_type, sender_user_id, body, status, created_at
            FROM wok.messages WHERE conversation_id = ? AND idempotency_key = ?
            """, (rs, row) -> new MessageReceipt(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(), true), conversationId, key);
        if (!prior.isEmpty()) {
            List<String> match = jdbc.query("""
                SELECT id::text FROM wok.messages WHERE conversation_id = ? AND idempotency_key = ?
                  AND sender_type = ? AND sender_user_id = ? AND body = ?
                """, (rs, row) -> rs.getString(1), conversationId, key, senderType, actorId, body);
            if (match.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "La clave idempotente ya se usó con otro mensaje.");
            return prior.getFirst();
        }
        if ("CLOSED".equals(conversationStatus))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La conversación está cerrada.");
        List<MessageReceipt> inserted = jdbc.query("""
            INSERT INTO wok.messages(conversation_id, sender_type, sender_user_id, direction, body, idempotency_key, status)
            VALUES (?, ?, ?, ?, ?, ?, 'SENT') RETURNING id, status, created_at
            """, (rs, row) -> new MessageReceipt(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(), false), conversationId, senderType, actorId,
                direction, body, key);
        String nextStatus = "CUSTOMER".equals(senderType) ? "WAITING" : "OPEN";
        jdbc.update("""
            UPDATE wok.conversations SET status = ?, updated_at = now(), updated_by = ?, row_version = row_version + 1
            WHERE id = ?
            """, nextStatus, actorId, conversationId);
        return inserted.getFirst();
    }

    private List<MessageItem> recentMessages(UUID conversationId) {
        return jdbc.query("""
            SELECT id, sender_type, body, status, created_at FROM (
                SELECT id, sender_type, body, status, created_at
                FROM wok.messages WHERE conversation_id = ?
                ORDER BY created_at DESC, id DESC LIMIT 100
            ) recent ORDER BY created_at, id
            """, (rs, row) -> new MessageItem(rs.getObject("id", UUID.class), rs.getString("sender_type"),
                rs.getString("body"), rs.getString("status"), rs.getTimestamp("created_at").toInstant()), conversationId);
    }

    private UUID requireActiveCustomer(UUID userId) {
        List<UUID> customers = jdbc.query("""
            SELECT cp.id FROM wok.customer_profiles cp JOIN wok.users u ON u.id = cp.user_id
            WHERE u.id = ? AND u.status = 'ACTIVE'
            """, (rs, row) -> rs.getObject("id", UUID.class), userId);
        if (customers.isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "An active client profile is required.");
        return customers.getFirst();
    }

    private void lockCustomer(UUID customerId) {
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement = connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))")) {
                statement.setString(1, customerId.toString());
                statement.execute();
            }
            return null;
        });
    }

    private ResponseStatusException notFound() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found."); }

    private record ConversationAccess(String status) {}
    private record ConversationVersion(String status, int version) {}
}

record ConversationCloseReceipt(UUID conversationId, String status, java.time.Instant closedAt,
        int version, boolean idempotentReplay) {}
