-- An uncertain response from a fiscal provider must be reconciled before another certification attempt.
ALTER TABLE wok.invoices DROP CONSTRAINT ck_invoices_status;
ALTER TABLE wok.invoices ADD CONSTRAINT ck_invoices_status
    CHECK (status IN ('DRAFT', 'QUEUED', 'ISSUED', 'FAILED', 'UNKNOWN'));

CREATE INDEX ix_invoices_unknown ON wok.invoices (updated_at, id) WHERE status = 'UNKNOWN';
