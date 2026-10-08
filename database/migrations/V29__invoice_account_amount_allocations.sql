-- Permite facturar una atencion en varios documentos sin volver a asignar importes.
-- La asignacion se serializa con el bloqueo de la cuenta en InvoiceService.
SET search_path = wok, public;

DROP INDEX IF EXISTS ux_invoices_active_account;

CREATE INDEX ix_invoices_fiscal_allocations
    ON invoices(account_id, status, created_at)
    WHERE status IN ('DRAFT', 'QUEUED', 'ISSUED');
