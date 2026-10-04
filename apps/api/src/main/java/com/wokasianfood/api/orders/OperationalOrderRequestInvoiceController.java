package com.wokasianfood.api.orders;

import com.wokasianfood.api.identity.AuthException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Exposes customer tax data only to staff authorized to manage invoicing. */
@RestController
@RequestMapping("/api/v1/operational/order-requests")
@PreAuthorize("hasAuthority('invoices:manage')")
public class OperationalOrderRequestInvoiceController {
    private final JdbcTemplate jdbc;

    public OperationalOrderRequestInvoiceController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/{requestId}/invoice-request")
    public InvoiceRequestDetails invoiceRequest(@PathVariable UUID requestId) {
        List<InvoiceRequestDetails> result = jdbc.query("""
            SELECT id, fulfillment_type, invoice_requested, invoice_name, invoice_tax_id
            FROM wok.order_requests
            WHERE id = ?
            """, (rs, row) -> new InvoiceRequestDetails(rs.getObject("id", UUID.class),
                rs.getString("fulfillment_type"), rs.getBoolean("invoice_requested"),
                rs.getString("invoice_name"), rs.getString("invoice_tax_id")), requestId);
        if (result.isEmpty()) throw new AuthException(404, "No encontramos esa solicitud.");
        return result.getFirst();
    }

    public record InvoiceRequestDetails(UUID requestId, String fulfillmentType, boolean invoiceRequested,
            String invoiceName, String invoiceTaxId) {}
}
