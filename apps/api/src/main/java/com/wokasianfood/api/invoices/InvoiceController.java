package com.wokasianfood.api.invoices;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
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
import org.springframework.web.bind.annotation.PatchMapping;
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

    @PatchMapping("/invoices/{invoiceId}")
    public InvoiceService.InvoiceDetails updateDraft(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID invoiceId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody UpdateDraftRequest request) {
        return invoices.updateDraft(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, invoiceId, idempotencyKey, request);
    }

    @GetMapping("/invoices/{invoiceId}")
    public InvoiceService.InvoiceDetails details(@PathVariable UUID invoiceId) {
        return invoices.details(invoiceId);
    }

    public record CreateDraftRequest(@Size(max = 160) String customerName,
                                     @Size(max = 32) String customerTaxId,
                                     @DecimalMin(value = "0.01") BigDecimal total) {}

    public record UpdateDraftRequest(@Size(max = 160) String customerName,
                                     @Size(max = 32) String customerTaxId,
                                     @NotNull @DecimalMin(value = "0.01") BigDecimal total,
                                     @NotNull @Positive Integer expectedVersion) {}
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
        BigDecimal requestedTotal = request.total() == null ? null : money(request.total());
        String hash = fingerprint(accountId.toString(), customerName == null ? "" : customerName,
                customerTaxId == null ? "" : customerTaxId,
                requestedTotal == null ? "" : requestedTotal.toPlainString());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "INVOICE_DRAFT_CREATED",
                idempotencyKey, hash);
        if (claim.replay()) return details(claim.resourceId());

        requireAccount(accountId, true);
        if (customerName == null || customerTaxId == null) {
            RequestedBilling requestedBilling = requestedBilling(accountId);
            if (requestedBilling != null) {
                if (customerName == null) customerName = requestedBilling.customerName();
                if (customerTaxId == null) customerTaxId = requestedBilling.customerTaxId();
            }
        }
        Billing billing = billing(accountId);
        if (billing.lineCount() == 0) throw new AuthException(422, "La cuenta no tiene consumos facturables.");
        if (billing.currencyCount() != 1) throw new AuthException(422, "No se pueden facturar cuentas con varias monedas.");

        BigDecimal allocated = jdbc.queryForObject("""
            SELECT COALESCE(SUM(total), 0) FROM wok.invoices
            WHERE account_id = ? AND status IN ('DRAFT', 'QUEUED', 'ISSUED', 'UNKNOWN')
            """, BigDecimal.class, accountId);
        BigDecimal available = billing.total().subtract(allocated == null ? BigDecimal.ZERO : allocated);
        BigDecimal total = requestedTotal == null ? available : requestedTotal;
        if (total.signum() <= 0)
            throw new AuthException(409, "La cuenta ya no tiene saldo disponible para facturar.");
        if (total.compareTo(available) > 0)
            throw new AuthException(422, "El monto excede el saldo fiscal pendiente de la atención.");
        if (total.compareTo(billing.total()) > 0)
            throw new AuthException(422, "El monto excede el consumo facturable de la atención.");
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
        if (total.compareTo(billing.total()) == 0 && allocated.signum() == 0) {
            for (Line line : billing.lines()) {
                jdbc.update("""
                    INSERT INTO wok.invoice_items (invoice_id, order_item_id, description, quantity, unit_price)
                    VALUES (?, ?, ?, ?, ?)
                    """, invoiceId, line.orderItemId(), line.description(), line.quantity(), line.unitPrice());
            }
        } else {
            jdbc.update("""
                INSERT INTO wok.invoice_items (invoice_id, description, quantity, unit_price)
                VALUES (?, 'Consumo asignado de la atención', 1, ?)
                """, invoiceId, total);
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

    @Transactional
    public InvoiceDetails updateDraft(UUID actor, UUID requestId, UUID invoiceId, UUID idempotencyKey,
                                      InvoiceController.UpdateDraftRequest request) {
        BigDecimal total = money(request.total());
        String customerName = blankToNull(request.customerName());
        String customerTaxId = blankToNull(request.customerTaxId());
        String hash = fingerprint(invoiceId.toString(), customerName == null ? "" : customerName,
                customerTaxId == null ? "" : customerTaxId, total.toPlainString(),
                request.expectedVersion().toString());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "INVOICE_DRAFT_UPDATED",
                idempotencyKey, hash);
        if (claim.replay()) return details(claim.resourceId());

        List<UUID> invoiceAccounts = jdbc.query("SELECT account_id FROM wok.invoices WHERE id = ?",
                (rs, row) -> rs.getObject("account_id", UUID.class), invoiceId);
        if (invoiceAccounts.isEmpty()) throw new AuthException(404, "No encontramos la factura.");
        UUID accountId = invoiceAccounts.getFirst();
        requireAccount(accountId, true);
        List<InvoiceRow> lockedInvoices = jdbc.query("""
            SELECT status, row_version, total, customer_name, customer_tax_id
            FROM wok.invoices WHERE id = ? AND account_id = ? FOR UPDATE
            """, (rs, row) -> new InvoiceRow(rs.getString("status"), rs.getInt("row_version"),
                rs.getBigDecimal("total"), rs.getString("customer_name"), rs.getString("customer_tax_id")),
                invoiceId, accountId);
        if (lockedInvoices.isEmpty()) throw new AuthException(404, "No encontramos la factura.");
        InvoiceRow invoice = lockedInvoices.getFirst();
        if (!"DRAFT".equals(invoice.status()))
            throw new AuthException(409, "Sólo se pueden editar facturas en borrador.");
        if (invoice.rowVersion() != request.expectedVersion())
            throw new AuthException(409, "La factura cambió desde que la consultaste. Actualiza e inténtalo de nuevo.");

        Billing billing = billing(accountId);
        if (billing.lineCount() == 0)
            throw new AuthException(422, "La cuenta no tiene consumos facturables.");
        if (billing.currencyCount() != 1)
            throw new AuthException(422, "No se pueden facturar cuentas con varias monedas.");
        BigDecimal allocatedElsewhere = jdbc.queryForObject("""
            SELECT COALESCE(SUM(total), 0) FROM wok.invoices
            WHERE account_id = ? AND id <> ? AND status IN ('DRAFT', 'QUEUED', 'ISSUED', 'UNKNOWN')
            """, BigDecimal.class, accountId, invoiceId);
        BigDecimal available = billing.total().subtract(allocatedElsewhere == null
                ? BigDecimal.ZERO : allocatedElsewhere);
        if (total.compareTo(available) > 0 || total.compareTo(billing.total()) > 0)
            throw new AuthException(422, "El monto excede el saldo fiscal disponible de la atención.");

        BigDecimal subtotal = total.divide(BigDecimal.ONE.add(taxRate), 2, RoundingMode.HALF_UP);
        BigDecimal taxTotal = total.subtract(subtotal);
        int changed = jdbc.update("""
            UPDATE wok.invoices SET customer_name = ?, customer_tax_id = ?, subtotal = ?, tax_total = ?, total = ?,
                request_id = ?, updated_at = now(), updated_by = ?, row_version = row_version + 1
            WHERE id = ? AND status = 'DRAFT' AND row_version = ?
            """, customerName, customerTaxId, subtotal, taxTotal, total, requestId, actor, invoiceId,
                request.expectedVersion());
        if (changed != 1) throw new AuthException(409, "La factura cambió. Actualiza e inténtalo de nuevo.");

        jdbc.update("DELETE FROM wok.invoice_items WHERE invoice_id = ?", invoiceId);
        if (total.compareTo(billing.total()) == 0 && allocatedElsewhere.signum() == 0) {
            for (Line line : billing.lines()) {
                jdbc.update("""
                    INSERT INTO wok.invoice_items (invoice_id, order_item_id, description, quantity, unit_price)
                    VALUES (?, ?, ?, ?, ?)
                    """, invoiceId, line.orderItemId(), line.description(), line.quantity(), line.unitPrice());
            }
        } else {
            jdbc.update("""
                INSERT INTO wok.invoice_items (invoice_id, description, quantity, unit_price)
                VALUES (?, 'Consumo asignado de la atención', 1, ?)
                """, invoiceId, total);
        }
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, result, request_id)
            VALUES (?, 'INVOICE_DRAFT_UPDATED', 'INVOICE', ?,
                    jsonb_build_object('rowVersion', ?, 'total', ?, 'customerName', CAST(? AS text),
                        'customerTaxId', CAST(? AS text)),
                    jsonb_build_object('rowVersion', ?, 'total', ?, 'customerName', CAST(? AS text),
                        'customerTaxId', CAST(? AS text)),
                    'SUCCESS', ?)
            """, actor, invoiceId, invoice.rowVersion(), invoice.total(), invoice.customerName(),
                invoice.customerTaxId(), invoice.rowVersion() + 1, total, customerName, customerTaxId, requestId);
        idempotency.complete(actor.toString(), "INVOICE_DRAFT_UPDATED", idempotencyKey, invoiceId);
        return details(invoiceId);
    }

    InvoiceDetails details(UUID invoiceId) {
        List<InvoiceDetails> rows = jdbc.query("""
            SELECT i.id, i.account_id, a.name AS account_name, i.status, c.code AS currency,
                   i.tax_rate, i.subtotal, i.tax_total, i.total, i.customer_name, i.customer_tax_id,
                   i.authorization_number, i.dte_uuid, i.provider_ref, i.error, i.issued_at, i.row_version
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
                rs.getInt("row_version"),
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
                invoice.providerRef(), invoice.error(), invoice.issuedAt(), invoice.rowVersion(), items);
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
            WHERE o.account_id = ? AND o.status <> 'CANCELLED' AND oi.status = 'ACTIVE'
            """, (rs, row) -> new Billing(rs.getBigDecimal("total"), rs.getInt("line_count"),
                rs.getInt("currency_count"), rs.getObject("currency_id", UUID.class), List.of()), accountId);
        Billing summary = summaries.getFirst();
        List<Line> lines = jdbc.query("""
            SELECT oi.id, oi.name_snapshot, oi.quantity, oi.unit_price,
                   COALESCE((
                       SELECT string_agg(selected.modifier_name_snapshot, ', '
                               ORDER BY selected.group_name_snapshot, selected.modifier_name_snapshot,
                                        selected.modifier_id)
                       FROM wok.order_item_modifiers selected
                       WHERE selected.order_item_id = oi.id
                   ), '') AS modifier_snapshot
            FROM wok.order_items oi
            JOIN wok.orders o ON o.id = oi.order_id
            WHERE o.account_id = ? AND o.status <> 'CANCELLED' AND oi.status = 'ACTIVE'
            ORDER BY o.opened_at, o.id, oi.created_at, oi.id
            """, (rs, row) -> new Line(rs.getObject("id", UUID.class), rs.getString("name_snapshot"),
                rs.getInt("quantity"), rs.getBigDecimal("unit_price"), rs.getString("modifier_snapshot")), accountId);
        return new Billing(summary.total(), summary.lineCount(), summary.currencyCount(), summary.currencyId(), lines);
    }

    private RequestedBilling requestedBilling(UUID accountId) {
        List<RequestedBilling> requested = jdbc.query("""
            SELECT DISTINCT r.invoice_name, r.invoice_tax_id
            FROM wok.order_requests r
            JOIN wok.orders o ON o.id = r.order_id
            WHERE o.account_id = ? AND r.status = 'ACCEPTED' AND r.invoice_requested = true
            ORDER BY r.invoice_name, r.invoice_tax_id
            LIMIT 2
            """, (rs, row) -> new RequestedBilling(rs.getString("invoice_name"),
                rs.getString("invoice_tax_id")), accountId);
        if (requested.size() > 1)
            throw new AuthException(409, "La cuenta reúne solicitudes de factura con distintos datos. Confirma los datos manualmente.");
        return requested.isEmpty() ? null : requested.getFirst();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private BigDecimal money(BigDecimal value) {
        try { return value.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException invalidScale) {
            throw new AuthException(422, "El monto de la factura admite hasta dos decimales.");
        }
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

    private record InvoiceRow(String status, int rowVersion, BigDecimal total,
                              String customerName, String customerTaxId) {}

    private record RequestedBilling(String customerName, String customerTaxId) {}

    private record Line(UUID orderItemId, String name, int quantity, BigDecimal unitPrice, String modifiers) {
        private String description() {
            return modifiers == null || modifiers.isBlank() ? name : name + " (" + modifiers + ")";
        }
    }

    public record InvoiceSummary(UUID invoiceId, String status, String currency, BigDecimal subtotal,
                                 BigDecimal taxTotal, BigDecimal total, String customerName,
                                 String authorizationNumber, Instant issuedAt, int itemCount) {}

    public record InvoiceLine(UUID id, UUID orderItemId, String description, int quantity,
                              BigDecimal unitPrice, BigDecimal lineTotal) {}

    public record InvoiceDetails(UUID invoiceId, UUID accountId, String accountName, String status, String currency,
                                 BigDecimal taxRate, BigDecimal subtotal, BigDecimal taxTotal, BigDecimal total,
                                 String customerName, String customerTaxId, String authorizationNumber, UUID dteUuid,
                                 String providerRef, String error, Instant issuedAt, int rowVersion,
                                 List<InvoiceLine> items) {}
}
