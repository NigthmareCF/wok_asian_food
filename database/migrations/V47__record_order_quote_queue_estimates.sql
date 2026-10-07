SET search_path = wok, public;

ALTER TABLE order_quotes
    ADD COLUMN queue_delay_seconds INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN total_eta_seconds INTEGER NOT NULL DEFAULT 0;

UPDATE order_quotes SET total_eta_seconds = preparation_seconds;

ALTER TABLE order_quotes
    ADD CONSTRAINT ck_order_quotes_queue_delay CHECK (queue_delay_seconds BETWEEN 0 AND 86400),
    ADD CONSTRAINT ck_order_quotes_total_eta CHECK (total_eta_seconds BETWEEN 0 AND 86400);
