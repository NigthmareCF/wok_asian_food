-- Delivery customers may choose transfer before delivery and submit evidence for staff review.
-- Evidence remains separate from payment; only an operational verification records a transfer.
SET search_path = wok, public;

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
        AND payment_preference IN ('CASH_ON_DELIVERY', 'TRANSFER_IN_ADVANCE', 'ONLINE_PAYMENT_REQUESTED'))
);

ALTER TABLE order_requests DROP CONSTRAINT ck_order_requests_delivery_payment;
ALTER TABLE order_requests ADD CONSTRAINT ck_order_requests_delivery_payment CHECK (
    payment_preference IS NULL OR payment_preference IN
        ('CASH_AT_PICKUP', 'CARD_AT_PICKUP', 'TRANSFER_AT_PICKUP',
         'CASH_ON_DELIVERY', 'TRANSFER_IN_ADVANCE', 'ONLINE_PAYMENT_REQUESTED')
);
