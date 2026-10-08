package com.wokasianfood.api.payments;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/client/order-requests/{requestId}/payment-evidence")
@PreAuthorize("hasRole('CLIENT')")
class ClientPaymentEvidenceController {
    private final PaymentEvidenceService evidence;

    ClientPaymentEvidenceController(PaymentEvidenceService evidence) { this.evidence = evidence; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public PaymentEvidenceService.Receipt submit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey, @RequestPart("file") MultipartFile file) {
        return evidence.submit(UUID.fromString(jwt.getSubject()), requestId, idempotencyKey, file);
    }

    @GetMapping
    public List<PaymentEvidenceService.Receipt> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
        return evidence.clientList(UUID.fromString(jwt.getSubject()), requestId);
    }

    @GetMapping("/{evidenceId}/content")
    public ResponseEntity<byte[]> content(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId,
            @PathVariable UUID evidenceId) {
        PaymentEvidenceService.FileReceipt file = evidence.clientFile(UUID.fromString(jwt.getSubject()), requestId, evidenceId);
        return privateImage(file);
    }

    private ResponseEntity<byte[]> privateImage(PaymentEvidenceService.FileReceipt file) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.contentType()))
                .cacheControl(CacheControl.noStore().cachePrivate()).header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=payment-evidence")
                .body(file.contents());
    }
}

@RestController
@RequestMapping("/api/v1/operational/payment-evidence")
@PreAuthorize("hasAuthority('payments:manage')")
class OperationalPaymentEvidenceController {
    private final PaymentEvidenceService evidence;

    OperationalPaymentEvidenceController(PaymentEvidenceService evidence) { this.evidence = evidence; }

    @GetMapping
    public List<PaymentEvidenceService.QueueReceipt> list(@RequestParam(defaultValue = "NEEDS_REVIEW") String status) {
        return evidence.queue(status);
    }

    @GetMapping("/{evidenceId}/content")
    public ResponseEntity<byte[]> content(@PathVariable UUID evidenceId) {
        PaymentEvidenceService.FileReceipt file = evidence.operationalFile(evidenceId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.contentType()))
                .cacheControl(CacheControl.noStore().cachePrivate()).header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=payment-evidence")
                .body(file.contents());
    }

    @PostMapping("/{evidenceId}/decision")
    public PaymentEvidenceService.Receipt decide(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID evidenceId,
            @Valid @org.springframework.web.bind.annotation.RequestBody PaymentEvidenceService.DecisionRequest request) {
        return evidence.decide(UUID.fromString(jwt.getSubject()), UUID.randomUUID(), evidenceId, request);
    }
}

@Service
class PaymentEvidenceService {
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private final JdbcTemplate jdbc;
    private final PaymentEvidenceStorage storage;
    private final PaymentService payments;

    PaymentEvidenceService(JdbcTemplate jdbc, PaymentEvidenceStorage storage, PaymentService payments) {
        this.jdbc = jdbc; this.storage = storage; this.payments = payments;
    }

    @Transactional
    Receipt submit(UUID customerId, UUID requestId, UUID idempotencyKey, MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > MAX_BYTES)
            throw new AuthException(413, "Adjunta una imagen de hasta 8 MB.");
        byte[] contents;
        try { contents = file.getBytes(); }
        catch (java.io.IOException failure) { throw new AuthException(400, "No pudimos leer la imagen adjunta."); }
        if (contents.length == 0 || contents.length > MAX_BYTES)
            throw new AuthException(413, "Adjunta una imagen de hasta 8 MB.");
        String type = detectType(contents);
        String declaredType = file.getContentType();
        if (type == null || (StringUtils.hasText(declaredType) && !type.equalsIgnoreCase(declaredType.trim())))
            throw new AuthException(415, "El comprobante debe ser una imagen JPG o PNG válida.");
        String checksum = sha256(contents);

