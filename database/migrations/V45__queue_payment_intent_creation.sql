-- Provider calls happen after the intent transaction commits, through the durable outbox.
SET search_path = wok, public;

ALTER TABLE payment_intents ALTER COLUMN provider_reference DROP NOT NULL;
ALTER TABLE payment_intents DROP CONSTRAINT ck_payment_intents_reference;
ALTER TABLE payment_intents ADD CONSTRAINT ck_payment_intents_reference CHECK (
    provider_reference IS NULL OR length(btrim(provider_reference)) BETWEEN 1 AND 200
);

CREATE INDEX ix_payment_intent_outbox_poll
    ON outbox_events (next_attempt_at, occurred_at, id)
    WHERE event_type = 'PAYMENT_INTENT_CREATION_REQUESTED' AND published_at IS NULL;
