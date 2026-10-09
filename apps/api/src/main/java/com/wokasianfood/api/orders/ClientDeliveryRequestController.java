package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.catalog.ModifierSelectionService.SelectedModifier;
import com.wokasianfood.api.service.ServiceHoursPolicy;
import com.wokasianfood.api.platform.GuatemalaPhone;
import com.wokasianfood.api.platform.RequestLimits;
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
import org.springframework.beans.factory.annotation.Autowired;
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
@RequestMapping("/api/v1/client/delivery-requests")
@PreAuthorize("hasRole('CLIENT')")
public class ClientDeliveryRequestController {
    private static final RowMapper<Product> PRODUCT_MAPPER = (rs, row) -> new Product(
            rs.getObject("id", UUID.class), rs.getString("name"), rs.getBigDecimal("price"),
            rs.getObject("currency_id", UUID.class), rs.getString("currency_code"),
            rs.getInt("estimated_preparation_seconds"));
    private final JdbcTemplate jdbc;
    private final ModifierSelectionService modifiers;
    private final ServiceHoursPolicy serviceHours;
    private final OrderQuoteService quotes;
    private final OrderCapacityHoldService capacityHolds;

    @Autowired
    public ClientDeliveryRequestController(JdbcTemplate jdbc, ModifierSelectionService modifiers, OrderQuoteService quotes,
            OrderCapacityHoldService capacityHolds) {
        this.jdbc = jdbc; this.modifiers = modifiers; this.serviceHours = new ServiceHoursPolicy(jdbc);
        this.quotes = quotes; this.capacityHolds = capacityHolds;
    }

    ClientDeliveryRequestController(JdbcTemplate jdbc, ModifierSelectionService modifiers, OrderQuoteService quotes) {
        this(jdbc, modifiers, quotes, new OrderCapacityHoldService(jdbc, 12));
    }

    ClientDeliveryRequestController(JdbcTemplate jdbc, ModifierSelectionService modifiers) {
        this(jdbc, modifiers, new OrderQuoteService(jdbc));
    }

