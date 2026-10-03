package com.wokasianfood.api.invoices;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Borradores de factura por atencion (cuenta); la emision se agrega en el controlador de emision. */
@RestController
@RequestMapping("/api/v1/operational")
@PreAuthorize("hasAuthority('invoices:manage')")
public class InvoiceController {
    private final InvoiceService invoices;

    public InvoiceController(InvoiceService invoices) { this.invoices = invoices; }

    @GetMapping("/accounts/{accountId}/invoices")
    public List<InvoiceService.InvoiceSummary> listByAccount(@PathVariable UUID accountId) {
        return invoices.listByAccount(accountId);
    }

    @PostMapping("/accounts/{accountId}/invoices")
    @ResponseStatus(HttpStatus.CREATED)
    public InvoiceService.InvoiceDetails createDraft(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID accountId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody CreateDraftRequest request) {
        return invoices.createDraft(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, accountId, idempotencyKey, request);
    }

    @GetMapping("/invoices/{invoiceId}")
    public InvoiceService.InvoiceDetails details(@PathVariable UUID invoiceId) {
        return invoices.details(invoiceId);
    }

    public record CreateDraftRequest(@Size(max = 160) String customerName,
                                     @Size(max = 32) String customerTaxId) {}
}

@Service
class InvoiceService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;
    private final BigDecimal taxRate;

    InvoiceService(JdbcTemplate jdbc, IdempotencyStore idempotency,
                   @Value("${wok.fiscal.tax-rate:0.12}") BigDecimal taxRate) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
        this.taxRate = taxRate;
    }

    @Transactional
    public InvoiceDetails createDraft(UUID actor, UUID requestId, UUID accountId, UUID idempotencyKey,
                                      InvoiceController.CreateDraftRequest request) {
        String customerName = blankToNull(request.customerName());
        String customerTaxId = blankToNull(request.customerTaxId());
        String hash = fingerprint(accountId.toString(), customerName == null ? "" : customerName,
                customerTaxId == null ? "" : customerTaxId);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "INVOICE_DRAFT_CREATED",
                idempotencyKey, hash);
        if (claim.replay()) return details(claim.resourceId());

        requireAccount(accountId, true);
        Billing billing = billing(accountId);
        if (billing.lineCount() == 0) throw new AuthException(422, "La cuenta no tiene consumos facturables.");
        if (billing.currencyCount() != 1) throw new AuthException(422, "No se pueden facturar cuentas con varias monedas.");

        BigDecimal total = billing.total();
        BigDecimal subtotal = total.divide(BigDecimal.ONE.add(taxRate), 2, RoundingMode.HALF_UP);
        BigDecimal taxTotal = total.subtract(subtotal);

        UUID invoiceId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.invoices
                (id, account_id, status, currency_id, tax_rate, subtotal, tax_total, total,
                 customer_name, customer_tax_id, request_id, created_by, updated_by)
            VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, invoiceId, accountId, billing.currencyId(), taxRate, subtotal, taxTotal, total,
            customerName, customerTaxId, requestId, actor, actor);
        for (Line line : billing.lines()) {
            jdbc.update("""
                INSERT INTO wok.invoice_items (invoice_id, order_item_id, description, quantity, unit_price)
                VALUES (?, ?, ?, ?, ?)
                """, invoiceId, line.orderItemId(), line.description(), line.quantity(), line.unitPrice());
        }
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'INVOICE_DRAFT_CREATED', 'INVOICE', ?,
                    jsonb_build_object('accountId', ?, 'total', ?), 'SUCCESS', ?)
            """, actor, invoiceId, accountId, total, requestId);
        idempotency.complete(actor.toString(), "INVOICE_DRAFT_CREATED", idempotencyKey, invoiceId);
        return details(invoiceId);
    }

    InvoiceDetails details(UUID invoiceId) {
        List<InvoiceDetails> rows = jdbc.query("""
            SELECT i.id, i.account_id, a.name AS account_name, i.status, c.code AS currency,
                   i.tax_rate, i.subtotal, i.tax_total, i.total, i.customer_name, i.customer_tax_id,
                   i.authorization_number, i.dte_uuid, i.provider_ref, i.error, i.issued_at
            FROM wok.invoices i
            JOIN wok.order_accounts a ON a.id = i.account_id
            JOIN wok.currencies c ON c.id = i.currency_id
            WHERE i.id = ?
            """, (rs, row) -> new InvoiceDetails(rs.getObject("id", UUID.class), rs.getObject("account_id", UUID.class),
                rs.getString("account_name"), rs.getString("status"), rs.getString("currency"),
                rs.getBigDecimal("tax_rate"), rs.getBigDecimal("subtotal"), rs.getBigDecimal("tax_total"),
                rs.getBigDecimal("total"), rs.getString("customer_name"), rs.getString("customer_tax_id"),
                rs.getString("authorization_number"), rs.getObject("dte_uuid", UUID.class),
                rs.getString("provider_ref"), rs.getString("error"),
                rs.getTimestamp("issued_at") == null ? null : rs.getTimestamp("issued_at").toInstant(),
                List.of()), invoiceId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la factura.");
        InvoiceDetails invoice = rows.getFirst();
        List<InvoiceLine> items = jdbc.query("""
            SELECT id, order_item_id, description, quantity, unit_price, line_total
            FROM wok.invoice_items WHERE invoice_id = ? ORDER BY created_at, id
            """, (rs, row) -> new InvoiceLine(rs.getObject("id", UUID.class), rs.getObject("order_item_id", UUID.class),
                rs.getString("description"), rs.getInt("quantity"), rs.getBigDecimal("unit_price"),
                rs.getBigDecimal("line_total")), invoiceId);
        return new InvoiceDetails(invoice.invoiceId(), invoice.accountId(), invoice.accountName(), invoice.status(),
                invoice.currency(), invoice.taxRate(), invoice.subtotal(), invoice.taxTotal(), invoice.total(),
                invoice.customerName(), invoice.customerTaxId(), invoice.authorizationNumber(), invoice.dteUuid(),
                invoice.providerRef(), invoice.error(), invoice.issuedAt(), items);
    }

    List<InvoiceSummary> listByAccount(UUID accountId) {
        requireAccount(accountId, false);
        return jdbc.query("""
            SELECT i.id, i.status, c.code AS currency, i.subtotal, i.tax_total, i.total,
                   i.customer_name, i.authorization_number, i.issued_at,
                   (SELECT count(*) FROM wok.invoice_items t WHERE t.invoice_id = i.id) AS item_count
            FROM wok.invoices i
            JOIN wok.currencies c ON c.id = i.currency_id
            WHERE i.account_id = ? ORDER BY i.created_at, i.id
            """, (rs, row) -> new InvoiceSummary(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getString("currency"), rs.getBigDecimal("subtotal"), rs.getBigDecimal("tax_total"),
                rs.getBigDecimal("total"), rs.getString("customer_name"), rs.getString("authorization_number"),
                rs.getTimestamp("issued_at") == null ? null : rs.getTimestamp("issued_at").toInstant(),
                rs.getInt("item_count")), accountId);
    }

    private void requireAccount(UUID accountId, boolean lock) {
        List<UUID> rows = jdbc.query("SELECT id FROM wok.order_accounts WHERE id = ?" + (lock ? " FOR UPDATE" : ""),
                (rs, row) -> rs.getObject("id", UUID.class), accountId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la cuenta.");
    }

    private Billing billing(UUID accountId) {
        List<Billing> summaries = jdbc.query("""
            SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total,
                   COUNT(oi.id) AS line_count,
                   COUNT(DISTINCT o.currency_id) AS currency_count,
                   (array_agg(DISTINCT o.currency_id))[1] AS currency_id
            FROM wok.order_items oi
            JOIN wok.orders o ON o.id = oi.order_id
            WHERE o.account_id = ? AND o.status <> 'CANCELLED'
            """, (rs, row) -> new Billing(rs.getBigDecimal("total"), rs.getInt("line_count"),
                rs.getInt("currency_count"), rs.getObject("currency_id", UUID.class), List.of()), accountId);
        Billing summary = summaries.getFirst();
        List<Line> lines = jdbc.query("""
            SELECT oi.id, oi.name_snapshot, oi.quantity, oi.unit_price
            FROM wok.order_items oi
            JOIN wok.orders o ON o.id = oi.order_id
            WHERE o.account_id = ? AND o.status <> 'CANCELLED'
            ORDER BY o.opened_at, o.id, oi.created_at, oi.id
            """, (rs, row) -> new Line(rs.getObject("id", UUID.class), rs.getString("name_snapshot"),
                rs.getInt("quantity"), rs.getBigDecimal("unit_price")), accountId);
        return new Billing(summary.total(), summary.lineCount(), summary.currencyCount(), summary.currencyId(), lines);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String fingerprint(String... parts) {
        String canonical = String.join("\n", parts);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private record Billing(BigDecimal total, int lineCount, int currencyCount, UUID currencyId, List<Line> lines) {}

    private record Line(UUID orderItemId, String description, int quantity, BigDecimal unitPrice) {}

    public record InvoiceSummary(UUID invoiceId, String status, String currency, BigDecimal subtotal,
                                 BigDecimal taxTotal, BigDecimal total, String customerName,
                                 String authorizationNumber, Instant issuedAt, int itemCount) {}

    public record InvoiceLine(UUID id, UUID orderItemId, String description, int quantity,
                              BigDecimal unitPrice, BigDecimal lineTotal) {}

    public record InvoiceDetails(UUID invoiceId, UUID accountId, String accountName, String status, String currency,
                                 BigDecimal taxRate, BigDecimal subtotal, BigDecimal taxTotal, BigDecimal total,
                                 String customerName, String customerTaxId, String authorizationNumber, UUID dteUuid,
                                 String providerRef, String error, Instant issuedAt, List<InvoiceLine> items) {}
}
