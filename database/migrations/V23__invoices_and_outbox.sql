-- Facturacion electronica (mock): borradores por atencion y emision asincrona via outbox.
-- No hay certificacion real ante la SAT; el proveedor fiscal es un puerto con adaptador mock.
SET search_path = wok, public;

INSERT INTO permissions (code, description)
VALUES ('invoices:manage', 'Emitir y consultar facturas del restaurante')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('OPERATIONAL', 'ADMIN')
  AND p.code = 'invoices:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES order_accounts(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
    tax_rate NUMERIC(5,4) NOT NULL,
    subtotal NUMERIC(14,2) NOT NULL,
    tax_total NUMERIC(14,2) NOT NULL,
    total NUMERIC(14,2) NOT NULL,
    customer_name TEXT,
    customer_tax_id TEXT,
    authorization_number TEXT,
    dte_uuid UUID,
    provider_ref TEXT,
    error TEXT,
    issued_at TIMESTAMPTZ,
    issued_by UUID REFERENCES users(id),
    request_id UUID,
    row_version INTEGER NOT NULL DEFAULT 1,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID,
    CONSTRAINT ck_invoices_status CHECK (status IN ('DRAFT', 'QUEUED', 'ISSUED', 'FAILED')),
    CONSTRAINT ck_invoices_amounts CHECK (subtotal >= 0 AND tax_total >= 0 AND total >= 0),
    CONSTRAINT ck_invoices_total CHECK (subtotal + tax_total = total),
    CONSTRAINT ck_invoices_tax_rate CHECK (tax_rate >= 0 AND tax_rate < 1),
    CONSTRAINT ck_invoices_customer_name CHECK (customer_name IS NULL OR length(btrim(customer_name)) BETWEEN 1 AND 160),
    CONSTRAINT ck_invoices_customer_tax_id CHECK (customer_tax_id IS NULL OR length(btrim(customer_tax_id)) BETWEEN 1 AND 32),
    CONSTRAINT ck_invoices_issued CHECK (status <> 'ISSUED' OR issued_at IS NOT NULL),
    CONSTRAINT ck_invoices_row_version CHECK (row_version > 0)
);
CREATE INDEX ix_invoices_account_id ON invoices(account_id, created_at);
CREATE INDEX ix_invoices_status ON invoices(status, created_at);
CREATE UNIQUE INDEX ux_invoices_authorization ON invoices(authorization_number) WHERE authorization_number IS NOT NULL;
CREATE UNIQUE INDEX ux_invoices_dte ON invoices(dte_uuid) WHERE dte_uuid IS NOT NULL;

CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    line_total NUMERIC(14,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_invoice_items_quantity CHECK (quantity > 0),
    CONSTRAINT ck_invoice_items_unit_price CHECK (unit_price >= 0),
    CONSTRAINT ck_invoice_items_description CHECK (length(btrim(description)) > 0)
);
CREATE INDEX ix_invoice_items_invoice_id ON invoice_items(invoice_id);
