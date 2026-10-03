-- Impide emitir mas de una factura activa (en emision o emitida) para la misma atencion.
-- Protege ante reintentos o concurrencia que intenten facturar dos veces la misma cuenta.
SET search_path = wok, public;

CREATE UNIQUE INDEX ux_invoices_active_account
    ON invoices(account_id)
    WHERE status IN ('QUEUED', 'ISSUED');
