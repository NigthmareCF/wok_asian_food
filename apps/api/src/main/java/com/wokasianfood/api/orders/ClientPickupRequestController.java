package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/client/order-requests")
@PreAuthorize("hasRole('CLIENT')")
public class ClientPickupRequestController {
    private static final RowMapper<Product> PRODUCT_MAPPER = (rs, row) -> new Product(
            rs.getObject("id", UUID.class), rs.getString("name"), rs.getBigDecimal("price"),
            rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
            rs.getInt("estimated_preparation_seconds"));
    private final JdbcTemplate jdbc;

    public ClientPickupRequestController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    public PickupRequestReceipt submit(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @Valid @RequestBody PickupRequest request) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        String note = request.customerNote() == null || request.customerNote().isBlank()
                ? null : request.customerNote().trim();
        String paymentPreference = request.paymentPreference() == null ? null : request.paymentPreference().name();
        InvoiceRequest invoice = invoiceRequest(request.invoiceRequested(), request.invoiceName(), request.invoiceTaxId());
        List<RequestedItem> lines = normalizedLines(request.items());
        String fingerprint = fingerprint(request.requestedFor(), note, paymentPreference, invoice, lines);

        PickupRequestReceipt previous = existing(customerId, idempotencyKey, fingerprint, true);
        if (previous != null) return previous;

        List<Product> products = loadProducts(lines);
        if (products.size() != lines.size()) throw new AuthException(422, "Uno o más productos ya no están publicados.");
        UUID currencyId = products.getFirst().currencyId;
        String currencyCode = products.getFirst().currencyCode;
        if (products.stream().anyMatch(p -> !p.currencyId.equals(currencyId)))
            throw new AuthException(422, "No se pueden mezclar monedas en una solicitud.");

        long prepSeconds = 0;
        BigDecimal subtotal = BigDecimal.ZERO;
        for (int i = 0; i < products.size(); i++) {
            Product product = products.get(i);
            int quantity = lines.get(i).quantity();
            prepSeconds = Math.addExact(prepSeconds, Math.multiplyExact((long) product.preparationSeconds, quantity));
            subtotal = subtotal.add(product.price.multiply(BigDecimal.valueOf(quantity)));
        }
        if (prepSeconds > 86_400 || !request.requestedFor().isAfter(Instant.now().plusSeconds(prepSeconds)))
            throw new AuthException(422, "El horario solicitado es anterior al tiempo mínimo de preparación indicado.");

