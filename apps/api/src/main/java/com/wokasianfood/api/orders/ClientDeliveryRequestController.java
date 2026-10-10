package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/client/delivery-requests")
@PreAuthorize("hasRole('CLIENT')")
public class ClientDeliveryRequestController {
    private static final RowMapper<Product> PRODUCT_MAPPER = (rs, row) -> new Product(
            rs.getObject("id", UUID.class), rs.getString("name"), rs.getBigDecimal("price"),
            rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
            rs.getInt("estimated_preparation_seconds"));
    private final JdbcTemplate jdbc;

    public ClientDeliveryRequestController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    public DeliveryRequestReceipt submit(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey, @Valid @RequestBody DeliveryRequest request) {
        UUID userId = UUID.fromString(jwt.getSubject());
        String address = request.address().trim();
        String phone = request.contactPhone().trim();
        String reference = request.reference() == null || request.reference().isBlank() ? null : request.reference().trim();
        String note = request.customerNote() == null || request.customerNote().isBlank() ? null : request.customerNote().trim();
        List<RequestedItem> lines = normalize(request.items());
        String fingerprint = fingerprint(request, address, reference, phone, note, lines);
        DeliveryRequestReceipt previous = existing(userId, idempotencyKey, fingerprint);
        if (previous != null) return previous;

        List<String> serviceStatuses = jdbc.query("""
            SELECT status FROM wok.service_capabilities
            WHERE code = 'DELIVERY' AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
            ORDER BY effective_from DESC, id DESC LIMIT 1
            """, (rs, row) -> rs.getString("status"));
        if (serviceStatuses.isEmpty() || "PAUSED".equals(serviceStatuses.getFirst()) || "DISABLED".equals(serviceStatuses.getFirst()))
            throw new AuthException(503, "La solicitud delivery está temporalmente indisponible.");

        List<Product> products = loadProducts(lines);
        if (products.size() != lines.size()) throw new AuthException(422, "Uno o más productos ya no están publicados.");
        UUID currencyId = products.getFirst().currencyId;
        String currency = products.getFirst().currency;
        if (products.stream().anyMatch(product -> !product.currencyId.equals(currencyId)))
            throw new AuthException(422, "No se pueden mezclar monedas en una solicitud.");

        long preparationSeconds = 0;
        BigDecimal subtotal = BigDecimal.ZERO;
        for (int index = 0; index < products.size(); index++) {
            Product product = products.get(index);
            int quantity = lines.get(index).quantity();
            preparationSeconds = Math.addExact(preparationSeconds,
                    Math.multiplyExact((long) product.preparationSeconds, quantity));
            subtotal = subtotal.add(product.price.multiply(BigDecimal.valueOf(quantity)));
        }
        if (preparationSeconds > 86_400 || !request.requestedFor().isAfter(Instant.now().plusSeconds(preparationSeconds)))
            throw new AuthException(422, "El horario solicitado es anterior al tiempo mínimo de preparación.");

        List<UUID> created = jdbc.query("""
            INSERT INTO wok.order_requests
              (customer_user_id, fulfillment_type, idempotency_key, request_fingerprint, requested_for,
               customer_note, subtotal, currency_id, delivery_address, delivery_reference, contact_phone, payment_preference)
            VALUES (?, 'DELIVERY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (customer_user_id, idempotency_key) DO NOTHING RETURNING id
            """, (rs, row) -> rs.getObject(1, UUID.class), userId, idempotencyKey, fingerprint,
                Timestamp.from(request.requestedFor()), note, subtotal, currencyId, address, reference, phone,
                request.paymentPreference().name());
        if (created.isEmpty()) {
            previous = existing(userId, idempotencyKey, fingerprint);
            if (previous != null) return previous;
            throw new AuthException(409, "No se pudo recuperar la solicitud idempotente.");
        }
        UUID requestId = created.getFirst();
        for (int index = 0; index < products.size(); index++) {
            Product product = products.get(index);
            jdbc.update("""
                INSERT INTO wok.order_request_items
                  (order_request_id, menu_item_id, name_snapshot, quantity, unit_price, currency_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """, requestId, product.id, product.name, lines.get(index).quantity(), product.price, product.currencyId);
        }
        jdbc.update("""
            INSERT INTO wok.order_request_events(order_request_id, event_type, actor_user_id)
            VALUES (?, 'SUBMITTED', ?)
            """, requestId, userId);
        return new DeliveryRequestReceipt(requestId, "DELIVERY", "PENDING_REVIEW", request.requestedFor(),
                subtotal, currency, request.paymentPreference(), false,
                "Recibimos la solicitud delivery. El equipo debe confirmar cobertura, disponibilidad y horario; todavía no es un pedido ni un pago.");
    }

    @GetMapping
    public List<DeliveryRequestReceipt> history(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = UUID.fromString(jwt.getSubject());
        return jdbc.query("""
            SELECT r.id, r.status, r.requested_for, r.subtotal, c.code AS currency_code, r.payment_preference
            FROM wok.order_requests r JOIN wok.currencies c ON c.id = r.currency_id
            WHERE r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY'
            ORDER BY r.created_at DESC, r.id DESC LIMIT 50
            """, (rs, row) -> new DeliveryRequestReceipt(rs.getObject("id", UUID.class), "DELIVERY",
                rs.getString("status"), rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                rs.getString("currency_code"), PaymentPreference.valueOf(rs.getString("payment_preference")), false,
                "El equipo debe confirmar cobertura, disponibilidad y horario."), userId);
    }

