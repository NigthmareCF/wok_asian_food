-- Preserve customer payment and invoice preferences with the request snapshot.
-- Preferences are not payments and invoice data does not issue a fiscal document.
SET search_path = wok, public;

ALTER TABLE order_requests
    ADD COLUMN invoice_requested BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN invoice_name TEXT,
    ADD COLUMN invoice_tax_id TEXT;

ALTER TABLE order_requests DROP CONSTRAINT ck_order_requests_delivery_details;
ALTER TABLE order_requests ADD CONSTRAINT ck_order_requests_delivery_details CHECK (
    (fulfillment_type = 'PICKUP'
        AND delivery_address IS NULL AND delivery_reference IS NULL AND contact_phone IS NULL
        AND (payment_preference IS NULL OR payment_preference IN
            ('CASH_AT_PICKUP', 'CARD_AT_PICKUP', 'TRANSFER_AT_PICKUP')))
    OR
    (fulfillment_type = 'DELIVERY'
        AND delivery_address IS NOT NULL AND length(btrim(delivery_address)) BETWEEN 5 AND 500
        AND (delivery_reference IS NULL OR length(delivery_reference) <= 300)
        AND contact_phone IS NOT NULL AND contact_phone ~ '^[0-9+() .-]{7,32}$'
        AND payment_preference IS NOT NULL
        AND payment_preference IN ('CASH_ON_DELIVERY', 'ONLINE_PAYMENT_REQUESTED'))
);

ALTER TABLE order_requests DROP CONSTRAINT ck_order_requests_delivery_payment;
ALTER TABLE order_requests ADD CONSTRAINT ck_order_requests_delivery_payment CHECK (
    payment_preference IS NULL OR payment_preference IN
        ('CASH_AT_PICKUP', 'CARD_AT_PICKUP', 'TRANSFER_AT_PICKUP',
         'CASH_ON_DELIVERY', 'ONLINE_PAYMENT_REQUESTED')
);

ALTER TABLE order_requests ADD CONSTRAINT ck_order_requests_invoice_request CHECK (
    (invoice_requested = false AND invoice_name IS NULL AND invoice_tax_id IS NULL)
    OR
    (invoice_requested = true
        AND invoice_name IS NOT NULL AND length(btrim(invoice_name)) BETWEEN 1 AND 150
        AND invoice_tax_id IS NOT NULL AND length(btrim(invoice_tax_id)) BETWEEN 1 AND 32)
);