    ClientDeliveryRequestController(JdbcTemplate jdbc) {
        this(jdbc, new ModifierSelectionService(jdbc), new OrderQuoteService(jdbc));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    public DeliveryRequestReceipt submit(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Order-Quote-Id", required = false) UUID quoteId,
            @Valid @RequestBody DeliveryRequest request) {
        UUID userId = UUID.fromString(jwt.getSubject());
        String address = request.address().trim();
        String phone = request.contactPhone().trim();
        String reference = request.reference() == null || request.reference().isBlank() ? null : request.reference().trim();
        String note = request.customerNote() == null || request.customerNote().isBlank() ? null : request.customerNote().trim();
        InvoiceRequest invoice = invoiceRequest(request.invoiceRequested(), request.invoiceName(), request.invoiceTaxId());
        List<RequestedItem> lines = normalize(request.items());
        String fingerprint = fingerprint(request, address, reference, phone, note, lines);
        DeliveryRequestReceipt previous = existing(userId, idempotencyKey, fingerprint);
        if (previous != null) return previous;

        List<String> serviceStatuses = jdbc.query("""
            SELECT status FROM wok.service_capabilities
            WHERE code = 'DELIVERY' AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
            ORDER BY effective_from DESC, id DESC LIMIT 1 FOR SHARE
            """, (rs, row) -> rs.getString("status"));
        if (serviceStatuses.isEmpty() || "PAUSED".equals(serviceStatuses.getFirst()) || "DISABLED".equals(serviceStatuses.getFirst()))
            throw new AuthException(503, "La solicitud delivery está temporalmente indisponible.");

        List<List<SelectedModifier>> selections = lines.stream()
                .map(line -> modifiers.validate(line.menuItemId(), line.modifierIds())).toList();

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
            subtotal = subtotal.add(effectivePrice(product.price, selections.get(index)).multiply(BigDecimal.valueOf(quantity)));
        }
        if (preparationSeconds > 86_400 || !request.requestedFor().isAfter(Instant.now().plusSeconds(preparationSeconds)))
            throw new AuthException(422, "El horario solicitado es anterior al tiempo mínimo de preparación.");
        serviceHours.requireSlot("DELIVERY", request.requestedFor(), false);

        List<UUID> created = jdbc.query("""
            INSERT INTO wok.order_requests
              (customer_user_id, fulfillment_type, idempotency_key, request_fingerprint, requested_for,
               customer_note, subtotal, currency_id, delivery_address, delivery_reference, contact_phone,
               payment_preference, invoice_requested, invoice_name, invoice_tax_id)
            VALUES (?, 'DELIVERY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (customer_user_id, idempotency_key) DO NOTHING RETURNING id
            """, (rs, row) -> rs.getObject(1, UUID.class), userId, idempotencyKey, fingerprint,
                Timestamp.from(request.requestedFor()), note, subtotal, currencyId, address, reference, phone,
                request.paymentPreference().name(), invoice.requested(), invoice.name(), invoice.taxId());
        if (created.isEmpty()) {
            previous = existing(userId, idempotencyKey, fingerprint);
            if (previous != null) return previous;
            throw new AuthException(409, "No se pudo recuperar la solicitud idempotente.");
        }
        UUID requestId = created.getFirst();
        if (quoteId != null) quotes.consume(userId, quoteId, ClientOrderQuoteController.FulfillmentType.DELIVERY,
                request.requestedFor(), lines.stream().map(line -> new ClientOrderQuoteController.QuoteLineRequest(
                        line.menuItemId(), line.quantity(), line.modifierIds())).toList(), subtotal, currencyId, requestId);
        for (int index = 0; index < products.size(); index++) {
            Product product = products.get(index);
            UUID requestItemId = jdbc.query("""
                INSERT INTO wok.order_request_items
                  (order_request_id, menu_item_id, name_snapshot, quantity, unit_price, currency_id)
                VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                """, (rs, row) -> rs.getObject(1, UUID.class), requestId, product.id, product.name,
                    lines.get(index).quantity(), effectivePrice(product.price, selections.get(index)), product.currencyId).getFirst();
            saveRequestModifiers(requestItemId, selections.get(index));
        }
        jdbc.update("""
            INSERT INTO wok.order_request_events(order_request_id, event_type, actor_user_id)
            VALUES (?, 'SUBMITTED', ?)
            """, requestId, userId);
        return new DeliveryRequestReceipt(requestId, "DELIVERY", "PENDING_REVIEW", request.requestedFor(),
                subtotal, currency, request.paymentPreference(), invoice.requested(), invoice.name(), invoice.taxId(), false,
                null,
                "Recibimos la solicitud delivery. El equipo debe confirmar cobertura, disponibilidad y horario; todavía no es un pedido ni un pago.",
                null, null, null, null, null, null, null);
    }

    DeliveryRequestReceipt submit(Jwt jwt, UUID idempotencyKey, DeliveryRequest request) {
        return submit(jwt, idempotencyKey, null, request);
    }

    @GetMapping
    public List<DeliveryRequestReceipt> history(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = UUID.fromString(jwt.getSubject());
        return jdbc.query("""
            SELECT r.id, r.status, r.requested_for, r.subtotal, c.code AS currency_code, r.payment_preference,
                   r.invoice_requested, r.invoice_name, r.invoice_tax_id, r.decision_reason,
                   o.code AS order_code, o.status AS order_status,
                   eta.estimated_ready_at, d.status AS dispatch_status, d.assigned_at, d.dispatched_at, d.delivered_at
            FROM wok.order_requests r JOIN wok.currencies c ON c.id = r.currency_id
            LEFT JOIN wok.orders o ON o.id = r.order_id
            LEFT JOIN wok.delivery_dispatches d ON d.order_id = o.id
            LEFT JOIN LATERAL (
                SELECT max(t.estimated_ready_at) AS estimated_ready_at
                FROM wok.kitchen_tickets t
                WHERE t.order_id = o.id AND t.status IN ('QUEUED', 'PREPARING', 'RECALLED')
            ) eta ON true
            WHERE r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY'
            ORDER BY r.created_at DESC, r.id DESC LIMIT 50
            """, (rs, row) -> new DeliveryRequestReceipt(rs.getObject("id", UUID.class), "DELIVERY",
                rs.getString("status"), rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                rs.getString("currency_code"), PaymentPreference.valueOf(rs.getString("payment_preference")),
                rs.getBoolean("invoice_requested"), rs.getString("invoice_name"), rs.getString("invoice_tax_id"), false,
                rs.getString("decision_reason"), "El equipo debe confirmar cobertura, disponibilidad y horario.", rs.getString("order_code"),
                rs.getString("order_status"), rs.getTimestamp("estimated_ready_at") == null ? null
                    : rs.getTimestamp("estimated_ready_at").toInstant(), rs.getString("dispatch_status"),
                instant(rs, "assigned_at"), instant(rs, "dispatched_at"), instant(rs, "delivered_at")), userId);
    }

