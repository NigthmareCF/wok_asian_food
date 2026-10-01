-- Delivery details belong only to the pending request; no order/payment is created here.
SET search_path = wok, public;

ALTER TABLE order_requests DROP CONSTRAINT ck_order_requests_fulfillment;
ALTER TABLE order_requests ADD CONSTRAINT ck_order_requests_fulfillment
    CHECK (fulfillment_type IN ('PICKUP', 'DELIVERY'));

ALTER TABLE order_requests
    ADD COLUMN delivery_address TEXT,
    ADD COLUMN delivery_reference TEXT,
    ADD COLUMN contact_phone TEXT,
    ADD COLUMN payment_preference TEXT;

ALTER TABLE order_requests
    ADD CONSTRAINT ck_order_requests_delivery_details CHECK (
        (fulfillment_type = 'PICKUP' AND delivery_address IS NULL AND delivery_reference IS NULL
            AND contact_phone IS NULL AND payment_preference IS NULL)
        OR
        (fulfillment_type = 'DELIVERY'
            AND delivery_address IS NOT NULL AND length(btrim(delivery_address)) BETWEEN 5 AND 500
            AND (delivery_reference IS NULL OR length(delivery_reference) <= 300)
            AND contact_phone IS NOT NULL AND contact_phone ~ '^[0-9+() .-]{7,32}$'
            AND payment_preference IS NOT NULL
            AND payment_preference IN ('CASH_ON_DELIVERY', 'ONLINE_PAYMENT_REQUESTED'))
    );

ALTER TABLE order_requests
    ADD CONSTRAINT ck_order_requests_delivery_payment CHECK (
        payment_preference IS NULL OR payment_preference IN ('CASH_ON_DELIVERY', 'ONLINE_PAYMENT_REQUESTED')
    );