    @GetMapping("/{requestId}")
    public DeliveryRequestDetails details(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
        UUID userId = UUID.fromString(jwt.getSubject());
        List<DeliveryRequestDetails> found = jdbc.query("""
            SELECT r.id, r.status, r.requested_for, r.subtotal, c.code AS currency_code,
                   r.payment_preference, r.customer_note
            FROM wok.order_requests r JOIN wok.currencies c ON c.id = r.currency_id
            WHERE r.id = ? AND r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY'
            """, (rs, row) -> new DeliveryRequestDetails(rs.getObject("id", UUID.class), "DELIVERY",
                rs.getString("status"), rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                rs.getString("currency_code"), PaymentPreference.valueOf(rs.getString("payment_preference")),
                rs.getString("customer_note"), List.of()), requestId, userId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos esa solicitud.");
        List<DeliveryRequestLine> items = jdbc.query("""
            SELECT name_snapshot, quantity, unit_price, line_total
            FROM wok.order_request_items WHERE order_request_id = ? ORDER BY created_at, id
            """, (rs, row) -> new DeliveryRequestLine(rs.getString("name_snapshot"), rs.getInt("quantity"),
                rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total")), requestId);
        DeliveryRequestDetails request = found.getFirst();
        return new DeliveryRequestDetails(request.requestId(), request.fulfillmentType(), request.status(),
                request.requestedFor(), request.subtotal(), request.currency(), request.paymentPreference(),
                request.customerNote(), items);
    }

    private List<Product> loadProducts(List<RequestedItem> lines) {
        List<Product> products = new ArrayList<>();
        for (RequestedItem line : lines) {
            List<Product> found = jdbc.query("""
                SELECT mi.id, mi.name, mi.price, mi.currency_id, c.code AS currency_code,
                       mi.estimated_preparation_seconds
                FROM wok.menu_items mi JOIN wok.items i ON i.id = mi.item_id
                JOIN wok.menu_categories category ON category.id = mi.category_id AND category.active = true
                JOIN wok.preparation_areas area ON area.id = mi.preparation_area_id AND area.active = true
                JOIN wok.currencies c ON c.id = mi.currency_id
                WHERE mi.id = ? AND mi.status = 'ACTIVE' AND mi.visibility = 'PUBLIC' AND i.active = true
                """, PRODUCT_MAPPER, line.menuItemId());
            if (found.isEmpty()) return List.of();
            products.add(found.getFirst());
        }
        return products;
    }

    private List<RequestedItem> normalize(List<RequestedItem> items) {
        if (items == null || items.isEmpty() || items.size() > 20) throw new AuthException(400, "Revisa los productos enviados.");
        if (items.stream().map(RequestedItem::menuItemId).anyMatch(id -> id == null)
                || new HashSet<>(items.stream().map(RequestedItem::menuItemId).toList()).size() != items.size())
            throw new AuthException(400, "Cada producto debe aparecer una sola vez.");
        return items.stream().sorted(Comparator.comparing(item -> item.menuItemId().toString())).toList();
    }

    private String fingerprint(DeliveryRequest request, String address, String reference, String phone, String note,
            List<RequestedItem> lines) {
        String canonical = request.requestedFor() + "\n" + address + "\n" + (reference == null ? "" : reference)
                + "\n" + phone + "\n" + request.paymentPreference() + "\n" + (note == null ? "" : note) + "\n"
                + lines.stream().map(line -> line.menuItemId() + ":" + line.quantity()).reduce((a, b) -> a + "\n" + b).orElse("");
        try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private DeliveryRequestReceipt existing(UUID userId, UUID key, String fingerprint) {
        List<DeliveryRequestReceipt> found = jdbc.query("""
            SELECT r.id, r.status, r.requested_for, r.subtotal, c.code AS currency_code, r.payment_preference, r.request_fingerprint
            FROM wok.order_requests r JOIN wok.currencies c ON c.id = r.currency_id
            WHERE r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY' AND r.idempotency_key = ?
            """, (rs, row) -> {
                if (!fingerprint.equals(rs.getString("request_fingerprint")))
                    throw new AuthException(409, "La clave de solicitud ya se usó con otros datos.");
                return new DeliveryRequestReceipt(rs.getObject("id", UUID.class), "DELIVERY", rs.getString("status"),
                        rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                        rs.getString("currency_code"), PaymentPreference.valueOf(rs.getString("payment_preference")), true,
                        "Recibimos la solicitud delivery. El equipo debe confirmar cobertura y disponibilidad.");
            }, userId, key);
        return found.isEmpty() ? null : found.getFirst();
    }

    public record DeliveryRequest(@NotNull Instant requestedFor, @Size(max = 500) String customerNote,
            @NotBlank @Size(min = 5, max = 500) String address, @Size(max = 300) String reference,
            @NotBlank @Pattern(regexp = "[0-9+() .-]{7,32}") String contactPhone,
            @NotNull PaymentPreference paymentPreference,
            @NotEmpty @Size(max = 20) List<@NotNull @Valid RequestedItem> items) {}
    public record RequestedItem(@NotNull UUID menuItemId, @Positive int quantity) {}
    public record DeliveryRequestReceipt(UUID requestId, String fulfillmentType, String status, Instant requestedFor,
            BigDecimal subtotal, String currency, PaymentPreference paymentPreference, boolean idempotentReplay, String message) {}
    public record DeliveryRequestDetails(UUID requestId, String fulfillmentType, String status, Instant requestedFor,
            BigDecimal subtotal, String currency, PaymentPreference paymentPreference, String customerNote,
            List<DeliveryRequestLine> items) {}
    public record DeliveryRequestLine(String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal) {}
    public enum PaymentPreference { CASH_ON_DELIVERY, ONLINE_PAYMENT_REQUESTED }
    private record Product(UUID id, String name, BigDecimal price, UUID currencyId, String currency, int preparationSeconds) {}
}