    @GetMapping("/{requestId}")
    public DeliveryRequestDetails details(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
        UUID userId = UUID.fromString(jwt.getSubject());
        List<DeliveryRequestDetails> found = jdbc.query("""
            SELECT r.id, r.status, r.requested_for, r.subtotal, c.code AS currency_code,
                   r.payment_preference, r.customer_note, r.invoice_requested, r.invoice_name, r.invoice_tax_id
            FROM wok.order_requests r JOIN wok.currencies c ON c.id = r.currency_id
            WHERE r.id = ? AND r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY'
            """, (rs, row) -> new DeliveryRequestDetails(rs.getObject("id", UUID.class), "DELIVERY",
                rs.getString("status"), rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                rs.getString("currency_code"), PaymentPreference.valueOf(rs.getString("payment_preference")),
                rs.getString("customer_note"), rs.getBoolean("invoice_requested"), rs.getString("invoice_name"),
                rs.getString("invoice_tax_id"), List.of()), requestId, userId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos esa solicitud.");
        List<PersistedRequestLine> storedItems = jdbc.query("""
            SELECT id, name_snapshot, quantity, unit_price, line_total
            FROM wok.order_request_items WHERE order_request_id = ? ORDER BY created_at, id
            """, (rs, row) -> new PersistedRequestLine(rs.getObject("id", UUID.class), rs.getString("name_snapshot"),
                rs.getInt("quantity"), rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total")), requestId);
        List<DeliveryRequestLine> items = storedItems.stream().map(item -> new DeliveryRequestLine(item.name(),
                item.quantity(), item.unitPrice(), item.lineTotal(), requestModifiers(item.id()))).toList();
        DeliveryRequestDetails request = found.getFirst();
        return new DeliveryRequestDetails(request.requestId(), request.fulfillmentType(), request.status(),
                request.requestedFor(), request.subtotal(), request.currency(), request.paymentPreference(),
                request.customerNote(), request.invoiceRequested(), request.invoiceName(), request.invoiceTaxId(), items);
    }

    @DeleteMapping("/{requestId}")
    @Transactional
    public DeliveryCancellationReceipt cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        List<String> statuses = jdbc.query("""
            SELECT status FROM wok.order_requests
            WHERE id = ? AND customer_user_id = ? AND fulfillment_type = 'DELIVERY' FOR UPDATE
            """, (rs, row) -> rs.getString("status"), requestId, customerId);
        if (statuses.isEmpty()) throw new AuthException(404, "No encontramos esa solicitud delivery.");
        String status = statuses.getFirst();
        if ("CANCELLED".equals(status)) return new DeliveryCancellationReceipt(requestId, status);
        if (!"PENDING_REVIEW".equals(status))
            throw new AuthException(409, "La solicitud delivery ya no se puede cancelar.");

        int changed = jdbc.update("""
            UPDATE wok.order_requests SET status = 'CANCELLED', decided_by = ?, decided_at = now(),
                decision_reason = 'CANCELLED_BY_CLIENT', updated_at = now()
            WHERE id = ? AND customer_user_id = ? AND fulfillment_type = 'DELIVERY' AND status = 'PENDING_REVIEW'
            """, customerId, requestId, customerId);
        if (changed != 1) throw new AuthException(409, "La solicitud delivery ya cambió de estado.");
        capacityHolds.finish(requestId, OrderCapacityHoldService.EndState.RELEASED);
        jdbc.update("""
            INSERT INTO wok.order_request_events(order_request_id, event_type, actor_user_id, reason)
            VALUES (?, 'CANCELLED', ?, 'CANCELLED_BY_CLIENT')
            """, requestId, customerId);
        return new DeliveryCancellationReceipt(requestId, "CANCELLED");
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
        if (items == null || items.isEmpty() || items.size() > RequestLimits.MAX_DISTINCT_MENU_LINES)
            throw new AuthException(400, "Revisa los productos enviados.");
        if (items.stream().map(RequestedItem::menuItemId).anyMatch(id -> id == null)
                || new HashSet<>(items.stream().map(RequestedItem::menuItemId).toList()).size() != items.size())
            throw new AuthException(400, "Cada producto debe aparecer una sola vez.");
        return items.stream().map(item -> new RequestedItem(item.menuItemId(), item.quantity(),
                item.modifierIds() == null ? List.of() : item.modifierIds().stream().sorted().toList()))
                .sorted(Comparator.comparing(item -> item.menuItemId().toString())).toList();
    }

    private BigDecimal effectivePrice(BigDecimal basePrice, List<SelectedModifier> selected) {
        return selected.stream().map(SelectedModifier::priceDelta).reduce(basePrice, BigDecimal::add);
    }

    private void saveRequestModifiers(UUID requestItemId, List<SelectedModifier> selected) {
        for (SelectedModifier modifier : selected) jdbc.update("""
            INSERT INTO wok.order_request_item_modifiers
                (order_request_item_id, modifier_id, group_name_snapshot, modifier_name_snapshot, price_delta)
            VALUES (?, ?, ?, ?, ?)
            """, requestItemId, modifier.id(), modifier.groupName(), modifier.name(), modifier.priceDelta());
    }

    private List<ModifierSnapshot> requestModifiers(UUID requestItemId) {
        return jdbc.query("""
            SELECT group_name_snapshot, modifier_name_snapshot, price_delta
            FROM wok.order_request_item_modifiers WHERE order_request_item_id = ?
            ORDER BY group_name_snapshot, modifier_name_snapshot, modifier_id
            """, (rs, row) -> new ModifierSnapshot(rs.getString("group_name_snapshot"),
                rs.getString("modifier_name_snapshot"), rs.getBigDecimal("price_delta")), requestItemId);
    }

    private String fingerprint(DeliveryRequest request, String address, String reference, String phone, String note,
            List<RequestedItem> lines) {
        String canonical = request.requestedFor() + "\n" + address + "\n" + (reference == null ? "" : reference)
                + "\n" + phone + "\n" + request.paymentPreference() + "\n" + (note == null ? "" : note) + "\n"
                + (Boolean.TRUE.equals(request.invoiceRequested())
                    ? "true\n" + clean(request.invoiceName()) + "\n" + clean(request.invoiceTaxId()) + "\n" : "")
                + lines.stream().map(line -> {
                    String selected = line.modifierIds().stream().map(UUID::toString).sorted()
                            .reduce((a, b) -> a + "," + b).orElse("");
                    return line.menuItemId() + ":" + line.quantity() + ":" + selected;
                }).reduce((a, b) -> a + "\n" + b).orElse("");
        try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private DeliveryRequestReceipt existing(UUID userId, UUID key, String fingerprint) {
        List<DeliveryRequestReceipt> found = jdbc.query("""
            SELECT r.id, r.status, r.requested_for, r.subtotal, c.code AS currency_code, r.payment_preference,
                   r.invoice_requested, r.invoice_name, r.invoice_tax_id, r.decision_reason, r.request_fingerprint,
                   o.code AS order_code, o.status AS order_status, eta.estimated_ready_at,
                   d.status AS dispatch_status, d.assigned_at, d.dispatched_at, d.delivered_at
            FROM wok.order_requests r JOIN wok.currencies c ON c.id = r.currency_id
            LEFT JOIN wok.orders o ON o.id = r.order_id
            LEFT JOIN wok.delivery_dispatches d ON d.order_id = o.id
            LEFT JOIN LATERAL (
                SELECT max(t.estimated_ready_at) AS estimated_ready_at
                FROM wok.kitchen_tickets t
                WHERE t.order_id = o.id AND t.status IN ('QUEUED', 'PREPARING', 'RECALLED')
            ) eta ON true
            WHERE r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY' AND r.idempotency_key = ?
            """, (rs, row) -> {
                if (!fingerprint.equals(rs.getString("request_fingerprint")))
                    throw new AuthException(409, "La clave de solicitud ya se usó con otros datos.");
                return new DeliveryRequestReceipt(rs.getObject("id", UUID.class), "DELIVERY", rs.getString("status"),
                        rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"),
                        rs.getString("currency_code"), PaymentPreference.valueOf(rs.getString("payment_preference")),
                        rs.getBoolean("invoice_requested"), rs.getString("invoice_name"), rs.getString("invoice_tax_id"), true,
                        rs.getString("decision_reason"), "Recibimos la solicitud delivery. El equipo debe confirmar cobertura y disponibilidad.",
                        rs.getString("order_code"), rs.getString("order_status"),
                        rs.getTimestamp("estimated_ready_at") == null ? null : rs.getTimestamp("estimated_ready_at").toInstant(),
                        rs.getString("dispatch_status"), instant(rs, "assigned_at"), instant(rs, "dispatched_at"),
                        instant(rs, "delivered_at"));
            }, userId, key);
        return found.isEmpty() ? null : found.getFirst();
    }

    private InvoiceRequest invoiceRequest(Boolean requested, String rawName, String rawTaxId) {
        boolean invoiceRequested = Boolean.TRUE.equals(requested);
        String name = clean(rawName);
        String taxId = clean(rawTaxId);
        if (!invoiceRequested && (name != null || taxId != null))
            throw new AuthException(400, "Indica si necesitas factura antes de enviar los datos fiscales.");
        if (invoiceRequested && (name == null || taxId == null))
            throw new AuthException(400, "Completa el nombre o razón social y el NIT para solicitar factura.");
        return new InvoiceRequest(invoiceRequested, name, taxId);
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private Instant instant(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    public record DeliveryRequest(@NotNull Instant requestedFor, @Size(max = 500) String customerNote,
            @NotBlank @Size(min = 5, max = 500) String address, @Size(max = 300) String reference,
            @NotBlank @Pattern(regexp = "^" + GuatemalaPhone.PATTERN + "$") String contactPhone,
            @NotNull PaymentPreference paymentPreference,
            Boolean invoiceRequested, @Size(max = 150) String invoiceName, @Size(max = 32) String invoiceTaxId,
            @NotEmpty @Size(max = RequestLimits.MAX_DISTINCT_MENU_LINES) List<@Valid RequestedItem> items) {
        public DeliveryRequest(Instant requestedFor, String customerNote, String address, String reference,
                String contactPhone, PaymentPreference paymentPreference, List<RequestedItem> items) {
            this(requestedFor, customerNote, address, reference, contactPhone, paymentPreference, null, null, null, items);
        }
    }
    public record RequestedItem(@NotNull UUID menuItemId, @Positive int quantity,
                                @Size(max = 30) List<@NotNull UUID> modifierIds) {
        public RequestedItem { modifierIds = modifierIds == null ? List.of()
                : java.util.Collections.unmodifiableList(new ArrayList<>(modifierIds)); }
        public RequestedItem(UUID menuItemId, int quantity) { this(menuItemId, quantity, List.of()); }
    }
    public record DeliveryRequestReceipt(UUID requestId, String fulfillmentType, String status, Instant requestedFor,
            BigDecimal subtotal, String currency, PaymentPreference paymentPreference, boolean invoiceRequested,
            String invoiceName, String invoiceTaxId, boolean idempotentReplay, String decisionReason, String message,
            String orderCode, String orderStatus, Instant estimatedReadyAt, String dispatchStatus,
            Instant assignedAt, Instant dispatchedAt, Instant deliveredAt) {}
    public record DeliveryRequestDetails(UUID requestId, String fulfillmentType, String status, Instant requestedFor,
            BigDecimal subtotal, String currency, PaymentPreference paymentPreference, String customerNote,
            boolean invoiceRequested, String invoiceName, String invoiceTaxId,
            List<DeliveryRequestLine> items) {}
    public record DeliveryRequestLine(String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                                      List<ModifierSnapshot> modifiers) {}
    public record ModifierSnapshot(String group, String name, BigDecimal priceDelta) {}
    private record PersistedRequestLine(UUID id, String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal) {}
    public record DeliveryCancellationReceipt(UUID requestId, String status) {}
    public enum PaymentPreference { CASH_ON_DELIVERY, TRANSFER_IN_ADVANCE, ONLINE_PAYMENT_REQUESTED }
    private record InvoiceRequest(boolean requested, String name, String taxId) {}
    private record Product(UUID id, String name, BigDecimal price, UUID currencyId, String currency, int preparationSeconds) {}
}
