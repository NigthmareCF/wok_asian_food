package com.wokasianfood.api.invoices;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Client-owned view of issued invoices for accounts containing only the customer's accepted orders. */
@RestController
@RequestMapping("/api/v1/client/invoices")
@PreAuthorize("hasRole('CLIENT')")
public class ClientInvoiceController {
    private static final String OWNED_INVOICE = """
        EXISTS (
            SELECT 1 FROM wok.orders own_order
            JOIN wok.order_requests own_request ON own_request.order_id = own_order.id
            WHERE own_order.account_id = i.account_id
              AND own_request.customer_user_id = ? AND own_request.status = 'ACCEPTED'
        )
        AND NOT EXISTS (
            SELECT 1 FROM wok.orders other_order
            WHERE other_order.account_id = i.account_id
              AND NOT EXISTS (
                SELECT 1 FROM wok.order_requests owner_request
                WHERE owner_request.order_id = other_order.id
                  AND owner_request.customer_user_id = ? AND owner_request.status = 'ACCEPTED'
              )
        )
        """;

    private final JdbcTemplate jdbc;

    public ClientInvoiceController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<ClientInvoiceSummary> list(@AuthenticationPrincipal Jwt jwt) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        return jdbc.query("""
            SELECT DISTINCT i.id, i.status, c.code AS currency, i.total, i.authorization_number,
                   i.dte_uuid, i.issued_at, i.customer_name, i.customer_tax_id, i.provider_ref
            FROM wok.invoices i
            JOIN wok.currencies c ON c.id = i.currency_id
            WHERE i.status = 'ISSUED' AND
            """ + OWNED_INVOICE + """
            ORDER BY i.issued_at DESC, i.id DESC LIMIT 100
            """, (rs, row) -> new ClientInvoiceSummary(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getString("currency"), rs.getBigDecimal("total"), rs.getString("authorization_number"),
                rs.getObject("dte_uuid", UUID.class), rs.getTimestamp("issued_at").toInstant(),
                rs.getString("customer_name"), rs.getString("customer_tax_id"), "MOCK".equals(rs.getString("provider_ref"))),
            customerId, customerId);
    }

    @GetMapping("/{invoiceId}")
    public ClientInvoiceDetails details(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID invoiceId) {
        UUID customerId = UUID.fromString(jwt.getSubject());
        List<ClientInvoiceDetails> found = jdbc.query("""
            SELECT i.id, i.status, c.code AS currency, i.total, i.subtotal, i.tax_total,
                   i.authorization_number, i.dte_uuid, i.issued_at, i.customer_name, i.customer_tax_id,
                   i.provider_ref
            FROM wok.invoices i
            JOIN wok.currencies c ON c.id = i.currency_id
            WHERE i.id = ? AND i.status = 'ISSUED' AND
            """ + OWNED_INVOICE,
            (rs, row) -> new ClientInvoiceDetails(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getString("currency"), rs.getBigDecimal("total"), rs.getBigDecimal("subtotal"),
                rs.getBigDecimal("tax_total"), rs.getString("authorization_number"),
                rs.getObject("dte_uuid", UUID.class), rs.getTimestamp("issued_at").toInstant(),
                rs.getString("customer_name"), rs.getString("customer_tax_id"),
                "MOCK".equals(rs.getString("provider_ref")), List.of()), invoiceId, customerId, customerId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos una factura emitida para tu cuenta.");
        List<ClientInvoiceLine> lines = jdbc.query("""
            SELECT description, quantity, unit_price, line_total
            FROM wok.invoice_items WHERE invoice_id = ? ORDER BY created_at, id
            """, (rs, row) -> new ClientInvoiceLine(rs.getString("description"), rs.getInt("quantity"),
                rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total")), invoiceId);
        ClientInvoiceDetails invoice = found.getFirst();
        return new ClientInvoiceDetails(invoice.invoiceId(), invoice.status(), invoice.currency(), invoice.total(),
                invoice.subtotal(), invoice.taxTotal(), invoice.authorizationNumber(), invoice.dteUuid(),
                invoice.issuedAt(), invoice.customerName(), invoice.customerTaxId(), invoice.testDocument(), lines);
    }

    public record ClientInvoiceSummary(UUID invoiceId, String status, String currency, BigDecimal total,
            String authorizationNumber, UUID dteUuid, Instant issuedAt, String customerName,
            String customerTaxId, boolean testDocument) {}
    public record ClientInvoiceDetails(UUID invoiceId, String status, String currency, BigDecimal total,
            BigDecimal subtotal, BigDecimal taxTotal, String authorizationNumber, UUID dteUuid,
            Instant issuedAt, String customerName, String customerTaxId, boolean testDocument,
            List<ClientInvoiceLine> items) {}
    public record ClientInvoiceLine(String description, int quantity, BigDecimal unitPrice, BigDecimal lineTotal) {}
}
