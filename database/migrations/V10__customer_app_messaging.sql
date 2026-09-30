-- First local Customer App conversation slice; provider webhooks remain a separate adapter.
SET search_path = wok, public;

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE RESTRICT,
    channel TEXT NOT NULL,
    external_thread_id TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    handling_mode TEXT NOT NULL DEFAULT 'HUMAN',
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_conversations_channel CHECK (channel IN ('APP', 'WEB', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'OTHER')),
    CONSTRAINT ck_conversations_status CHECK (status IN ('OPEN', 'WAITING', 'CLOSED')),
    CONSTRAINT ck_conversations_handling_mode CHECK (handling_mode IN ('AI', 'HUMAN')),
    CONSTRAINT ck_conversations_row_version CHECK (row_version > 0),
    CONSTRAINT ck_conversations_closed_at CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL)),
    CONSTRAINT uq_conversations_external_thread UNIQUE (channel, external_thread_id)
);

CREATE UNIQUE INDEX ux_app_conversations_active_customer
    ON conversations(customer_id)
    WHERE channel = 'APP' AND status IN ('OPEN', 'WAITING');
CREATE INDEX ix_conversations_customer_history ON conversations(customer_id, updated_at DESC, id DESC);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
    sender_type TEXT NOT NULL,
    sender_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    direction TEXT NOT NULL,
    body TEXT NOT NULL,
    external_message_id TEXT,
    idempotency_key UUID,
    status TEXT NOT NULL DEFAULT 'SENT',
    reply_to_message_id UUID REFERENCES messages(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_messages_sender_type CHECK (sender_type IN ('CUSTOMER', 'HUMAN', 'AI', 'SYSTEM')),
    CONSTRAINT ck_messages_sender_user CHECK ((sender_type = 'SYSTEM' AND sender_user_id IS NULL) OR (sender_type <> 'SYSTEM' AND sender_user_id IS NOT NULL)),
    CONSTRAINT ck_messages_direction CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    CONSTRAINT ck_messages_status CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
    CONSTRAINT ck_messages_body CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    CONSTRAINT ck_messages_customer_direction CHECK (sender_type <> 'CUSTOMER' OR direction = 'INBOUND'),
    CONSTRAINT ck_messages_human_direction CHECK (sender_type <> 'HUMAN' OR direction = 'OUTBOUND'),
    CONSTRAINT uq_messages_external_id UNIQUE (conversation_id, external_message_id)
);

CREATE UNIQUE INDEX ux_messages_idempotency ON messages(conversation_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX ix_messages_conversation_history ON messages(conversation_id, created_at, id);