        List<Receipt> replay = jdbc.query("""
            SELECT id, order_request_id, status, content_type, byte_size, created_at, row_version, review_reason
            FROM wok.payment_evidence WHERE customer_user_id = ? AND idempotency_key = ?
            """, PaymentEvidenceService::receiptRow, customerId, idempotencyKey);
        if (!replay.isEmpty()) {
            String priorHash = jdbc.queryForObject("SELECT content_sha256 FROM wok.payment_evidence WHERE id = ?", String.class,
                    replay.getFirst().id());
            if (!checksum.equals(priorHash)) throw new AuthException(409, "La clave de reintento ya se usó con otro archivo.");
            return replay.getFirst();
        }
        RequestOwner request = request(customerId, requestId, true);
        if (!"PICKUP".equals(request.fulfillmentType()) || !"TRANSFER_AT_PICKUP".equals(request.paymentPreference()))
            throw new AuthException(409, "Este pedido no tiene transferencia como forma de pago.");
        if (!List.of("PENDING_REVIEW", "ACCEPTED").contains(request.status()))
            throw new AuthException(409, "Este pedido ya no admite comprobantes.");
        List<Receipt> sameEvidence = jdbc.query("""
            SELECT id, order_request_id, status, content_type, byte_size, created_at, row_version, review_reason
            FROM wok.payment_evidence WHERE order_request_id = ? AND customer_user_id = ? AND content_sha256 = ?
            """, PaymentEvidenceService::receiptRow, requestId, customerId, checksum);
        if (!sameEvidence.isEmpty()) {
            Receipt previous = sameEvidence.getFirst();
            if ("REJECTED".equals(previous.status()))
                throw new AuthException(409, "Este comprobante ya fue rechazado. Adjunta una imagen nueva o contacta al restaurante.");
            return previous;
        }
        boolean pendingEvidence = jdbc.queryForObject("""
            SELECT EXISTS (
                SELECT 1 FROM wok.payment_evidence
                WHERE order_request_id = ? AND customer_user_id = ? AND status = 'NEEDS_REVIEW'
            )
            """, Boolean.class, requestId, customerId);
        if (Boolean.TRUE.equals(pendingEvidence))
            throw new AuthException(409, "Ya hay un comprobante pendiente de revisión para esta solicitud.");