        List<UUID> inserted = jdbc.query("""
            INSERT INTO wok.order_requests
              (customer_user_id, fulfillment_type, idempotency_key, request_fingerprint, requested_for,
               customer_note, subtotal, currency_id, payment_preference, invoice_requested, invoice_name, invoice_tax_id)
            VALUES (?, 'PICKUP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (customer_user_id, idempotency_key) DO NOTHING RETURNING id
            """, (rs, row) -> rs.getObject(1, UUID.class), customerId, idempotencyKey, fingerprint,
                Timestamp.from(request.requestedFor()), note, subtotal, currencyId, paymentPreference,
                invoice.requested(), invoice.name(), invoice.taxId());
        if (inserted.isEmpty()) {
            previous = existing(customerId, idempotencyKey, fingerprint, true);
            if (previous != null) return previous;
            throw new AuthException(409, "No se pudo recuperar la solicitud idempotente.");
        }
        UUID requestId = inserted.getFirst();
        for (int i = 0; i < products.size(); i++) {
            Product product = products.get(i);
            jdbc.update("""
                INSERT INTO wok.order_request_items
                  (order_request_id, menu_item_id, name_snapshot, quantity, unit_price, currency_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """, requestId, product.id, product.name, lines.get(i).quantity(), product.price, product.currencyId);
        }
        jdbc.update("""
            INSERT INTO wok.order_request_events(order_request_id, event_type, actor_user_id)
            VALUES (?, 'SUBMITTED', ?)
            """, requestId, customerId);
        return new PickupRequestReceipt(requestId, "PENDING_REVIEW", request.requestedFor(), subtotal,
                currencyId, currencyCode, paymentPreference, invoice.requested(), invoice.name(), invoice.taxId(), false,
                "Recibimos tu solicitud. El equipo debe confirmar disponibilidad y horario antes de aceptarla.");
    }

    @GetMapping
    public List<PickupRequestReceipt> history(@AuthenticationPrincipal Jwt jwt) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        return jdbc.query("""
            SELECT r.id, r.status, r.requested_for, r.subtotal, r.currency_id, c.code AS currency_code,
                   r.payment_preference, r.invoice_requested, r.invoice_name, r.invoice_tax_id
            FROM wok.order_requests r JOIN wok.currencies c ON c.id = r.currency_id
            WHERE r.customer_user_id = ? AND r.fulfillment_type = 'PICKUP'
            ORDER BY r.created_at DESC, r.id DESC LIMIT 50
            """, ClientPickupRequestController::receiptFromJoinedCurrency, customerId);
    }

    @GetMapping("/{requestId}")
    public PickupRequestDetails details(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        List<PickupRequestDetails> found = jdbc.query("""
            SELECT r.id, r.status, r.requested_for, r.subtotal, r.currency_id, c.code AS currency_code,
                   r.customer_note, r.payment_preference, r.invoice_requested, r.invoice_name, r.invoice_tax_id
            FROM wok.order_requests r JOIN wok.currencies c ON c.id = r.currency_id
            WHERE r.id = ? AND r.customer_user_id = ? AND r.fulfillment_type = 'PICKUP'
            """, (rs, row) -> new PickupRequestDetails(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
                rs.getString("customer_note"), rs.getString("payment_preference"), rs.getBoolean("invoice_requested"),
                rs.getString("invoice_name"), rs.getString("invoice_tax_id"), List.of()), requestId, customerId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos esa solicitud.");
        List<PickupRequestLine> items = jdbc.query("""
            SELECT name_snapshot, quantity, unit_price, line_total, currency_id
            FROM wok.order_request_items WHERE order_request_id = ? ORDER BY created_at, id
            """, (rs, row) -> new PickupRequestLine(rs.getString("name_snapshot"), rs.getInt("quantity"),
                rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"), rs.getObject("currency_id", UUID.class)), requestId);
        PickupRequestDetails request = found.getFirst();
        return new PickupRequestDetails(request.requestId(), request.status(), request.requestedFor(),
                request.subtotal(), request.currencyId(), request.currency(), request.customerNote(),
                request.paymentPreference(), request.invoiceRequested(), request.invoiceName(), request.invoiceTaxId(), items);
    }

    @DeleteMapping("/{requestId}")
    @Transactional
    public OrderRequestState cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        List<String> statuses = jdbc.query("""
            SELECT status FROM wok.order_requests
            WHERE id = ? AND customer_user_id = ? FOR UPDATE
            """, (rs, row) -> rs.getString("status"), requestId, customerId);
        if (statuses.isEmpty()) throw new AuthException(404, "No encontramos esa solicitud.");
        String status = statuses.getFirst();
        if ("CANCELLED".equals(status)) return new OrderRequestState(requestId, status);
        if (!"PENDING_REVIEW".equals(status))
            throw new AuthException(409, "La solicitud ya no se puede cancelar.");
        int changed = jdbc.update("""
            UPDATE wok.order_requests SET status = 'CANCELLED', decided_by = ?, decided_at = now(),
                decision_reason = 'CANCELLED_BY_CLIENT', updated_at = now()
            WHERE id = ? AND customer_user_id = ? AND status = 'PENDING_REVIEW'
            """, customerId, requestId, customerId);
        if (changed != 1) throw new AuthException(409, "La solicitud ya cambió de estado.");
        jdbc.update("""
            INSERT INTO wok.order_request_events(order_request_id, event_type, actor_user_id, reason)
            VALUES (?, 'CANCELLED', ?, 'CANCELLED_BY_CLIENT')
            """, requestId, customerId);
        return new OrderRequestState(requestId, "CANCELLED");
    }

    private List<Product> loadProducts(List<RequestedItem> lines) {
        List<Product> products = new ArrayList<>();
        for (RequestedItem line : lines) {
            List<Product> matches = jdbc.query("""
                SELECT mi.id, mi.name, mi.price, mi.currency_id, c.code AS currency_code,
                       mi.estimated_preparation_seconds
                FROM wok.menu_items mi JOIN wok.items i ON i.id = mi.item_id
                JOIN wok.menu_categories category ON category.id = mi.category_id AND category.active = true
                JOIN wok.preparation_areas area ON area.id = mi.preparation_area_id AND area.active = true
                JOIN wok.currencies c ON c.id = mi.currency_id
                WHERE mi.id = ? AND mi.status = 'ACTIVE' AND mi.visibility = 'PUBLIC' AND i.active = true
                """, PRODUCT_MAPPER, line.menuItemId());
            if (matches.isEmpty()) return List.of();
            products.add(matches.getFirst());
        }
        return products;
    }

    private List<RequestedItem> normalizedLines(List<RequestedItem> items) {
        if (items == null || items.isEmpty() || items.size() > 20) throw new AuthException(400, "Revisa los productos enviados.");
        if (items.stream().map(RequestedItem::menuItemId).anyMatch(id -> id == null)
                || new HashSet<>(items.stream().map(RequestedItem::menuItemId).toList()).size() != items.size())
            throw new AuthException(400, "Cada producto debe aparecer una sola vez.");
        return items.stream().sorted(Comparator.comparing(item -> item.menuItemId().toString())).toList();
    }

    private String fingerprint(Instant requestedFor, String note, String paymentPreference, InvoiceRequest invoice,
                               List<RequestedItem> lines) {
        String canonical = requestedFor.toString() + "\n" + (note == null ? "" : note) + "\n";
        if (paymentPreference != null || invoice.requested())
            canonical += (paymentPreference == null ? "" : paymentPreference) + "\n" + invoice.requested() + "\n"
                    + (invoice.name() == null ? "" : invoice.name()) + "\n"
                    + (invoice.taxId() == null ? "" : invoice.taxId()) + "\n";
        canonical += lines.stream().map(line -> line.menuItemId() + ":" + line.quantity())
                .reduce((a, b) -> a + "\n" + b).orElse("");
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private PickupRequestReceipt existing(UUID customerId, UUID idempotencyKey, String fingerprint, boolean replay) {
        List<PickupRequestReceipt> found = jdbc.query("""
            SELECT r.id, r.status, r.requested_for, r.subtotal, r.currency_id, c.code AS currency_code,
                   r.payment_preference, r.invoice_requested, r.invoice_name, r.invoice_tax_id, r.request_fingerprint
            FROM wok.order_requests r JOIN wok.currencies c ON c.id = r.currency_id
            WHERE r.customer_user_id = ? AND r.idempotency_key = ?
            """, (rs, row) -> {
                if (!fingerprint.equals(rs.getString("request_fingerprint")))
                    throw new AuthException(409, "La clave de solicitud ya se usó con otros datos.");
                return new PickupRequestReceipt(rs.getObject("id", UUID.class), rs.getString("status"),
                        rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                        rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
                        rs.getString("payment_preference"), rs.getBoolean("invoice_requested"),
                        rs.getString("invoice_name"), rs.getString("invoice_tax_id"), replay,
                        "Recibimos tu solicitud. El equipo debe confirmar disponibilidad y horario antes de aceptarla.");
            }, customerId, idempotencyKey);
        return found.isEmpty() ? null : found.getFirst();
    }

    private static PickupRequestReceipt receiptFromJoinedCurrency(ResultSet rs, int row) throws SQLException {
        return new PickupRequestReceipt(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
                rs.getString("payment_preference"), rs.getBoolean("invoice_requested"),
                rs.getString("invoice_name"), rs.getString("invoice_tax_id"), false,
                "El equipo debe confirmar disponibilidad y horario antes de aceptar la solicitud.");
    }

    private InvoiceRequest invoiceRequest(Boolean requested, String rawName, String rawTaxId) {
        boolean invoiceRequested = Boolean.TRUE.equals(requested);
        String name = rawName == null || rawName.isBlank() ? null : rawName.trim();
        String taxId = rawTaxId == null || rawTaxId.isBlank() ? null : rawTaxId.trim();
        if (!invoiceRequested && (name != null || taxId != null))
            throw new AuthException(400, "Indica si necesitas factura antes de enviar los datos fiscales.");
        if (invoiceRequested && (name == null || taxId == null))
            throw new AuthException(400, "Completa el nombre o razón social y el NIT para solicitar factura.");
        return new InvoiceRequest(invoiceRequested, name, taxId);
    }

    public record PickupRequest(@NotNull Instant requestedFor, @Size(max = 500) String customerNote,
            PaymentPreference paymentPreference, Boolean invoiceRequested,
            @Size(max = 150) String invoiceName, @Size(max = 32) String invoiceTaxId,
            @NotEmpty @Size(max = 20) List<@Valid RequestedItem> items) {
        public PickupRequest(Instant requestedFor, String customerNote, List<RequestedItem> items) {
            this(requestedFor, customerNote, null, null, null, null, items);
        }
    }
    public enum PaymentPreference { CASH_AT_PICKUP, CARD_AT_PICKUP, TRANSFER_AT_PICKUP }
    private record InvoiceRequest(boolean requested, String name, String taxId) {}
    public record RequestedItem(@NotNull UUID menuItemId, @Positive int quantity) {}
    public record PickupRequestReceipt(UUID requestId, String status, Instant requestedFor, BigDecimal subtotal,
            UUID currencyId, String currency, String paymentPreference, boolean invoiceRequested,
            String invoiceName, String invoiceTaxId, boolean idempotentReplay, String message) {}
    public record OrderRequestState(UUID requestId, String status) {}
    public record PickupRequestDetails(UUID requestId, String status, Instant requestedFor, BigDecimal subtotal,
            UUID currencyId, String currency, String customerNote, String paymentPreference, boolean invoiceRequested,
            String invoiceName, String invoiceTaxId, List<PickupRequestLine> items) {}
    public record PickupRequestLine(String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal, UUID currencyId) {}
    private record Product(UUID id, String name, BigDecimal price, UUID currencyId, String currencyCode,
            int preparationSeconds) {}
}
