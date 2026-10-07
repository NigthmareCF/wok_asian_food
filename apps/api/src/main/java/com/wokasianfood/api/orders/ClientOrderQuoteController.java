package com.wokasianfood.api.orders;

import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.catalog.ModifierSelectionService.SelectedModifier;
import com.wokasianfood.api.catalog.PublicMenuAvailabilityController;
import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.RequestLimits;
import com.wokasianfood.api.service.ServiceHoursPolicy;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Persists short-lived, server-priced quotes. A quote is an estimate and never accepts an order or payment. */
@RestController
@RequestMapping("/api/v1/client/order-quotes")
@PreAuthorize("hasRole('CLIENT')")
public class ClientOrderQuoteController {
    private static final Duration QUOTE_LIFETIME = Duration.ofMinutes(12);
    private final JdbcTemplate jdbc;
    private final ModifierSelectionService modifiers;
    private final PublicMenuAvailabilityController availability;
    private final ServiceHoursPolicy serviceHours;
    private final KitchenQueueEstimator queueEstimator;

    public ClientOrderQuoteController(JdbcTemplate jdbc, ModifierSelectionService modifiers,
            PublicMenuAvailabilityController availability, KitchenQueueEstimator queueEstimator) {
        this.jdbc = jdbc;
        this.modifiers = modifiers;
        this.availability = availability;
        this.queueEstimator = queueEstimator;
        this.serviceHours = new ServiceHoursPolicy(jdbc);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public QuoteReceipt create(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @Valid @RequestBody QuoteRequest request) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        List<QuoteLineRequest> lines = normalize(request.items());
        String fingerprint = fingerprint(request.fulfillmentType(), request.requestedFor(), lines);
        List<QuoteHeader> previous = jdbc.query("""
                SELECT id, request_fingerprint, status, expires_at
                FROM wok.order_quotes WHERE customer_user_id = ? AND idempotency_key = ? FOR UPDATE
                """, (rs, row) -> new QuoteHeader(rs.getObject("id", UUID.class),
                rs.getString("request_fingerprint"), rs.getString("status"), rs.getTimestamp("expires_at").toInstant()),
                customerId, idempotencyKey);
        if (!previous.isEmpty()) {
            QuoteHeader existing = previous.getFirst();
            if (!existing.fingerprint().equals(fingerprint))
                throw new AuthException(409, "La clave de cotización ya se usó con otros datos.");
            expireIfNecessary(existing);
            return getQuote(customerId, existing.id());
        }

        String serviceCode = request.fulfillmentType().name();
        List<String> states = jdbc.query("""
                SELECT status FROM wok.service_capabilities
                WHERE code = ? AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now())
                ORDER BY effective_from DESC, id DESC LIMIT 1 FOR SHARE
                """, (rs, row) -> rs.getString("status"), serviceCode);
        if (states.isEmpty() || "PAUSED".equals(states.getFirst()) || "DISABLED".equals(states.getFirst()))
            throw new AuthException(503, "La cotización de este servicio está temporalmente indisponible.");

        List<List<SelectedModifier>> selections = lines.stream()
                .map(line -> modifiers.validate(line.menuItemId(), line.modifierIds())).toList();
        List<Product> products = loadProducts(lines);
        if (products.size() != lines.size()) throw new AuthException(422, "Uno o más productos ya no están publicados.");
        UUID currencyId = products.getFirst().currencyId();
        String currency = products.getFirst().currency();
        if (products.stream().anyMatch(product -> !product.currencyId().equals(currencyId)))
            throw new AuthException(422, "No se pueden mezclar monedas en una cotización.");

        Map<UUID, Long> preparationByStation = new HashMap<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        for (int index = 0; index < lines.size(); index++) {
            QuoteLineRequest line = lines.get(index);
            Product product = products.get(index);
            preparationByStation.merge(product.stationId(),
                    Math.multiplyExact((long) product.preparationSeconds(), line.quantity()), Math::addExact);
            subtotal = subtotal.add(effectivePrice(product.price(), selections.get(index))
                    .multiply(BigDecimal.valueOf(line.quantity())));
        }
        KitchenQueueEstimator.Estimate queue = queueEstimator.estimate(preparationByStation, true);
        long preparationSeconds = queue.stations().stream().mapToLong(KitchenQueueEstimator.StationEstimate::preparationSeconds).max().orElse(0);
        long queueDelaySeconds = queue.stations().stream().mapToLong(KitchenQueueEstimator.StationEstimate::queueDelaySeconds).max().orElse(0);
        long totalEtaSeconds = queue.overallReadySeconds();
        if (totalEtaSeconds > Duration.ofHours(24).toSeconds()
                || !request.requestedFor().isAfter(Instant.now().plusSeconds(totalEtaSeconds)))
            throw new AuthException(422, "El horario solicitado es anterior al tiempo mínimo de preparación.");
        serviceHours.requireSlot(serviceCode, request.requestedFor(), false);

        PublicMenuAvailabilityController.AvailabilityEstimate estimate = availability.estimate(
                new PublicMenuAvailabilityController.AvailabilityRequest(lines.stream()
                        .map(line -> new PublicMenuAvailabilityController.AvailabilityLine(
                                line.menuItemId(), line.quantity(), line.modifierIds())).toList()));
        if (Boolean.FALSE.equals(estimate.availableEstimate()))
            throw new AuthException(409, "El inventario estimado cambió. Actualiza el carrito antes de continuar.");

        Instant expiresAt = Instant.now().plus(QUOTE_LIFETIME);
        List<UUID> inserted = jdbc.query("""
                INSERT INTO wok.order_quotes
                    (customer_user_id, fulfillment_type, idempotency_key, request_fingerprint,
                     requested_for, subtotal, currency_id, preparation_seconds, queue_delay_seconds, total_eta_seconds, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (customer_user_id, idempotency_key) DO NOTHING
                RETURNING id
                """, (rs, row) -> rs.getObject(1, UUID.class), customerId, serviceCode,
                idempotencyKey, fingerprint, Timestamp.from(request.requestedFor()), subtotal, currencyId,
                preparationSeconds, queueDelaySeconds, totalEtaSeconds, Timestamp.from(expiresAt));
        if (inserted.isEmpty()) {
            List<QuoteHeader> raced = jdbc.query("""
                    SELECT id, request_fingerprint, status, expires_at FROM wok.order_quotes
                    WHERE customer_user_id = ? AND idempotency_key = ? FOR UPDATE
                    """, (rs, row) -> new QuoteHeader(rs.getObject("id", UUID.class),
                    rs.getString("request_fingerprint"), rs.getString("status"),
                    rs.getTimestamp("expires_at").toInstant()), customerId, idempotencyKey);
            if (raced.isEmpty() || !raced.getFirst().fingerprint().equals(fingerprint))
                throw new AuthException(409, "La clave de cotización ya se usó con otros datos.");
            return getQuote(customerId, raced.getFirst().id());
        }
        UUID quoteId = inserted.getFirst();
        for (int index = 0; index < lines.size(); index++) {
            QuoteLineRequest line = lines.get(index);
            Product product = products.get(index);
            List<SelectedModifier> selected = selections.get(index);
            BigDecimal unitPrice = effectivePrice(product.price(), selected);
            UUID quoteItemId = jdbc.queryForObject("""
                    INSERT INTO wok.order_quote_items
                        (order_quote_id, menu_item_id, name_snapshot, quantity, unit_price)
                    VALUES (?, ?, ?, ?, ?) RETURNING id
                    """, UUID.class, quoteId, product.id(), product.name(), line.quantity(), unitPrice);
            for (SelectedModifier modifier : selected) jdbc.update("""
                    INSERT INTO wok.order_quote_item_modifiers
                        (order_quote_item_id, modifier_id, group_name_snapshot, modifier_name_snapshot, price_delta)
                    VALUES (?, ?, ?, ?, ?)
                    """, quoteItemId, modifier.id(), modifier.groupName(), modifier.name(), modifier.priceDelta());
        }
        return getQuote(customerId, quoteId);
    }