        UUID evidenceId = UUID.randomUUID();
        storage.write(evidenceId, contents);
        try {
            jdbc.update("""
                INSERT INTO wok.payment_evidence
                    (id, order_request_id, customer_user_id, idempotency_key, content_sha256, content_type, byte_size)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, evidenceId, requestId, customerId, idempotencyKey, checksum, type, contents.length);
            jdbc.update("""
                INSERT INTO wok.payment_evidence_events(payment_evidence_id, event_type, actor_user_id, request_id)
                VALUES (?, 'SUBMITTED', ?, ?)
                """, evidenceId, customerId, UUID.randomUUID());
        } catch (DataIntegrityViolationException duplicate) {
            storage.delete(evidenceId);
            throw new AuthException(409, "Este comprobante ya fue enviado o la solicitud cambió.");
        }
        return new Receipt(evidenceId, requestId, "NEEDS_REVIEW", type, (long) contents.length, Instant.now(), 1, null);
    }

    @Transactional(readOnly = true)
    List<Receipt> clientList(UUID customerId, UUID requestId) {
        request(customerId, requestId, false);
        return jdbc.query("""
            SELECT id, order_request_id, status, content_type, byte_size, created_at, row_version, review_reason
            FROM wok.payment_evidence WHERE customer_user_id = ? AND order_request_id = ? ORDER BY created_at DESC, id DESC
            """, PaymentEvidenceService::receiptRow, customerId, requestId);
    }

    @Transactional(readOnly = true)
    FileReceipt clientFile(UUID customerId, UUID requestId, UUID evidenceId) {
        FileMetadata metadata = jdbc.query("""
            SELECT e.content_type FROM wok.payment_evidence e JOIN wok.order_requests r ON r.id = e.order_request_id
            WHERE e.id = ? AND e.order_request_id = ? AND e.customer_user_id = ? AND r.customer_user_id = ?
            """, (rs, row) -> new FileMetadata(rs.getString(1)), evidenceId, requestId, customerId, customerId)
                .stream().findFirst().orElseThrow(() -> new AuthException(404, "No encontramos ese comprobante."));
        return new FileReceipt(metadata.contentType(), storage.read(evidenceId));
    }

    @Transactional(readOnly = true)
    List<QueueReceipt> queue(String rawStatus) {
        String status = rawStatus == null ? "NEEDS_REVIEW" : rawStatus.trim().toUpperCase(java.util.Locale.ROOT);
        if (!List.of("NEEDS_REVIEW", "VERIFIED", "REJECTED").contains(status)) throw new AuthException(400, "El filtro no es válido.");
        return jdbc.query("""
            SELECT e.id, e.order_request_id, e.status, e.content_type, e.byte_size, e.created_at,
                   e.row_version, COALESCE(cp.full_name, u.display_name) AS customer_name,
                   r.subtotal AS request_subtotal, c.code AS currency
            FROM wok.payment_evidence e JOIN wok.order_requests r ON r.id = e.order_request_id
            JOIN wok.users u ON u.id = e.customer_user_id LEFT JOIN wok.customer_profiles cp ON cp.user_id = u.id
            JOIN wok.currencies c ON c.id = r.currency_id
            WHERE e.status = ? ORDER BY e.created_at, e.id LIMIT 100
            """, (rs, row) -> new QueueReceipt(rs.getObject("id", UUID.class), rs.getObject("order_request_id", UUID.class),
                rs.getString("status"), rs.getString("content_type"), rs.getLong("byte_size"),
                rs.getTimestamp("created_at").toInstant(), rs.getInt("row_version"), rs.getString("customer_name"),
                rs.getBigDecimal("request_subtotal"), rs.getString("currency")), status);
    }

    @Transactional(readOnly = true)
    FileReceipt operationalFile(UUID evidenceId) {
        FileMetadata metadata = jdbc.query("SELECT content_type FROM wok.payment_evidence WHERE id = ?",
                (rs, row) -> new FileMetadata(rs.getString(1)), evidenceId).stream().findFirst()
                .orElseThrow(() -> new AuthException(404, "No encontramos ese comprobante."));
        return new FileReceipt(metadata.contentType(), storage.read(evidenceId));
    }

    @Transactional
    Receipt decide(UUID actor, UUID requestId, UUID evidenceId, DecisionRequest decision) {
        Evidence current = jdbc.query("""
            SELECT id, order_request_id, customer_user_id, status, row_version
            FROM wok.payment_evidence WHERE id = ? FOR UPDATE
            """, (rs, row) -> new Evidence(rs.getObject("id", UUID.class), rs.getObject("order_request_id", UUID.class),
                rs.getObject("customer_user_id", UUID.class), rs.getString("status"), rs.getInt("row_version")), evidenceId)
                .stream().findFirst().orElseThrow(() -> new AuthException(404, "No encontramos ese comprobante."));
        if (!"NEEDS_REVIEW".equals(current.status())) {
            if (current.rowVersion() == decision.expectedVersion()) throw new AuthException(409, "El comprobante ya fue revisado.");
            return findReceipt(evidenceId);
        }
        if (current.rowVersion() != decision.expectedVersion()) throw new AuthException(409, "El comprobante cambió; actualiza la revisión.");
        if (decision.action() == DecisionAction.REJECT) {
            if (!StringUtils.hasText(decision.reason()) || decision.reason().trim().length() < 3)
                throw new AuthException(422, "Indica por qué se rechaza el comprobante.");
            jdbc.update("""
                UPDATE wok.payment_evidence SET status = 'REJECTED', review_reason = ?, reviewed_by = ?, reviewed_at = now(),
                    updated_at = now(), row_version = row_version + 1 WHERE id = ? AND status = 'NEEDS_REVIEW' AND row_version = ?
                """, decision.reason().trim(), actor, evidenceId, decision.expectedVersion());
            event(evidenceId, "REJECTED", actor, decision.reason().trim(), requestId);
            audit(actor, evidenceId, "PAYMENT_EVIDENCE_REJECTED", requestId);
            return findReceipt(evidenceId);
        }
        if (decision.confirmedAmount() == null || decision.confirmedAmount().signum() <= 0)
            throw new AuthException(422, "Indica el monto que confirmaste en la cuenta bancaria.");
        RequestOwner request = requestById(current.customerUserId(), current.requestId(), true);
        if (!"ACCEPTED".equals(request.status()) || request.orderId() == null)
            throw new AuthException(409, "El pedido debe estar aceptado antes de registrar el pago.");
        UUID accountId = jdbc.query("SELECT account_id FROM wok.orders WHERE id = ?",
                (rs, row) -> rs.getObject(1, UUID.class), request.orderId()).stream().findFirst()
                .orElseThrow(() -> new AuthException(409, "El pedido no tiene una cuenta cobrable."));
        PaymentController.PaymentRequest payment = new PaymentController.PaymentRequest(
                PaymentController.PaymentMethod.TRANSFER, decision.confirmedAmount(), BigDecimal.ZERO,
                clean(decision.reference()), null, null, null);
        PaymentService.PaymentReceipt captured = payments.capture(actor, requestId, accountId,
                UUID.nameUUIDFromBytes(("payment-evidence:" + evidenceId).getBytes(StandardCharsets.UTF_8)), payment);
        jdbc.update("""
            UPDATE wok.payment_evidence SET status = 'VERIFIED', reviewed_by = ?, reviewed_at = now(), payment_id = ?,
                updated_at = now(), row_version = row_version + 1 WHERE id = ? AND status = 'NEEDS_REVIEW' AND row_version = ?
            """, actor, captured.paymentId(), evidenceId, decision.expectedVersion());
        event(evidenceId, "VERIFIED", actor, null, requestId);
        audit(actor, evidenceId, "PAYMENT_EVIDENCE_VERIFIED", requestId);
        return findReceipt(evidenceId);
    }

    private RequestOwner request(UUID customerId, UUID requestId, boolean lock) {
        return requestQuery("r.customer_user_id = ? AND r.id = ?", customerId, requestId, lock);
    }

    private RequestOwner requestById(UUID customerId, UUID requestId, boolean lock) {
        return requestQuery("r.customer_user_id = ? AND r.id = ?", customerId, requestId, lock);
    }

    private RequestOwner requestQuery(String where, UUID customerId, UUID requestId, boolean lock) {
        String sql = """
            SELECT r.id, r.customer_user_id, r.status, r.fulfillment_type, r.payment_preference, r.order_id
            FROM wok.order_requests r WHERE %s %s
            """.formatted(where, lock ? "FOR UPDATE" : "");
        return jdbc.query(sql, (rs, row) -> new RequestOwner(rs.getObject("id", UUID.class),
                rs.getObject("customer_user_id", UUID.class), rs.getString("status"), rs.getString("fulfillment_type"),
                rs.getString("payment_preference"), rs.getObject("order_id", UUID.class)), customerId, requestId)
                .stream().findFirst().orElseThrow(() -> new AuthException(404, "No encontramos esa solicitud."));
    }

    private Receipt findReceipt(UUID id) {
        return jdbc.query("""
            SELECT id, order_request_id, status, content_type, byte_size, created_at, row_version, review_reason
            FROM wok.payment_evidence WHERE id = ?
            """, PaymentEvidenceService::receiptRow, id).stream().findFirst()
                .orElseThrow(() -> new AuthException(404, "No encontramos ese comprobante."));
    }

    private void event(UUID evidenceId, String type, UUID actor, String reason, UUID requestId) {
        jdbc.update("""
            INSERT INTO wok.payment_evidence_events(payment_evidence_id, event_type, actor_user_id, reason, request_id)
            VALUES (?, ?, ?, ?, ?)
            """, evidenceId, type, actor, reason, requestId);
    }

    private void audit(UUID actor, UUID evidenceId, String action, UUID requestId) {
        jdbc.update("""
            INSERT INTO wok.audit_logs(actor_user_id, action, entity_type, entity_id, result, request_id)
            VALUES (?, ?, 'PAYMENT_EVIDENCE', ?, 'SUCCESS', ?)
            """, actor, action, evidenceId, requestId);
    }

    private static Receipt receiptRow(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new Receipt(rs.getObject("id", UUID.class), rs.getObject("order_request_id", UUID.class),
                rs.getString("status"), rs.getString("content_type"), rs.getLong("byte_size"),
                rs.getTimestamp("created_at").toInstant(), rs.getInt("row_version"), rs.getString("review_reason"));
    }

    private static String detectType(byte[] data) {
        String signatureType;
        if (data.length >= 3 && (data[0] & 0xff) == 0xff && (data[1] & 0xff) == 0xd8 && (data[2] & 0xff) == 0xff)
            signatureType = "image/jpeg";
        else {
            byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};
            if (data.length < png.length) return null;
            for (int i = 0; i < png.length; i++) if (data[i] != png[i]) return null;
            signatureType = "image/png";
        }
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            if (input == null) return null;
            java.util.Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) return null;
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                String format = reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
                if (!(signatureType.equals("image/jpeg") && (format.equals("jpeg") || format.equals("jpg")))
                        && !(signatureType.equals("image/png") && format.equals("png"))) return null;
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 20_000 || height > 20_000
                        || (long) width * height > 12_000_000L) return null;
                int sample = Math.max(1, (int) Math.ceil(Math.max(width, height) / 2048.0));
                var params = reader.getDefaultReadParam();
                params.setSourceSubsampling(sample, sample, 0, 0);
                BufferedImage image = reader.read(0, params);
                return image == null ? null : signatureType;
            } finally { reader.dispose(); }
        } catch (java.io.IOException | RuntimeException invalidImage) { return null; }
    }

    private static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private static String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    record Receipt(UUID id, UUID orderRequestId, String status, String contentType, long byteSize,
                   Instant createdAt, int version, String reviewReason) {}
    record QueueReceipt(UUID id, UUID orderRequestId, String status, String contentType, long byteSize,
                        Instant createdAt, int version, String customerName, BigDecimal amount, String currency) {}
    record FileReceipt(String contentType, byte[] contents) {}
    private record FileMetadata(String contentType) {}
    private record RequestOwner(UUID id, UUID customerUserId, String status, String fulfillmentType,
                                String paymentPreference, UUID orderId) {}
    private record Evidence(UUID id, UUID requestId, UUID customerUserId, String status, int rowVersion) {}
    enum DecisionAction { VERIFY, REJECT }
    record DecisionRequest(@NotNull DecisionAction action, @Positive int expectedVersion,
                           @DecimalMin(value = "0.01") BigDecimal confirmedAmount,
                           @Size(max = 120) String reference, @Size(max = 500) String reason) {}
}