    @GetMapping("/{quoteId}")
    @Transactional
    public QuoteReceipt get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID quoteId) {
        return getQuote(UUID.fromString(jwt.getSubject()), quoteId);
    }

    private QuoteReceipt getQuote(UUID customerId, UUID quoteId) {
        List<QuoteReceipt> headers = jdbc.query("""
                SELECT q.id, q.fulfillment_type, q.requested_for, q.subtotal, currency.code AS currency,
                       q.preparation_seconds, q.queue_delay_seconds, q.total_eta_seconds, q.status, q.expires_at
                FROM wok.order_quotes q JOIN wok.currencies currency ON currency.id = q.currency_id
                WHERE q.id = ? AND q.customer_user_id = ?
                """, (rs, row) -> new QuoteReceipt(rs.getObject("id", UUID.class), rs.getString("fulfillment_type"),
                rs.getTimestamp("requested_for").toInstant(), rs.getBigDecimal("subtotal"), rs.getString("currency"),
                rs.getInt("preparation_seconds"), rs.getInt("queue_delay_seconds"), rs.getInt("total_eta_seconds"),
                rs.getString("status"), rs.getTimestamp("expires_at").toInstant(),
                "ACTIVE".equals(rs.getString("status")) && rs.getTimestamp("expires_at").toInstant().isAfter(Instant.now()),
                "La cotización es una estimación; el equipo volverá a validar capacidad e inventario antes de aceptar.", List.of()),
                quoteId, customerId);
        if (headers.isEmpty()) throw new AuthException(404, "No encontramos una cotización de tu cuenta.");
        QuoteReceipt header = headers.getFirst();
        expireIfNecessary(new QuoteHeader(header.quoteId(), null, header.status(), header.expiresAt()));
        List<QuoteLine> items = jdbc.query("""
                SELECT id, menu_item_id, name_snapshot, quantity, unit_price, line_total
                FROM wok.order_quote_items WHERE order_quote_id = ? ORDER BY created_at, id
                """, (rs, row) -> new QuoteLine(rs.getObject("menu_item_id", UUID.class), rs.getString("name_snapshot"),
                rs.getInt("quantity"), rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"),
                quoteModifiers(rs.getObject("id", UUID.class))), quoteId);
        String currentStatus = jdbc.queryForObject("SELECT status FROM wok.order_quotes WHERE id = ?", String.class, quoteId);
        return new QuoteReceipt(header.quoteId(), header.fulfillmentType(), header.requestedFor(), header.subtotal(),
                header.currency(), header.preparationSeconds(), header.queueDelaySeconds(), header.totalEtaSeconds(), currentStatus, header.expiresAt(),
                "ACTIVE".equals(currentStatus) && header.expiresAt().isAfter(Instant.now()), header.message(), items);
    }

    private List<QuoteModifier> quoteModifiers(UUID quoteItemId) {
        return jdbc.query("""
                SELECT group_name_snapshot, modifier_name_snapshot, price_delta
                FROM wok.order_quote_item_modifiers WHERE order_quote_item_id = ? ORDER BY group_name_snapshot, modifier_name_snapshot
                """, (rs, row) -> new QuoteModifier(rs.getString("group_name_snapshot"),
                rs.getString("modifier_name_snapshot"), rs.getBigDecimal("price_delta")), quoteItemId);
    }

    private void expireIfNecessary(QuoteHeader quote) {
        if ("ACTIVE".equals(quote.status()) && !quote.expiresAt().isAfter(Instant.now()))
            jdbc.update("UPDATE wok.order_quotes SET status = 'EXPIRED' WHERE id = ? AND status = 'ACTIVE'", quote.id());
    }

    private List<Product> loadProducts(List<QuoteLineRequest> lines) {
        List<Product> products = new ArrayList<>();
        for (QuoteLineRequest line : lines) {
            List<Product> found = jdbc.query("""
                    SELECT mi.id, mi.name, mi.price, mi.currency_id, currency.code AS currency,
                           mi.estimated_preparation_seconds, mi.preparation_area_id
                    FROM wok.menu_items mi JOIN wok.items item ON item.id = mi.item_id
                    JOIN wok.menu_categories category ON category.id = mi.category_id AND category.active = true
                    JOIN wok.preparation_areas area ON area.id = mi.preparation_area_id AND area.active = true
                    JOIN wok.currencies currency ON currency.id = mi.currency_id
                    WHERE mi.id = ? AND mi.status = 'ACTIVE' AND mi.visibility = 'PUBLIC' AND item.active = true
                    FOR SHARE OF mi, item, category, area
                    """, (rs, row) -> new Product(rs.getObject("id", UUID.class), rs.getString("name"),
                    rs.getBigDecimal("price"), rs.getObject("currency_id", UUID.class), rs.getString("currency"),
                    rs.getInt("estimated_preparation_seconds"), rs.getObject("preparation_area_id", UUID.class)), line.menuItemId());
            if (found.isEmpty()) return List.of();
            products.add(found.getFirst());
        }
        return products;
    }

    private static List<QuoteLineRequest> normalize(List<QuoteLineRequest> lines) {
        if (lines == null || lines.isEmpty() || lines.size() > RequestLimits.MAX_DISTINCT_MENU_LINES)
            throw new AuthException(400, "Revisa los productos enviados.");
        if (lines.stream().anyMatch(line -> line.menuItemId() == null)
                || new HashSet<>(lines.stream().map(QuoteLineRequest::menuItemId).toList()).size() != lines.size())
            throw new AuthException(422, "Envía cada producto una sola vez en la cotización.");
        return lines.stream().map(line -> new QuoteLineRequest(line.menuItemId(), line.quantity(),
                line.modifierIds() == null ? List.of() : line.modifierIds().stream().sorted().toList()))
                .sorted(Comparator.comparing(line -> line.menuItemId().toString())).toList();
    }

    private static BigDecimal effectivePrice(BigDecimal base, List<SelectedModifier> selected) {
        return selected.stream().map(SelectedModifier::priceDelta).reduce(base, BigDecimal::add);
    }

    static String fingerprint(FulfillmentType fulfillment, Instant requestedFor, List<QuoteLineRequest> lines) {
        StringBuilder canonical = new StringBuilder(fulfillment.name()).append('|').append(requestedFor.toEpochMilli());
        for (QuoteLineRequest line : lines) {
            canonical.append('|').append(line.menuItemId()).append(':').append(line.quantity()).append(':');
            line.modifierIds().forEach(id -> canonical.append(id).append(','));
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    public record QuoteRequest(@NotNull FulfillmentType fulfillmentType, @NotNull Instant requestedFor,
            @NotEmpty @Size(max = RequestLimits.MAX_DISTINCT_MENU_LINES) List<@Valid QuoteLineRequest> items) {}
    public record QuoteLineRequest(@NotNull UUID menuItemId, @Positive int quantity,
            @Size(max = 30) List<@NotNull UUID> modifierIds) {
        public QuoteLineRequest { modifierIds = modifierIds == null ? List.of() : List.copyOf(modifierIds); }
    }
    public enum FulfillmentType { PICKUP, DELIVERY }
    public record QuoteReceipt(UUID quoteId, String fulfillmentType, Instant requestedFor, BigDecimal subtotal,
            String currency, int preparationSeconds, int queueDelaySeconds, int totalEtaSeconds,
            String status, Instant expiresAt, boolean usable,
            String message, List<QuoteLine> items) {}
    public record QuoteLine(UUID menuItemId, String name, int quantity, BigDecimal unitPrice,
            BigDecimal lineTotal, List<QuoteModifier> modifiers) {}
    public record QuoteModifier(String group, String name, BigDecimal priceDelta) {}
    private record Product(UUID id, String name, BigDecimal price, UUID currencyId, String currency,
            int preparationSeconds, UUID stationId) {}
    private record QuoteHeader(UUID id, String fingerprint, String status, Instant expiresAt) {}
}
